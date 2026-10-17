-- Piece 7. No live deployment is performed by this file. All ledger amounts are NGN DECIMAL(12,2).
BEGIN;
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
CREATE OR REPLACE FUNCTION wealth_import(p_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE row jsonb; count integer:=0;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 IF jsonb_array_length(p_rows)>500 THEN RAISE EXCEPTION 'Import limit' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,7));
 FOR row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF NOT EXISTS(SELECT 1 FROM money_entries WHERE user_id=auth.uid() AND account_id=(row->>'accountId')::uuid AND import_key=row->>'importKey') THEN
   PERFORM wealth_write_entry(NULL,row); count:=count+1;
  END IF;
 END LOOP;
 RETURN count;
END $$;
CREATE OR REPLACE FUNCTION wealth_reallocate(p_from uuid,p_to uuid,p_amount numeric) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a wealth_budget_caps; b wealth_budget_caps; spent numeric; zone text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,7));
 SELECT * INTO a FROM wealth_budget_caps WHERE id=p_from AND user_id=auth.uid() FOR UPDATE;
 SELECT * INTO b FROM wealth_budget_caps WHERE id=p_to AND user_id=auth.uid() FOR UPDATE;
 IF a.id IS NULL OR b.id IS NULL OR a.id=b.id OR a.month<>b.month OR p_amount<=0 OR p_amount<>round(p_amount,2) THEN RAISE EXCEPTION 'Invalid reallocation' USING ERRCODE='23514'; END IF;
 SELECT coalesce(current_timezone,timezone,'UTC') INTO zone FROM profiles WHERE user_id=auth.uid();
 SELECT coalesce(sum(amount),0) INTO spent FROM money_entries WHERE user_id=auth.uid() AND deleted_at IS NULL AND flow_kind='expense' AND category=a.category AND date_trunc('month',date AT TIME ZONE coalesce(zone,'UTC'))::date=a.month;
 IF a.cap-p_amount<spent THEN RAISE EXCEPTION 'Keep recorded spending covered' USING ERRCODE='23514'; END IF;
 UPDATE wealth_budget_caps SET cap=cap-p_amount WHERE id=a.id;
 UPDATE wealth_budget_caps SET cap=cap+p_amount WHERE id=b.id;
END $$;
CREATE OR REPLACE FUNCTION wealth_pay_bill(p_bill uuid,p_account uuid) RETURNS money_entries LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b wealth_bills;e money_entries;zone text;today date;due date;months integer;step integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,7));
 SELECT * INTO b FROM wealth_bills WHERE id=p_bill AND user_id=auth.uid() AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bill unavailable' USING ERRCODE='P0002'; END IF;
 SELECT coalesce(current_timezone,timezone,'UTC') INTO zone FROM profiles WHERE user_id=auth.uid();today:=(now() AT TIME ZONE coalesce(zone,'UTC'))::date;
 IF b.next_due>today THEN RAISE EXCEPTION 'Bill is not due yet' USING ERRCODE='23514'; END IF;
 IF b.frequency='weekly' THEN due:=b.next_due+((today-b.next_due)/7)*7;
 ELSE
  step:=CASE b.frequency WHEN 'yearly' THEN 12 WHEN 'quarterly' THEN 3 ELSE 1 END;
  months:=(extract(year from age(date_trunc('month',today),date_trunc('month',b.next_due)))::integer*12+extract(month from age(date_trunc('month',today),date_trunc('month',b.next_due)))::integer)/step*step;
  due:=(b.next_due+make_interval(months=>months))::date;
  IF due>today THEN due:=(b.next_due+make_interval(months=>months-step))::date; END IF;
 END IF;
 IF b.last_paid_on>=due THEN RAISE EXCEPTION 'Already recorded' USING ERRCODE='23505'; END IF;
 INSERT INTO money_entries(user_id,type,flow_kind,amount,date,source,category,account_id,bill_id,bill_due_on)
 VALUES(auth.uid(),'expense','expense',b.amount,now(),b.title,b.category,p_account,b.id,due) RETURNING * INTO e;
 RETURN e;
END $$;
REVOKE ALL ON FUNCTION wealth_pay_bill(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wealth_pay_bill(uuid,uuid) TO authenticated;
-- Physical deletes bypass undo/linked saving protection; ledger removal is always a tombstone.
REVOKE DELETE ON money_entries FROM authenticated;
REVOKE ALL ON FUNCTION wealth_write_entry(uuid,jsonb,integer,text),wealth_import(jsonb),wealth_reallocate(uuid,uuid,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wealth_write_entry(uuid,jsonb,integer,text),wealth_import(jsonb),wealth_reallocate(uuid,uuid,numeric) TO authenticated;
CREATE OR REPLACE FUNCTION wealth_protect_target_delete() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE zone text;BEGIN
 SELECT coalesce(current_timezone,timezone,'UTC') INTO zone FROM profiles WHERE user_id=auth.uid();
 IF OLD.locked_until>(now() AT TIME ZONE coalesce(zone,'UTC'))::date THEN RAISE EXCEPTION 'Protected savings target' USING ERRCODE='23514'; END IF;RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS wealth_target_delete_guard ON finance_targets;
CREATE TRIGGER wealth_target_delete_guard BEFORE DELETE ON finance_targets FOR EACH ROW EXECUTE FUNCTION wealth_protect_target_delete();
COMMIT;
