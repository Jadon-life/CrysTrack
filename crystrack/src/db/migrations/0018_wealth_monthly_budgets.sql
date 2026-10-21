-- Issue #29 candidate. Apply only to guarded disposable LOCAL Supabase.
-- Hosted history/numbering/compatibility UNKNOWN; Issue #18 remains a release gate.
BEGIN;
CREATE SCHEMA crystrack_budgets;
REVOKE ALL ON SCHEMA crystrack_budgets FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION crystrack_budgets.categories() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT ARRAY['Food','Transport','Housing','Utilities','Health','Family','Education','Business','Shopping','Entertainment','Giving','Debt','Subscriptions','Savings','Other']::text[]
$$;
CREATE TABLE public.wealth_monthly_budgets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 month date NOT NULL CHECK(extract(day FROM month)=1),
 category text NOT NULL CHECK(category=ANY(ARRAY['Food','Transport','Housing','Utilities','Health','Family','Education','Business','Shopping','Entertainment','Giving','Debt','Subscriptions','Savings','Other'])),
 currency text NOT NULL DEFAULT 'NGN' CHECK(currency='NGN'),
 limit_amount numeric(12,2) NOT NULL CHECK(limit_amount>0 AND limit_amount<10000000000),
 active boolean NOT NULL DEFAULT true,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 removed_at timestamptz,
 CONSTRAINT wealth_budget_owner_month_category_idx UNIQUE(user_id,month,category),
 CHECK(active=(removed_at IS NULL))
);
ALTER TABLE public.wealth_monthly_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_owner_select ON public.wealth_monthly_budgets FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.wealth_monthly_budgets FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.wealth_monthly_budgets TO authenticated;
CREATE TABLE crystrack_budgets.requests (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 payload jsonb NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,request_id)
);
ALTER TABLE crystrack_budgets.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crystrack_budgets.requests FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION crystrack_budgets.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT clock_timestamp() $$;
CREATE FUNCTION crystrack_budgets.zone(u uuid) RETURNS text LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE z text;
BEGIN
 SELECT coalesce(scheduling_timezone,timezone,'UTC') INTO z FROM public.profiles WHERE user_id=u;
 z:=coalesce(z,'UTC');
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=z) THEN RAISE EXCEPTION 'Saved timezone requires correction' USING ERRCODE='22023'; END IF;
 RETURN z;
END $$;
CREATE FUNCTION public.wealth_budget_month(p_month date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); z text; current_month date; m date; since timestamptz; until_time timestamptz; items jsonb;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 z:=crystrack_budgets.zone(u);current_month:=date_trunc('month',crystrack_budgets.clock() AT TIME ZONE z)::date;m:=coalesce(p_month,current_month);
 IF extract(day FROM m)<>1 OR m< (current_month-interval '12 months')::date OR m>current_month THEN RAISE EXCEPTION 'Invalid bounded month' USING ERRCODE='22023'; END IF;
 since:=m::timestamp AT TIME ZONE z;until_time:=(m+interval '1 month')::timestamp AT TIME ZONE z;
 -- Invalid actual expense data cannot silently become zero. Approved schema uses hard deletion.
 IF EXISTS(SELECT 1 FROM public.money_entries WHERE user_id=u AND coalesce(flow_kind,type::text)='expense'
   AND (date IS NULL OR (date>=since AND date<until_time AND (amount<=0 OR amount IS NULL)))) THEN
  RAISE EXCEPTION 'Expense data needs review' USING ERRCODE='P0001'; END IF;
 WITH spending AS (
  SELECT CASE WHEN btrim(coalesce(category,''))=ANY(crystrack_budgets.categories()) THEN btrim(category) ELSE 'Other' END category,
   sum(amount) spent,count(*) entry_count FROM public.money_entries
  WHERE user_id=u AND date>=since AND date<until_time AND coalesce(flow_kind,type::text)='expense'
  GROUP BY 1
 )
 SELECT jsonb_agg(jsonb_build_object('category',c.category,'id',b.id,'revision',coalesce(b.revision,0),'active',coalesce(b.active,false),
  'limit',CASE WHEN b.active THEN b.limit_amount::text ELSE NULL END,'spent',coalesce(s.spent,0.00)::text,'entryCount',coalesce(s.entry_count,0),
  'left',CASE WHEN b.active THEN (b.limit_amount-coalesce(s.spent,0.00))::text ELSE NULL END,
  'percentUsed',CASE WHEN b.active THEN round(coalesce(s.spent,0.00)*100/b.limit_amount,2)::text ELSE NULL END,
  'createdAt',b.created_at,'updatedAt',b.updated_at,'removedAt',b.removed_at)
  ORDER BY c.position) INTO items FROM unnest(crystrack_budgets.categories()) WITH ORDINALITY c(category,position)
  LEFT JOIN public.wealth_monthly_budgets b ON b.user_id=u AND b.month=m AND b.category=c.category
  LEFT JOIN spending s ON s.category=c.category;
 RETURN jsonb_build_object('month',m,'currentMonth',current_month,'minimum',(current_month-interval '12 months')::date,'timezone',z,'currency','NGN',
  'startsAt',since,'endsAt',until_time,'items',items);
