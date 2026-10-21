-- Issue #37 LOCAL-ONLY additive read authority. Hosted numbering UNKNOWN; gate #18.
BEGIN;
CREATE SCHEMA crystrack_overview;
REVOKE ALL ON SCHEMA crystrack_overview FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION crystrack_overview.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT clock_timestamp() $$;
REVOKE ALL ON FUNCTION crystrack_overview.clock() FROM PUBLIC,anon,authenticated,service_role;
-- STABLE uses the calling statement's MVCC snapshot for ALL reads, including side
-- sources and provenance. No locks, writes, row limit or clock argument from caller.
CREATE FUNCTION public.wealth_overview_read() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); z text; n timestamptz:=crystrack_overview.clock(); d date; result jsonb; buckets jsonb;
BEGIN
 IF u IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501';END IF;
 z:=crystrack_budgets.zone(u); d:=(n AT TIME ZONE z)::date;
 IF d<'1000-01-01' OR d>'9999-01-01' THEN RAISE EXCEPTION 'Unsupported reporting day'; END IF;
 IF EXISTS(SELECT 1 FROM public.money_entries e WHERE e.user_id=u AND (
   e.amount IS NULL OR e.amount::text IN('NaN','Infinity','-Infinity') OR e.amount<=0 OR e.amount<>round(e.amount,2)
   OR e.date IS NULL OR NOT isfinite(e.date) OR (e.date AT TIME ZONE z)::date>d OR (e.date AT TIME ZONE z)::date<'1000-01-01'
   OR coalesce(e.flow_kind,e.type::text) NOT IN('income','expense','saving','savings_release','transfer','borrow','lend','receivable_repayment','liability_repayment')
   OR (e.debt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.wealth_debts x WHERE x.id=e.debt_id AND x.user_id=u))
   OR (e.expected_flow_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.wealth_expected_flows x WHERE x.id=e.expected_flow_id AND x.user_id=u))
   OR ((e.bill_id IS NULL)<>(e.bill_occurrence_id IS NULL)) OR ((e.import_batch_id IS NULL)<>(e.import_row_id IS NULL))
   OR (e.bill_id IS NOT NULL AND (e.import_batch_id IS NOT NULL OR NOT EXISTS(
    SELECT 1 FROM public.wealth_bill_occurrences o JOIN public.wealth_recurring_bills b ON b.id=o.bill_id AND b.user_id=u
    WHERE o.id=e.bill_occurrence_id AND o.user_id=u AND o.bill_id=e.bill_id AND o.entry_id=e.id AND o.status='paid'
     AND o.actual_amount=e.amount AND coalesce(e.flow_kind,e.type::text)='expense')))
   OR (e.import_batch_id IS NOT NULL AND (e.debt_id IS NOT NULL OR e.expected_flow_id IS NOT NULL OR NOT EXISTS(
    SELECT 1 FROM public.wealth_csv_rows r JOIN public.wealth_csv_batches b ON b.id=r.batch_id AND b.user_id=u
    WHERE r.id=e.import_row_id AND r.user_id=u AND r.batch_id=e.import_batch_id AND r.entry_id=e.id
     AND (r.reviewed_row->>'amount')::numeric=e.amount AND r.reviewed_row->>'type'=coalesce(e.flow_kind,e.type::text))))
 )) THEN RAISE EXCEPTION 'Ledger requires verification';END IF;
 -- Reverse protected references must not disappear from reports either.
 IF EXISTS(SELECT 1 FROM public.wealth_bill_occurrences o WHERE o.user_id=u AND o.status='paid' AND NOT EXISTS(
   SELECT 1 FROM public.money_entries e WHERE e.id=o.entry_id AND e.user_id=u AND e.bill_occurrence_id=o.id AND e.bill_id=o.bill_id))
 OR EXISTS(SELECT 1 FROM public.wealth_csv_rows r WHERE r.user_id=u AND NOT EXISTS(
   SELECT 1 FROM public.money_entries e WHERE e.id=r.entry_id AND e.user_id=u AND e.import_row_id=r.id AND e.import_batch_id=r.batch_id))
 THEN RAISE EXCEPTION 'Protected source requires verification';END IF;
 IF EXISTS(SELECT 1 FROM public.wealth_debts WHERE user_id=u AND (
  original_amount::text IN('NaN','Infinity','-Infinity') OR outstanding_amount::text IN('NaN','Infinity','-Infinity')
  OR original_amount<=0 OR outstanding_amount<0 OR (due_date IS NOT NULL AND NOT isfinite(due_date))))
 OR EXISTS(SELECT 1 FROM public.wealth_expected_flows WHERE user_id=u AND (
  amount_min::text IN('NaN','Infinity','-Infinity') OR amount_max::text IN('NaN','Infinity','-Infinity') OR amount_min<=0 OR amount_max<amount_min
  OR (expected_on IS NOT NULL AND NOT isfinite(expected_on)) OR (last_confirmed_at IS NOT NULL AND NOT isfinite(last_confirmed_at))))
 OR EXISTS(SELECT 1 FROM public.finance_targets WHERE user_id=u AND status='active' AND (
  target_amount IS NULL OR current_amount IS NULL OR target_amount<=0 OR current_amount<0
  OR target_amount::text IN('NaN','Infinity','-Infinity') OR current_amount::text IN('NaN','Infinity','-Infinity')))
 THEN RAISE EXCEPTION 'Financial source requires verification';END IF;
 IF (SELECT count(*) FROM public.finance_targets WHERE user_id=u AND status='active')>10000
 OR (SELECT count(*) FROM public.wealth_debts WHERE user_id=u)>10000
 OR (SELECT count(*) FROM public.wealth_expected_flows WHERE user_id=u)>10000 THEN RAISE EXCEPTION 'Reporting side coverage exceeded';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('month',m,'kind',k,'category',c,'amount',a::text,'count',cnt) ORDER BY m,k,c),'[]') INTO buckets FROM (
  SELECT to_char(e.date AT TIME ZONE z,'YYYY-MM') m,coalesce(e.flow_kind,e.type::text) k,
   coalesce(nullif(btrim(e.category),''),'Other') c,sum(e.amount) a,count(*) cnt
  FROM public.money_entries e WHERE e.user_id=u GROUP BY 1,2,3
 ) x;
 IF jsonb_array_length(buckets)>12000 THEN RAISE EXCEPTION 'Reporting bucket coverage exceeded'; END IF;
 SELECT jsonb_build_object('timezone',z,'today',d,'count',(SELECT count(*) FROM public.money_entries WHERE user_id=u),'buckets',buckets,
  'entries',coalesce((SELECT jsonb_agg(to_jsonb(e)||jsonb_build_object('amount',e.amount::text) ORDER BY e.date DESC,e.created_at DESC NULLS LAST,e.id DESC)
   FROM (SELECT * FROM public.money_entries WHERE user_id=u ORDER BY date DESC,created_at DESC NULLS LAST,id DESC LIMIT 14) e),'[]'),
  'targets',coalesce((SELECT jsonb_agg(to_jsonb(t)||jsonb_build_object('target_amount',t.target_amount::text,'current_amount',t.current_amount::text) ORDER BY t.created_at DESC NULLS LAST,t.id DESC)
    FROM public.finance_targets t WHERE t.user_id=u AND t.status='active'),'[]'),
  'debts',coalesce((SELECT jsonb_agg(to_jsonb(t)||jsonb_build_object('original_amount',t.original_amount::text,'outstanding_amount',t.outstanding_amount::text) ORDER BY t.created_at DESC,t.id DESC)
    FROM public.wealth_debts t WHERE t.user_id=u),'[]'),
  'expectedFlows',coalesce((SELECT jsonb_agg(to_jsonb(t)||jsonb_build_object('amount_min',t.amount_min::text,'amount_max',t.amount_max::text,'last_actual_amount',t.last_actual_amount::text) ORDER BY t.created_at DESC,t.id DESC)
    FROM public.wealth_expected_flows t WHERE t.user_id=u),'[]')) INTO result;
 IF octet_length(result::text)>8388608 THEN RAISE EXCEPTION 'Reporting payload coverage exceeded'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.wealth_overview_read() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.wealth_overview_read() TO authenticated;
COMMIT;
