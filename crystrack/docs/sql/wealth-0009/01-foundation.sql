-- Wealth 0009 installer: step 1 of 8. Run this entire file.
BEGIN;
SET LOCAL search_path = public;
-- BEGIN MIGRATION SECTION
-- Piece 7. No live deployment is performed by this file. All ledger amounts are NGN DECIMAL(12,2).
CREATE TABLE IF NOT EXISTS wealth_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 name varchar(100) NOT NULL CHECK(length(btrim(name))>0), kind varchar(20) NOT NULL CHECK(kind IN ('cash','bank','savings','usd_wallet')),
 opening_balance decimal(12,2) NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wealth_accounts_user_idx ON wealth_accounts(user_id);
CREATE TABLE IF NOT EXISTS wealth_budget_caps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 month date NOT NULL CHECK(extract(day from month)=1),category varchar(100) NOT NULL CHECK(length(btrim(category))>0),
 cap decimal(12,2) NOT NULL CHECK(cap>=0), UNIQUE(user_id,month,category)
);
CREATE TABLE IF NOT EXISTS wealth_bills (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 title varchar(150) NOT NULL CHECK(length(btrim(title))>0), amount decimal(12,2) NOT NULL CHECK(amount>0), next_due date NOT NULL,
 frequency varchar(20) NOT NULL CHECK(frequency IN ('weekly','monthly','quarterly','yearly')),category varchar(100) NOT NULL DEFAULT 'Bills',
 active boolean NOT NULL DEFAULT true,last_paid_on date,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wealth_circles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 title varchar(150) NOT NULL CHECK(length(btrim(title))>0),contribution decimal(12,2) NOT NULL CHECK(contribution>0),starts_on date NOT NULL,
 interval_days integer NOT NULL CHECK(interval_days BETWEEN 1 AND 366),members jsonb NOT NULL CHECK(jsonb_typeof(members)='array' AND jsonb_array_length(members) BETWEEN 2 AND 50),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wealth_circle_contributions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 circle_id uuid NOT NULL REFERENCES wealth_circles(id) ON DELETE CASCADE,member_index integer NOT NULL CHECK(member_index>=0),
 round integer NOT NULL CHECK(round>=1),amount decimal(12,2) NOT NULL CHECK(amount>0),paid_on date NOT NULL,
 UNIQUE(circle_id,member_index,round)
);
ALTER TABLE finance_targets ADD COLUMN IF NOT EXISTS locked_until date;
CREATE TABLE IF NOT EXISTS wealth_settings (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,spend_save_bps integer NOT NULL DEFAULT 0 CHECK(spend_save_bps BETWEEN 0 AND 10000),
 target_id uuid REFERENCES finance_targets(id) ON DELETE RESTRICT,low_balance decimal(12,2) NOT NULL DEFAULT 0 CHECK(low_balance>=0)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['wealth_accounts','wealth_budget_caps','wealth_bills','wealth_circles','wealth_circle_contributions','wealth_settings'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('DROP POLICY IF EXISTS wealth_owner ON %I',t);
 EXECUTE format('CREATE POLICY wealth_owner ON %I FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid())',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO authenticated',t);
 END LOOP;
END $$;
ALTER TABLE money_entries ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES wealth_accounts(id) ON DELETE RESTRICT;
ALTER TABLE money_entries ADD COLUMN IF NOT EXISTS destination_account_id uuid REFERENCES wealth_accounts(id) ON DELETE RESTRICT;
ALTER TABLE money_entries ADD COLUMN IF NOT EXISTS bill_id uuid REFERENCES wealth_bills(id) ON DELETE RESTRICT;
ALTER TABLE money_entries ADD COLUMN IF NOT EXISTS bill_due_on date;
ALTER TABLE money_entries ADD COLUMN IF NOT EXISTS parent_entry_id uuid REFERENCES money_entries(id) ON DELETE RESTRICT;
ALTER TABLE money_entries ADD COLUMN IF NOT EXISTS import_key varchar(200);
ALTER TABLE money_entries ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE money_entries ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
ALTER TABLE money_entries ADD COLUMN IF NOT EXISTS savings_bps integer NOT NULL DEFAULT 0 CHECK(savings_bps BETWEEN 0 AND 10000);
CREATE UNIQUE INDEX IF NOT EXISTS money_import_unique ON money_entries(user_id,account_id,import_key) WHERE import_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS money_bill_unique ON money_entries(bill_id,bill_due_on) WHERE bill_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS money_child_unique ON money_entries(parent_entry_id) WHERE parent_entry_id IS NOT NULL;
-- Backfill one Cash account without inventing an opening balance or altering historical totals.
INSERT INTO wealth_accounts(user_id,name,kind)
 SELECT DISTINCT e.user_id,'Cash','cash' FROM money_entries e WHERE NOT EXISTS(SELECT 1 FROM wealth_accounts a WHERE a.user_id=e.user_id);
UPDATE money_entries e SET account_id=(SELECT a.id FROM wealth_accounts a WHERE a.user_id=e.user_id ORDER BY a.created_at,a.id LIMIT 1) WHERE account_id IS NULL;

-- END MIGRATION SECTION
COMMIT;
SELECT '01-foundation complete' AS installation_step;
