-- Wealth 0009 installer: step 6 of 8. Run this entire file.
BEGIN;
SET LOCAL search_path = public;
-- BEGIN MIGRATION SECTION
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
-- END MIGRATION SECTION
COMMIT;
SELECT '06-budget-reallocation complete' AS installation_step;
