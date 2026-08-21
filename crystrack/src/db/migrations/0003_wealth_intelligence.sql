-- CrysTrack Wealth Intelligence foundation.
-- Apply after 0002_adaptive_experience.sql.
-- This migration keeps the existing finance tables intact and extends them safely.

ALTER TABLE money_entries
  ADD COLUMN IF NOT EXISTS flow_kind VARCHAR(40),
  ADD COLUMN IF NOT EXISTS debt_id UUID,
  ADD COLUMN IF NOT EXISTS expected_flow_id UUID;

UPDATE money_entries
SET flow_kind = type::text
WHERE flow_kind IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'money_entries_flow_kind_check'
  ) THEN
    ALTER TABLE money_entries
      ADD CONSTRAINT money_entries_flow_kind_check
      CHECK (
        flow_kind IS NULL OR flow_kind IN (
          'income',
          'expense',
          'saving',
          'savings_release',
          'borrow',
          'lend',
          'liability_repayment',
          'receivable_repayment',
          'transfer'
        )
      ) NOT VALID;
    ALTER TABLE money_entries VALIDATE CONSTRAINT money_entries_flow_kind_check;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS money_entries_user_date_idx
  ON money_entries(user_id, date DESC);

CREATE INDEX IF NOT EXISTS money_entries_user_flow_kind_idx
  ON money_entries(user_id, flow_kind);

CREATE TABLE IF NOT EXISTS wealth_debts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('receivable', 'liability')),
  counterparty VARCHAR(255) NOT NULL,
  original_amount DECIMAL(12,2) NOT NULL CHECK (original_amount > 0),
  outstanding_amount DECIMAL(12,2) NOT NULL CHECK (outstanding_amount >= 0),
  due_date TIMESTAMPTZ,
  note TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wealth_debts_user_status_idx
  ON wealth_debts(user_id, status, created_at DESC);

ALTER TABLE wealth_debts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wealth_debt_user_isolation ON wealth_debts;
CREATE POLICY wealth_debt_user_isolation ON wealth_debts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS wealth_expected_flows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('income', 'expense')),
  title VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  amount_min DECIMAL(12,2) NOT NULL CHECK (amount_min > 0),
  amount_max DECIMAL(12,2),
  frequency VARCHAR(20) NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('one_off', 'weekly', 'monthly', 'quarterly', 'yearly', 'irregular')),
  expected_on TIMESTAMPTZ,
  timing_hint VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  last_actual_amount DECIMAL(12,2),
  last_confirmed_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (amount_max IS NULL OR amount_max >= amount_min)
);

CREATE INDEX IF NOT EXISTS wealth_expected_flows_user_status_idx
  ON wealth_expected_flows(user_id, status, created_at DESC);

ALTER TABLE wealth_expected_flows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wealth_expected_flow_user_isolation ON wealth_expected_flows;
CREATE POLICY wealth_expected_flow_user_isolation ON wealth_expected_flows
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE money_entries
  DROP CONSTRAINT IF EXISTS money_entries_debt_id_fkey,
  DROP CONSTRAINT IF EXISTS money_entries_expected_flow_id_fkey;

