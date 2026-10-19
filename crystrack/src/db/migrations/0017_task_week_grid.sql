-- Issue #26 candidate, disposable LOCAL validation only. Hosted compatibility UNKNOWN.
-- No tables or outcome/reward rules change. Existing daily_context recovery is retained.
BEGIN;
CREATE FUNCTION crystrack_daily.week_zone(u uuid,d date) RETURNS text LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE t public.daily_timezone_transitions;
BEGIN
 SELECT * INTO t FROM public.daily_timezone_transitions WHERE user_id=u AND status='pending';
 IF FOUND THEN
  IF d>t.previous_day AND d<t.first_day THEN RETURN NULL; END IF;
  IF d>=t.first_day THEN RETURN t.to_timezone; END IF;
 END IF;
 RETURN crystrack_daily.zone_for(u,d);
END $$;
CREATE FUNCTION crystrack_daily.week_eligible(rules jsonb,d date,z text) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT z IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(rules) rule WHERE
 (rule->>'weekday')::integer=extract(dow FROM d)
 AND (rule->>'start' IS NULL OR d>=((rule->>'start')::timestamptz AT TIME ZONE z)::date)
 AND (rule->>'end' IS NULL OR d<((rule->>'end')::timestamptz AT TIME ZONE z)::date))
$$;
CREATE FUNCTION public.daily_read_week(p_from date DEFAULT NULL,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 25,p_filter text DEFAULT 'all',p_revision text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); ctx jsonb; today date; startday date; thisweek date; d date; z text; token text;
 h public.daily_records; r public.daily_routine_records; v public.routine_schedule_versions; t public.recurring_tasks;
 ident uuid; ids uuid[]; days jsonb:='[]'; rows jsonb:='[]'; cells jsonb; info jsonb;
 verified boolean; editable boolean; state text; title text; rowtitle text; source text; fallback_title text; planned_title text; is_active boolean; more boolean;
