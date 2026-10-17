-- Wealth 0009 installer: step 7 of 8. Run this entire file.
BEGIN;
SET LOCAL search_path = public;
-- BEGIN MIGRATION SECTION
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
-- END MIGRATION SECTION
COMMIT;
SELECT '07-bill-payment-and-permissions complete' AS installation_step;
