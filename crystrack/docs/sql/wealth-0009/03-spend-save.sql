-- Wealth 0009 installer: step 3 of 8. Run this entire file.
BEGIN;
SET LOCAL search_path = public;
-- BEGIN MIGRATION SECTION
CREATE OR REPLACE FUNCTION wealth_spend_save() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE child money_entries; target uuid; amount_saved numeric;
BEGIN
 IF NEW.bill_id IS NOT NULL THEN UPDATE wealth_bills SET last_paid_on=(SELECT max(bill_due_on) FROM money_entries WHERE bill_id=NEW.bill_id AND deleted_at IS NULL) WHERE id=NEW.bill_id; END IF;
 IF NEW.parent_entry_id IS NOT NULL THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN INSERT INTO activity_events(user_id,type,entity_type,entity_id,metadata_json) VALUES(NEW.user_id,'finance_entry','finance',NEW.id,jsonb_build_object('flowKind',NEW.flow_kind,'amount',NEW.amount::text,'title',coalesce(NEW.source,NEW.category,NEW.flow_kind))); END IF;
 SELECT * INTO child FROM money_entries WHERE parent_entry_id=NEW.id;
 IF NEW.flow_kind='expense' AND NEW.savings_bps>0 AND NEW.deleted_at IS NULL THEN
  amount_saved:=round(NEW.amount*NEW.savings_bps/10000,2);
  IF child.id IS NULL AND amount_saved>0 THEN
   SELECT target_id INTO target FROM wealth_settings WHERE user_id=NEW.user_id;
   INSERT INTO money_entries(user_id,type,flow_kind,amount,date,source,category,target_id,account_id,parent_entry_id)
    VALUES(NEW.user_id,'saving','saving',amount_saved,NEW.date,'Spend & Save','Savings',target,NEW.account_id,NEW.id);
  ELSIF child.id IS NOT NULL AND amount_saved>0 THEN
   UPDATE money_entries SET amount=amount_saved,date=NEW.date,account_id=NEW.account_id,deleted_at=NULL WHERE id=child.id;
  ELSIF child.id IS NOT NULL THEN UPDATE money_entries SET deleted_at=now() WHERE id=child.id; END IF;
 ELSIF child.id IS NOT NULL THEN UPDATE money_entries SET deleted_at=coalesce(NEW.deleted_at,now()) WHERE id=child.id;
 END IF;
 IF EXISTS(SELECT 1 FROM money_entries WHERE user_id=NEW.user_id AND deleted_at IS NULL AND target_id IS NULL AND flow_kind IN ('saving','savings_release') GROUP BY user_id HAVING sum(CASE flow_kind WHEN 'saving' THEN amount ELSE -amount END)<0) THEN RAISE EXCEPTION 'General savings balance is too low' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS wealth_spend_save_trigger ON money_entries;
CREATE TRIGGER wealth_spend_save_trigger AFTER INSERT OR UPDATE ON money_entries FOR EACH ROW EXECUTE FUNCTION wealth_spend_save();
-- The API uses optimistic revisions and one atomic ledger statement. No client can set balances.
-- END MIGRATION SECTION
COMMIT;
SELECT '03-spend-save complete' AS installation_step;
