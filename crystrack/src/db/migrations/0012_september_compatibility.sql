-- Additive compatibility functions only. Requires 0006-0010; 0011 coach is unrelated.
-- Do not apply to production as part of preview recovery. No table/RLS/trigger changes.
BEGIN;
CREATE OR REPLACE FUNCTION public.september_account_balances()
RETURNS TABLE(id uuid,balance numeric) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 WITH zone AS (SELECT coalesce((SELECT coalesce(nullif(current_timezone,''),nullif(timezone,'')) FROM profiles WHERE user_id=auth.uid()),'UTC') name),
 owned AS (SELECT * FROM wealth_accounts WHERE user_id=auth.uid()),
 deltas AS (
  SELECT coalesce(e.account_id,(SELECT a.id FROM owned a ORDER BY created_at,id LIMIT 1)) id,
   CASE WHEN coalesce(flow_kind,type::text)='transfer' AND destination_account_id IS NOT NULL THEN -amount
    WHEN coalesce(flow_kind,type::text) IN ('income','borrow','receivable_repayment','savings_release') THEN amount
    WHEN coalesce(flow_kind,type::text) IN ('expense','saving','lend','liability_repayment') THEN -amount ELSE 0 END delta
   FROM money_entries e WHERE user_id=auth.uid() AND deleted_at IS NULL
   AND (date AT TIME ZONE (SELECT name FROM zone))::date<=(now() AT TIME ZONE (SELECT name FROM zone))::date
  UNION ALL
  SELECT destination_account_id,amount FROM money_entries WHERE user_id=auth.uid() AND deleted_at IS NULL
   AND (date AT TIME ZONE (SELECT name FROM zone))::date<=(now() AT TIME ZONE (SELECT name FROM zone))::date
   AND coalesce(flow_kind,type::text)='transfer' AND destination_account_id IS NOT NULL
 )
 SELECT a.id,a.opening_balance+coalesce(sum(d.delta),0) FROM owned a LEFT JOIN deltas d ON d.id=a.id GROUP BY a.id,a.opening_balance
$$;
CREATE OR REPLACE FUNCTION public.september_finance_transaction(p_operation text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); previous jsonb; result jsonb; r record; amount numeric; replay money_entries; request_key text; details jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,7));
 PERFORM a.id FROM wealth_accounts a WHERE user_id=uid ORDER BY id FOR UPDATE;
 SELECT coalesce(jsonb_object_agg(id::text,balance),'{}'::jsonb) INTO previous FROM september_account_balances();
 IF p_operation='entry' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('id','payload','revision','action','requestId')) THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
  details:=p_payload->'payload';
  IF p_payload->>'id' IS NULL AND p_payload->>'requestId' IS NOT NULL THEN
   request_key:='september:'||(p_payload->>'requestId')::uuid::text;
   SELECT * INTO replay FROM money_entries WHERE user_id=uid AND import_key=request_key;
   IF FOUND THEN
    IF replay.deleted_at IS NOT NULL OR replay.flow_kind IS DISTINCT FROM details->>'flowKind'
     OR replay.amount IS DISTINCT FROM (details->>'amount')::numeric
     OR replay.date IS DISTINCT FROM coalesce((details->>'date')::timestamptz,replay.date)
     OR replay.target_id IS DISTINCT FROM (details->>'targetId')::uuid
     OR replay.account_id IS DISTINCT FROM coalesce((details->>'accountId')::uuid,replay.account_id)
     OR replay.destination_account_id IS DISTINCT FROM (details->>'destinationAccountId')::uuid
     OR coalesce(replay.source,'') IS DISTINCT FROM coalesce(details->>'source','')
     OR coalesce(replay.category,'') IS DISTINCT FROM coalesce(details->>'category','')
     OR coalesce(replay.note,'') IS DISTINCT FROM coalesce(details->>'note','') THEN
      RAISE EXCEPTION 'Request was already recorded with different details' USING ERRCODE='40001';
    END IF;
    RETURN to_jsonb(replay);
   END IF;
   details:=details||jsonb_build_object('importKey',request_key);
  END IF;
  SELECT to_jsonb(e) INTO result FROM wealth_write_entry((p_payload->>'id')::uuid,details,(p_payload->>'revision')::integer,coalesce(p_payload->>'action','save')) e;
 ELSIF p_operation IN ('create_debt','repay_debt','confirm_expected') THEN
  amount:=coalesce((p_payload->>'p_amount')::numeric,(p_payload->>'p_actual_amount')::numeric);
  IF amount IS NULL OR amount<=0 OR amount<>round(amount,2) THEN RAISE EXCEPTION 'Invalid amount' USING ERRCODE='23514'; END IF;
  IF p_operation='create_debt' THEN
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('p_kind','p_counterparty','p_amount','p_due_date','p_note')) THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
   SELECT to_jsonb(e) INTO result FROM create_wealth_debt(p_payload->>'p_kind',p_payload->>'p_counterparty',amount,(p_payload->>'p_due_date')::timestamptz,p_payload->>'p_note') e;
  ELSIF p_operation='repay_debt' THEN
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('p_debt_id','p_amount')) THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
   SELECT to_jsonb(e) INTO result FROM repay_wealth_debt((p_payload->>'p_debt_id')::uuid,amount) e;
  ELSE
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('p_flow_id','p_actual_amount')) THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
   SELECT to_jsonb(e) INTO result FROM confirm_expected_flow((p_payload->>'p_flow_id')::uuid,amount) e;
  END IF;
 ELSE RAISE EXCEPTION 'Invalid operation' USING ERRCODE='22023';
 END IF;
 -- Existing negative historical balances may improve, but cannot be made worse.
 -- Any failure rolls back the underlying ledger, target, derived savings and events.
 FOR r IN SELECT * FROM september_account_balances() LOOP
  IF r.balance<0 AND r.balance<coalesce((previous->>r.id::text)::numeric,0) THEN
   RAISE EXCEPTION 'Insufficient account balance' USING ERRCODE='23514';
  END IF;
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.september_account_balances(),public.september_finance_transaction(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.september_account_balances(),public.september_finance_transaction(text,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