BEGIN
 -- The same owner lock protects context/outcomes/definition capture, including paged reads.
 ctx:=crystrack_daily.context(u);today:=(ctx->>'day')::date;
 thisweek:=today-extract(dow FROM today)::integer;startday:=coalesce(p_from,thisweek);
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_filter IS NULL OR p_filter NOT IN ('all','active','history')
 OR extract(dow FROM startday)<>0 OR startday<thisweek-364 OR startday>thisweek+56 OR (p_after IS NOT NULL AND p_revision IS NULL) THEN
  RAISE EXCEPTION 'Invalid bounded week request' USING ERRCODE='22023'; END IF;
 SELECT md5(s.data_revision::text||':'||(SELECT count(*) FROM public.routine_schedule_versions WHERE user_id=u)::text||':'||ctx::text||':'||startday::text||':'||p_filter) INTO token
 FROM public.daily_tracking_states s WHERE s.user_id=u;
 IF p_revision IS NOT NULL AND p_revision<>token THEN RAISE EXCEPTION 'Week changed. Refresh before paging.' USING ERRCODE='PT409'; END IF;
 FOR d IN SELECT generate_series(startday,startday+6,interval '1 day')::date LOOP
  h:=NULL;z:=crystrack_daily.week_zone(u,d);
  IF d<=today THEN
   SELECT * INTO h FROM public.daily_records WHERE user_id=u AND day_key=d;
   verified:=h.id IS NOT NULL AND h.evidence='verified' AND (d=today OR h.close_status='closed')
    AND h.expected_count=(SELECT count(*) FROM public.daily_routine_records WHERE user_id=u AND day_key=d)
    AND NOT EXISTS(SELECT 1 FROM public.daily_routine_records WHERE user_id=u AND day_key=d AND legacy_conflict);
   info:=jsonb_build_object('day',d,'timezone',coalesce(h.timezone,z),'mode',CASE WHEN d=today THEN 'today' ELSE 'past' END,
    'evidence',CASE WHEN verified THEN 'verified' WHEN h.id IS NULL THEN 'missing' ELSE 'incomplete' END,
    'count',CASE WHEN verified THEN h.expected_count ELSE NULL END);
  ELSE
   info:=jsonb_build_object('day',d,'timezone',z,'mode','future','evidence',CASE WHEN z IS NULL THEN 'unavailable' ELSE 'planned' END,'count',NULL);
  END IF;
  days:=days||jsonb_build_array(info);
 END LOOP;
 WITH candidates AS (
  SELECT id routine_key FROM public.recurring_tasks WHERE user_id=u AND active AND archived_at IS NULL
  UNION SELECT routine_key FROM public.daily_routine_records WHERE user_id=u AND day_key BETWEEN startday AND startday+6
  UNION SELECT versions.routine_key FROM generate_series(startday,startday+6,interval '1 day') dates(instant)
   CROSS JOIN LATERAL (SELECT DISTINCT ON(routine_key) * FROM public.routine_schedule_versions WHERE user_id=u AND effective_from<=dates.instant::date ORDER BY routine_key,effective_from DESC,version DESC) versions
   WHERE dates.instant::date>today AND versions.enabled AND crystrack_daily.week_eligible(versions.schedule,dates.instant::date,crystrack_daily.week_zone(u,dates.instant::date))
 ), selected AS (
 SELECT routine_key FROM candidates c WHERE (p_after IS NULL OR routine_key>p_after)
 AND (p_filter<>'active' OR EXISTS(SELECT 1 FROM public.recurring_tasks WHERE id=c.routine_key AND user_id=u AND active AND archived_at IS NULL))
 AND (p_filter<>'history' OR EXISTS(SELECT 1 FROM public.daily_routine_records WHERE user_id=u AND routine_key=c.routine_key AND day_key>=startday AND day_key<least(today,startday+7)))
 ORDER BY routine_key LIMIT p_limit+1)
 SELECT coalesce(array_agg(routine_key ORDER BY routine_key),'{}') INTO ids FROM selected;
 more:=cardinality(ids)>p_limit;
 FOREACH ident IN ARRAY ids[1:p_limit] LOOP
  SELECT * INTO t FROM public.recurring_tasks WHERE id=ident AND user_id=u;
  is_active:=coalesce(t.active AND t.archived_at IS NULL,false);
  cells:='[]';fallback_title:=NULL;planned_title:=NULL;
  FOR info IN SELECT value FROM jsonb_array_elements(days) LOOP
   d:=(info->>'day')::date;z:=info->>'timezone';r:=NULL;v:=NULL;title:=NULL;editable:=false;
   IF d>today THEN
    IF z IS NULL THEN state:='unverified';
    ELSE
     SELECT * INTO v FROM public.routine_schedule_versions WHERE user_id=u AND routine_key=ident AND effective_from<=d ORDER BY effective_from DESC,version DESC LIMIT 1;
     IF v.enabled AND crystrack_daily.week_eligible(v.schedule,d,z) THEN state:='planned';title:=v.title;planned_title:=v.title;
     ELSE state:='not_scheduled'; END IF;
    END IF;
   ELSE
    SELECT * INTO r FROM public.daily_routine_records WHERE user_id=u AND day_key=d AND routine_key=ident;
    SELECT * INTO h FROM public.daily_records WHERE user_id=u AND day_key=d;
    IF d=today AND h.close_status='open' AND r.id IS NOT NULL AND NOT r.legacy_conflict THEN
     state:=r.status;title:=r.title;editable:=true;fallback_title:=r.title;
    ELSIF info->>'evidence'='verified' THEN
     IF r.id IS NULL THEN state:='not_scheduled'; ELSE state:=r.status;title:=r.title;fallback_title:=r.title; END IF;
    ELSE state:='unverified'; END IF;
   END IF;
   cells:=cells||jsonb_build_array(jsonb_build_object('day',d,'state',state,'title',title,'revision',CASE WHEN editable THEN r.revision ELSE NULL END,'editable',editable));
  END LOOP;
  rowtitle:=coalesce(t.title,fallback_title,planned_title,'Historical routine (name unverified)');
  source:=CASE WHEN t.title IS NOT NULL THEN 'current' WHEN fallback_title IS NOT NULL THEN 'recorded' WHEN planned_title IS NOT NULL THEN 'planned' ELSE 'unverified' END;
  rows:=rows||jsonb_build_array(jsonb_build_object('id',ident,'title',rowtitle,'nameSource',source,'active',is_active,'cells',cells));
 END LOOP;
 RETURN jsonb_build_object('context',ctx,'from',startday,'to',startday+6,'minimum',thisweek-364,'maximum',thisweek+56,
  'revision',token,'days',days,'rows',rows,'nextCursor',CASE WHEN more THEN ids[p_limit] ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION crystrack_daily.week_zone(uuid,date),crystrack_daily.week_eligible(jsonb,date,text),public.daily_read_week(date,uuid,integer,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.daily_read_week(date,uuid,integer,text,text) TO authenticated;
COMMIT;
