-- Wealth 0009 installer: step 4 of 8. Run this entire file.
BEGIN;
SET LOCAL search_path = public;
-- BEGIN MIGRATION SECTION
CREATE OR REPLACE FUNCTION wealth_write_entry(p_id uuid,p_payload jsonb,p_revision integer DEFAULT NULL,p_action text DEFAULT 'save') RETURNS money_entries LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); e money_entries; kind text;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN ('save','delete','restore') OR jsonb_typeof(p_payload)<>'object' OR (p_payload?'amount' AND ((p_payload->>'amount')::numeric<>round((p_payload->>'amount')::numeric,2) OR (p_payload->>'amount')::numeric<=0)) OR (p_payload?'flowKind' AND p_payload->>'flowKind' NOT IN ('income','expense','saving','savings_release','transfer')) THEN RAISE EXCEPTION 'Invalid ledger details' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,7));
 IF p_id IS NOT NULL THEN
  SELECT * INTO e FROM money_entries WHERE id=p_id AND user_id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
  IF p_revision IS DISTINCT FROM e.revision THEN RAISE EXCEPTION 'Changed' USING ERRCODE='40001'; END IF;
  IF p_action='delete' THEN UPDATE money_entries SET deleted_at=now() WHERE id=p_id RETURNING * INTO e; RETURN e; END IF;
  IF p_action='restore' THEN UPDATE money_entries SET deleted_at=NULL WHERE id=p_id RETURNING * INTO e; RETURN e; END IF;
  IF e.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Entry was removed' USING ERRCODE='P0002'; END IF;
  UPDATE money_entries SET flow_kind=coalesce(p_payload->>'flowKind',flow_kind),
   type=CASE coalesce(p_payload->>'flowKind',flow_kind) WHEN 'income' THEN 'income'::money_type WHEN 'expense' THEN 'expense'::money_type WHEN 'saving' THEN 'saving'::money_type ELSE 'transfer'::money_type END,
   amount=coalesce((p_payload->>'amount')::numeric,amount),date=coalesce((p_payload->>'date')::timestamptz,date),
   source=CASE WHEN p_payload?'source' THEN p_payload->>'source' ELSE source END,category=CASE WHEN p_payload?'category' THEN p_payload->>'category' ELSE category END,note=CASE WHEN p_payload?'note' THEN p_payload->>'note' ELSE note END,
   target_id=CASE WHEN p_payload?'targetId' THEN (p_payload->>'targetId')::uuid ELSE target_id END,account_id=coalesce((p_payload->>'accountId')::uuid,account_id),destination_account_id=CASE WHEN p_payload?'destinationAccountId' THEN (p_payload->>'destinationAccountId')::uuid ELSE destination_account_id END
   WHERE id=p_id RETURNING * INTO e;
 ELSE
  kind:=p_payload->>'flowKind';
  IF kind NOT IN ('income','expense','saving','savings_release','transfer') THEN RAISE EXCEPTION 'Invalid kind' USING ERRCODE='23514'; END IF;
  INSERT INTO money_entries(user_id,type,flow_kind,amount,date,source,category,note,target_id,account_id,destination_account_id,import_key)
   VALUES(uid,CASE kind WHEN 'income' THEN 'income'::money_type WHEN 'expense' THEN 'expense'::money_type WHEN 'saving' THEN 'saving'::money_type ELSE 'transfer'::money_type END,kind,(p_payload->>'amount')::numeric,coalesce((p_payload->>'date')::timestamptz,now()),p_payload->>'source',p_payload->>'category',p_payload->>'note',(p_payload->>'targetId')::uuid,(p_payload->>'accountId')::uuid,(p_payload->>'destinationAccountId')::uuid,p_payload->>'importKey') RETURNING * INTO e;
 END IF;
 RETURN e;
END $$;
-- END MIGRATION SECTION
COMMIT;
SELECT '04-entry-crud complete' AS installation_step;
