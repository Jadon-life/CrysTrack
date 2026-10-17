-- Wealth 0009 installer: step 2 of 8. Run this entire file.
BEGIN;
SET LOCAL search_path = public;
-- BEGIN MIGRATION SECTION
CREATE OR REPLACE FUNCTION wealth_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); owner uuid; zone text; saved numeric; old_impact numeric:=0; new_impact numeric:=0; delta numeric; target uuid; lockday date; s wealth_settings;
BEGIN
 IF uid IS NULL OR NEW.user_id<>uid THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,7));
 SELECT coalesce(current_timezone,timezone,'UTC') INTO zone FROM profiles WHERE user_id=uid;
 zone:=coalesce(zone,'UTC');
 IF TG_TABLE_NAME='wealth_circle_contributions' THEN
  IF NOT EXISTS(SELECT 1 FROM wealth_circles c WHERE c.id=NEW.circle_id AND c.user_id=uid AND NEW.member_index<jsonb_array_length(c.members) AND NEW.round<=jsonb_array_length(c.members) AND NEW.amount=c.contribution) THEN RAISE EXCEPTION 'Check circle contribution' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='wealth_settings' THEN
  IF NEW.target_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM finance_targets WHERE id=NEW.target_id AND user_id=uid) THEN RAISE EXCEPTION 'Target inaccessible' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='finance_targets' THEN
  IF TG_OP='UPDATE' AND OLD.locked_until IS NOT NULL AND OLD.locked_until>(now() AT TIME ZONE zone)::date AND (NEW.locked_until IS NULL OR NEW.locked_until<OLD.locked_until OR NEW.current_amount<OLD.current_amount) THEN RAISE EXCEPTION 'Savings are protected until unlock day' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id OR NEW.created_at<>OLD.created_at OR NEW.parent_entry_id IS DISTINCT FROM OLD.parent_entry_id OR NEW.import_key IS DISTINCT FROM OLD.import_key OR NEW.bill_id IS DISTINCT FROM OLD.bill_id OR NEW.bill_due_on IS DISTINCT FROM OLD.bill_due_on THEN RAISE EXCEPTION 'Immutable ledger identity' USING ERRCODE='23514'; END IF;
  IF (OLD.debt_id IS NOT NULL OR OLD.expected_flow_id IS NOT NULL) THEN RAISE EXCEPTION 'Use the originating debt or expected flow' USING ERRCODE='23514'; END IF;
  IF OLD.parent_entry_id IS NOT NULL AND pg_trigger_depth()=1 THEN RAISE EXCEPTION 'Edit the parent expense' USING ERRCODE='23514'; END IF;
  IF NEW.savings_bps<>OLD.savings_bps THEN RAISE EXCEPTION 'Saving rule is captured at creation' USING ERRCODE='23514'; END IF;
  NEW.revision:=OLD.revision+1;
  IF OLD.parent_entry_id IS NULL AND OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL AND OLD.deleted_at<now()-interval '10 minutes' THEN RAISE EXCEPTION 'Undo expired' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.account_id IS NULL THEN
  SELECT id INTO NEW.account_id FROM wealth_accounts WHERE user_id=uid ORDER BY created_at,id LIMIT 1;
  IF NEW.account_id IS NULL THEN INSERT INTO wealth_accounts(user_id,name,kind) VALUES(uid,'Cash','cash') RETURNING id INTO NEW.account_id; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM wealth_accounts WHERE id=NEW.account_id AND user_id=uid) OR (NEW.destination_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM wealth_accounts WHERE id=NEW.destination_account_id AND user_id=uid)) THEN RAISE EXCEPTION 'Account inaccessible' USING ERRCODE='42501'; END IF;
 IF (NEW.date AT TIME ZONE zone)::date>(now() AT TIME ZONE zone)::date THEN RAISE EXCEPTION 'Use expected money for future dates' USING ERRCODE='23514'; END IF;
 IF NEW.amount<=0 OR NEW.amount<>round(NEW.amount,2) OR NEW.date IS NULL THEN RAISE EXCEPTION 'Invalid ledger amount or date' USING ERRCODE='23514'; END IF;
 NEW.flow_kind:=coalesce(NEW.flow_kind,NEW.type::text);
 IF NEW.flow_kind='transfer' AND (NEW.destination_account_id IS NULL OR NEW.destination_account_id=NEW.account_id) THEN
  -- Legacy informational transfers have no cash impact and are preserved by the backfill.
  RAISE EXCEPTION 'Choose two different accounts' USING ERRCODE='23514';
 END IF;
 IF NEW.flow_kind<>'transfer' AND NEW.destination_account_id IS NOT NULL THEN RAISE EXCEPTION 'Destination is only for transfers' USING ERRCODE='23514'; END IF;
 IF NEW.bill_id IS NOT NULL AND (NEW.flow_kind<>'expense' OR NOT EXISTS(SELECT 1 FROM wealth_bills WHERE id=NEW.bill_id AND user_id=uid)) THEN RAISE EXCEPTION 'Bill inaccessible' USING ERRCODE='42501'; END IF;
 IF NEW.target_id IS NOT NULL AND NEW.flow_kind NOT IN ('saving','savings_release') THEN RAISE EXCEPTION 'Target is only for savings' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.parent_entry_id IS NOT NULL AND (pg_trigger_depth()=1 OR NOT EXISTS(SELECT 1 FROM money_entries WHERE id=NEW.parent_entry_id AND user_id=uid)) THEN RAISE EXCEPTION 'Derived allocation' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.flow_kind='expense' AND NEW.parent_entry_id IS NULL THEN
  SELECT * INTO s FROM wealth_settings WHERE user_id=uid;
  NEW.savings_bps:=coalesce(s.spend_save_bps,0);
 END IF;
 -- Exact target deltas, reversed on edits/deletion and reapplied on undo. Serialize each user's writes.
 FOR target IN SELECT DISTINCT v FROM unnest(ARRAY[CASE WHEN TG_OP='UPDATE' THEN OLD.target_id ELSE NULL END,NEW.target_id]) v WHERE v IS NOT NULL LOOP
  old_impact:=0;new_impact:=0;
  SELECT locked_until INTO lockday FROM finance_targets WHERE id=target AND user_id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target inaccessible' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND OLD.target_id=target AND OLD.deleted_at IS NULL THEN old_impact:=CASE OLD.flow_kind WHEN 'saving' THEN OLD.amount WHEN 'savings_release' THEN -OLD.amount ELSE 0 END; END IF;
  IF NEW.target_id=target AND NEW.deleted_at IS NULL THEN new_impact:=CASE NEW.flow_kind WHEN 'saving' THEN NEW.amount WHEN 'savings_release' THEN -NEW.amount ELSE 0 END; END IF;
  delta:=new_impact-old_impact;
  IF delta<0 AND lockday>(now() AT TIME ZONE zone)::date THEN RAISE EXCEPTION 'Savings are protected until unlock day' USING ERRCODE='23514'; END IF;
  UPDATE finance_targets SET current_amount=coalesce(current_amount,0)+delta WHERE id=target AND coalesce(current_amount,0)+delta>=0;
  IF NOT FOUND THEN RAISE EXCEPTION 'Savings target balance is too low' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF NEW.flow_kind='savings_release' AND NEW.deleted_at IS NULL THEN
  SELECT coalesce(sum(CASE flow_kind WHEN 'saving' THEN amount WHEN 'savings_release' THEN -amount ELSE 0 END),0) INTO saved FROM money_entries WHERE user_id=uid AND deleted_at IS NULL AND id<>NEW.id;
  IF NEW.amount>saved THEN RAISE EXCEPTION 'Savings balance is too low' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS wealth_ledger_guard ON money_entries;
CREATE TRIGGER wealth_ledger_guard BEFORE INSERT OR UPDATE ON money_entries FOR EACH ROW EXECUTE FUNCTION wealth_guard();
DROP TRIGGER IF EXISTS wealth_target_guard ON finance_targets;
CREATE TRIGGER wealth_target_guard BEFORE INSERT OR UPDATE ON finance_targets FOR EACH ROW EXECUTE FUNCTION wealth_guard();
DROP TRIGGER IF EXISTS wealth_settings_guard ON wealth_settings;
CREATE TRIGGER wealth_settings_guard BEFORE INSERT OR UPDATE ON wealth_settings FOR EACH ROW EXECUTE FUNCTION wealth_guard();
DROP TRIGGER IF EXISTS wealth_contribution_guard ON wealth_circle_contributions;
CREATE TRIGGER wealth_contribution_guard BEFORE INSERT OR UPDATE ON wealth_circle_contributions FOR EACH ROW EXECUTE FUNCTION wealth_guard();
-- END MIGRATION SECTION
COMMIT;
SELECT '02-guard-and-triggers complete' AS installation_step;