ALTER TABLE money_entries
  ADD CONSTRAINT money_entries_debt_id_fkey
    FOREIGN KEY (debt_id) REFERENCES wealth_debts(id) ON DELETE SET NULL,
  ADD CONSTRAINT money_entries_expected_flow_id_fkey
    FOREIGN KEY (expected_flow_id) REFERENCES wealth_expected_flows(id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS wealth_debts_touch_updated_at ON wealth_debts;
CREATE TRIGGER wealth_debts_touch_updated_at
BEFORE UPDATE ON wealth_debts
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS wealth_expected_flows_touch_updated_at ON wealth_expected_flows;
CREATE TRIGGER wealth_expected_flows_touch_updated_at
BEFORE UPDATE ON wealth_expected_flows
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Savings allocations affect spendable cash but remain part of net position.
-- This helper supports both adding to and releasing from a savings target.
CREATE OR REPLACE FUNCTION adjust_target(target_uuid UUID, amount_delta NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF amount_delta IS NULL OR amount_delta = 0 THEN
    RAISE EXCEPTION 'amount_delta must not be zero';
  END IF;

  UPDATE finance_targets
  SET current_amount = GREATEST(0, COALESCE(current_amount, 0) + amount_delta)
  WHERE id = target_uuid
    AND user_id = auth.uid()
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Savings target not found or not accessible';
  END IF;
END;
$$;

-- Create a receivable or liability and the matching cash movement atomically.
CREATE OR REPLACE FUNCTION create_wealth_debt(
  p_kind TEXT,
  p_counterparty TEXT,
  p_amount NUMERIC,
  p_due_date TIMESTAMPTZ DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS wealth_debts
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_debt wealth_debts;
  v_entry_type money_type := 'transfer';
  v_flow_kind TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_kind NOT IN ('receivable', 'liability') THEN
    RAISE EXCEPTION 'Invalid debt kind';
  END IF;
  IF p_counterparty IS NULL OR btrim(p_counterparty) = '' THEN
    RAISE EXCEPTION 'Counterparty is required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  INSERT INTO wealth_debts (
    user_id, kind, counterparty, original_amount, outstanding_amount, due_date, note
  )
  VALUES (
    v_user, p_kind, btrim(p_counterparty), p_amount, p_amount, p_due_date, p_note
  )
  RETURNING * INTO v_debt;

  v_flow_kind := CASE WHEN p_kind = 'receivable' THEN 'lend' ELSE 'borrow' END;

  INSERT INTO money_entries (
    user_id, type, flow_kind, amount, date, source, category, note, debt_id
  )
  VALUES (
    v_user,
    v_entry_type,
    v_flow_kind,
    p_amount,
    NOW(),
    btrim(p_counterparty),
    'Debt',
    p_note,
    v_debt.id
  );

  RETURN v_debt;
END;
$$;

-- Record a partial or full repayment atomically.
CREATE OR REPLACE FUNCTION repay_wealth_debt(
  p_debt_id UUID,
  p_amount NUMERIC
)
RETURNS wealth_debts
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_debt wealth_debts;
  v_remaining NUMERIC;
  v_flow_kind TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  SELECT *
  INTO v_debt
  FROM wealth_debts
  WHERE id = p_debt_id
    AND user_id = v_user
    AND status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open debt not found';
  END IF;

  IF p_amount > v_debt.outstanding_amount THEN
    RAISE EXCEPTION 'Repayment exceeds outstanding amount';
  END IF;

  v_remaining := v_debt.outstanding_amount - p_amount;
  v_flow_kind := CASE
    WHEN v_debt.kind = 'receivable' THEN 'receivable_repayment'
    ELSE 'liability_repayment'
  END;

  UPDATE wealth_debts
  SET
    outstanding_amount = v_remaining,
    status = CASE WHEN v_remaining = 0 THEN 'settled' ELSE 'open' END
  WHERE id = v_debt.id
  RETURNING * INTO v_debt;

  INSERT INTO money_entries (
    user_id, type, flow_kind, amount, date, source, category, debt_id
  )
  VALUES (
    v_user,
    'transfer',
    v_flow_kind,
    p_amount,
    NOW(),
    v_debt.counterparty,
    'Debt',
    v_debt.id
  );

  RETURN v_debt;
END;
$$;

-- Confirm an expected income/expense with the actual amount received/paid.
-- The actual amount is intentionally NOT constrained by the forecast range.
CREATE OR REPLACE FUNCTION confirm_expected_flow(
  p_flow_id UUID,
  p_actual_amount NUMERIC
)
RETURNS wealth_expected_flows
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_flow wealth_expected_flows;
  v_money_type money_type;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_actual_amount IS NULL OR p_actual_amount <= 0 THEN
    RAISE EXCEPTION 'Actual amount must be greater than zero';
  END IF;

  SELECT *
  INTO v_flow
  FROM wealth_expected_flows
  WHERE id = p_flow_id
    AND user_id = v_user
    AND status IN ('active', 'paused')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expected flow not found';
  END IF;

  v_money_type := CASE WHEN v_flow.direction = 'income' THEN 'income' ELSE 'expense' END;

  INSERT INTO money_entries (
    user_id,
    type,
    flow_kind,
    amount,
    date,
    source,
    category,
    note,
    expected_flow_id
  )
  VALUES (
    v_user,
    v_money_type,
    v_flow.direction,
    p_actual_amount,
    NOW(),
    v_flow.title,
    v_flow.category,
    v_flow.note,
    v_flow.id
  );

  UPDATE wealth_expected_flows
  SET
    last_actual_amount = p_actual_amount,
    last_confirmed_at = NOW(),
    status = CASE WHEN frequency = 'one_off' THEN 'completed' ELSE 'active' END
  WHERE id = v_flow.id
  RETURNING * INTO v_flow;

  RETURN v_flow;
END;
$$;