END $$;
CREATE FUNCTION public.wealth_budget_mutate(p_action text,p_month date,p_category text,p_limit text,p_revision integer,p_request_id uuid,p_timezone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); z text; m date; payload jsonb; receipt crystrack_budgets.requests; b public.wealth_monthly_budgets; result jsonb; amount numeric;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('set','remove') OR p_month IS NULL OR p_category IS NULL OR NOT p_category=ANY(crystrack_budgets.categories())
 OR p_revision IS NULL OR p_revision<0 OR p_request_id IS NULL OR p_timezone IS NULL THEN RAISE EXCEPTION 'Invalid budget request' USING ERRCODE='22023'; END IF;
 IF p_action='set' THEN
  IF p_limit IS NULL OR p_limit!~'^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'Invalid exact limit' USING ERRCODE='22023'; END IF;
  amount:=p_limit::numeric;IF amount<=0 OR amount>=10000000000 THEN RAISE EXCEPTION 'Limit must be positive' USING ERRCODE='22023';END IF;
 ELSIF p_limit IS NOT NULL THEN RAISE EXCEPTION 'Unexpected remove limit' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,36));
 payload:=jsonb_build_object('action',p_action,'month',p_month,'category',p_category,'limit',p_limit,'revision',p_revision,'timezone',p_timezone);
 SELECT * INTO receipt FROM crystrack_budgets.requests WHERE user_id=u AND request_id=p_request_id;
 IF FOUND THEN
  IF receipt.payload<>payload THEN RAISE EXCEPTION 'Request changed' USING ERRCODE='PT409';END IF;
  RETURN receipt.result;
 END IF;
 z:=crystrack_budgets.zone(u);m:=date_trunc('month',crystrack_budgets.clock() AT TIME ZONE z)::date;
 IF p_month<>m OR p_timezone<>z THEN RAISE EXCEPTION 'Month or timezone changed' USING ERRCODE='PT409';END IF;
 SELECT * INTO b FROM public.wealth_monthly_budgets WHERE user_id=u AND month=p_month AND category=p_category FOR UPDATE;
 IF coalesce(b.revision,0)<>p_revision THEN RAISE EXCEPTION 'Budget changed' USING ERRCODE='PT409';END IF;
 IF p_action='remove' AND b.id IS NULL THEN RAISE EXCEPTION 'Budget unavailable' USING ERRCODE='PT409'; END IF;
 IF p_action='set' AND b.id IS NULL THEN
  INSERT INTO public.wealth_monthly_budgets(user_id,month,category,limit_amount,created_at,updated_at)
  VALUES(u,p_month,p_category,amount,crystrack_budgets.clock(),crystrack_budgets.clock()) RETURNING * INTO b;
 ELSE
  UPDATE public.wealth_monthly_budgets SET limit_amount=CASE WHEN p_action='set' THEN amount ELSE limit_amount END,
   active=p_action='set',removed_at=CASE WHEN p_action='remove' THEN crystrack_budgets.clock() ELSE NULL END,
   revision=revision+1,updated_at=crystrack_budgets.clock() WHERE id=b.id RETURNING * INTO b;
 END IF;
 result:=jsonb_build_object('id',b.id,'revision',b.revision,'active',b.active,'requestId',p_request_id);
 INSERT INTO crystrack_budgets.requests(user_id,request_id,payload,result) VALUES(u,p_request_id,payload,result);
 RETURN result;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crystrack_budgets FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.wealth_budget_month(date),public.wealth_budget_mutate(text,date,text,text,integer,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.wealth_budget_month(date),public.wealth_budget_mutate(text,date,text,text,integer,uuid,text) TO authenticated;
COMMIT;
