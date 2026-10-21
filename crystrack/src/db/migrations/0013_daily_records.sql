-- Issue #10. Additive; depends only on 0000-0005. LOCAL validation only.
-- Do not infer hosted migration history from this file or the local hash ledger.
BEGIN;
CREATE SCHEMA crystrack_daily;
REVOKE ALL ON SCHEMA crystrack_daily FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.profiles ADD COLUMN scheduling_timezone varchar(100);

CREATE TABLE public.daily_tracking_states (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id), initial_timezone text NOT NULL,
 scheduling_timezone text NOT NULL, activated_at timestamptz NOT NULL,
 activation_day date NOT NULL, capture_starts_on date NOT NULL,
 recovery_cursor date NOT NULL, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 data_revision bigint NOT NULL DEFAULT 1,
 CHECK(capture_starts_on=activation_day+1)
);
CREATE TABLE public.daily_timezone_transitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 from_timezone text NOT NULL, to_timezone text NOT NULL, previous_day date NOT NULL,
 first_day date NOT NULL, requested_at timestamptz NOT NULL, effective_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied')),
 revision integer NOT NULL DEFAULT 1, CHECK(first_day>previous_day)
);
CREATE UNIQUE INDEX daily_one_pending_timezone ON public.daily_timezone_transitions(user_id) WHERE status='pending';
CREATE INDEX daily_timezone_owner_day ON public.daily_timezone_transitions(user_id,first_day);
CREATE TABLE public.routine_schedule_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 routine_key uuid NOT NULL, version integer NOT NULL CHECK(version>0),
 effective_from date NOT NULL, enabled boolean NOT NULL,
 title text NOT NULL, description text, preferred_time text, category text,
 schedule jsonb NOT NULL CHECK(jsonb_typeof(schedule)='array'),
 created_at timestamptz NOT NULL, UNIQUE(user_id,routine_key,version)
);
CREATE INDEX daily_schedule_lookup ON public.routine_schedule_versions(user_id,routine_key,effective_from DESC,version DESC);
CREATE TABLE public.daily_records (
 id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 day_key date NOT NULL, timezone text NOT NULL, policy_version integer NOT NULL DEFAULT 1 CHECK(policy_version=1),
 evidence text NOT NULL CHECK(evidence IN ('verified','incomplete')), evidence_reason text,
 expected_count integer NOT NULL CHECK(expected_count>=0),
 close_status text NOT NULL DEFAULT 'open' CHECK(close_status IN ('open','closed')),
 opens_at timestamptz NOT NULL, closes_at timestamptz NOT NULL,
 materialized_at timestamptz NOT NULL, closed_at timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), PRIMARY KEY(user_id,day_key),
 CHECK(opens_at=day_key::timestamp AT TIME ZONE timezone),
 CHECK(closes_at=(day_key+1)::timestamp AT TIME ZONE timezone),
 CHECK((close_status='closed')=(closed_at IS NOT NULL))
);
CREATE INDEX daily_pending_closure ON public.daily_records(closes_at,user_id) WHERE close_status='open';
CREATE TABLE public.daily_routine_records (
 id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 day_key date NOT NULL, routine_key uuid NOT NULL,
 schedule_version_id uuid NOT NULL REFERENCES public.routine_schedule_versions(id),
 title text NOT NULL, description text, preferred_time text, category text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','skipped','missed')),
 completed_at timestamptz, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 compatibility_occurrence_id uuid, activity_event_id uuid NOT NULL DEFAULT gen_random_uuid(),
 legacy_conflict boolean NOT NULL DEFAULT false,
 PRIMARY KEY(user_id,day_key,routine_key),
 FOREIGN KEY(user_id,day_key) REFERENCES public.daily_records(user_id,day_key),
 CHECK((status='completed')=(completed_at IS NOT NULL))
);
CREATE TABLE public.daily_mutation_requests (
 user_id uuid NOT NULL REFERENCES auth.users(id), request_id uuid NOT NULL,
 payload jsonb NOT NULL, result jsonb NOT NULL, revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL, PRIMARY KEY(user_id,request_id)
);
CREATE TABLE public.daily_notes (
 user_id uuid NOT NULL REFERENCES auth.users(id), day_key date NOT NULL,
 body text NOT NULL CHECK(char_length(body)<=4000),
 revision integer NOT NULL CHECK(revision>0), updated_at timestamptz NOT NULL,
 PRIMARY KEY(user_id,day_key)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['daily_tracking_states','daily_timezone_transitions','routine_schedule_versions',
 'daily_records','daily_routine_records','daily_mutation_requests','daily_notes'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY daily_owner_read ON public.%I FOR SELECT TO authenticated USING(user_id=auth.uid())',t);
 END LOOP;
END $$;

CREATE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT clock_timestamp() $$;
CREATE FUNCTION crystrack_daily.lock_owner(u uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,13));
END $$;
CREATE FUNCTION crystrack_daily.zone_valid(z text) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT z IS NOT NULL AND EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=z)
$$;
CREATE FUNCTION crystrack_daily.capture(u uuid,r uuid,d date) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE t public.recurring_tasks; n integer; previous public.routine_schedule_versions;
BEGIN
 SELECT * INTO t FROM public.recurring_tasks WHERE id=r AND user_id=u;
 SELECT * INTO previous FROM public.routine_schedule_versions WHERE user_id=u AND routine_key=r ORDER BY version DESC LIMIT 1;
 SELECT coalesce(max(version),0)+1 INTO n FROM public.routine_schedule_versions WHERE user_id=u AND routine_key=r;
 INSERT INTO public.routine_schedule_versions(user_id,routine_key,version,effective_from,enabled,title,description,preferred_time,category,schedule,created_at)
 VALUES(u,r,n,d,coalesce(t.active AND t.archived_at IS NULL,false),coalesce(t.title,previous.title,'Retired routine'),
 CASE WHEN t.id IS NOT NULL THEN t.description ELSE previous.description END,
 CASE WHEN t.id IS NOT NULL THEN t.preferred_time ELSE previous.preferred_time END,
 CASE WHEN t.id IS NOT NULL THEN t.category ELSE previous.category END,
 coalesce((SELECT jsonb_agg(jsonb_build_object('weekday',weekday,'start',start_date,'end',end_date) ORDER BY weekday,id)
 FROM public.task_schedules WHERE task_id=r),'[]'::jsonb),crystrack_daily.clock());
END $$;
CREATE FUNCTION crystrack_daily.ensure_state(u uuid) RETURNS public.daily_tracking_states LANGUAGE plpgsql SET search_path='' AS $$
DECLARE s public.daily_tracking_states; z text; d date; r uuid; instant timestamptz:=crystrack_daily.clock();
BEGIN
 PERFORM crystrack_daily.lock_owner(u);
 SELECT * INTO s FROM public.daily_tracking_states WHERE user_id=u;
 IF FOUND THEN RETURN s; END IF;
 SELECT coalesce(scheduling_timezone,timezone,'UTC') INTO z FROM public.profiles WHERE user_id=u;
 z:=coalesce(z,'UTC');
 IF NOT crystrack_daily.zone_valid(z) THEN RAISE EXCEPTION 'Saved scheduling timezone requires correction' USING ERRCODE='22023'; END IF;
 d:=(instant AT TIME ZONE z)::date;
 INSERT INTO public.daily_tracking_states(user_id,initial_timezone,scheduling_timezone,activated_at,activation_day,capture_starts_on,recovery_cursor)
 VALUES(u,z,z,instant,d,d+1,d-1) RETURNING * INTO s;
 UPDATE public.profiles SET scheduling_timezone=z WHERE user_id=u;
 FOR r IN SELECT id FROM public.recurring_tasks WHERE user_id=u LOOP
  PERFORM crystrack_daily.capture(u,r,d);
 END LOOP;
 RETURN s;
END $$;
CREATE FUNCTION crystrack_daily.zone_for(u uuid,d date) RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE z text;
BEGIN
 IF EXISTS(SELECT 1 FROM public.daily_timezone_transitions WHERE user_id=u AND status='applied' AND d>previous_day AND d<first_day) THEN RETURN NULL; END IF;
 SELECT to_timezone INTO z FROM public.daily_timezone_transitions WHERE user_id=u AND status='applied' AND first_day<=d ORDER BY first_day DESC LIMIT 1;
 IF z IS NULL THEN SELECT initial_timezone INTO z FROM public.daily_tracking_states WHERE user_id=u; END IF;
 RETURN z;
END $$;
CREATE FUNCTION crystrack_daily.materialize(u uuid,d date) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE s public.daily_tracking_states; z text; v public.routine_schedule_versions; o public.task_occurrences;
 n integer; conflict_found boolean:=false; partial_day boolean; event_id uuid;
BEGIN
 s:=crystrack_daily.ensure_state(u);
 IF EXISTS(SELECT 1 FROM public.daily_records WHERE user_id=u AND day_key=d) THEN RETURN; END IF;
 z:=crystrack_daily.zone_for(u,d);
 IF z IS NULL OR d<s.activation_day OR d>(crystrack_daily.clock() AT TIME ZONE s.scheduling_timezone)::date THEN RETURN; END IF;
 -- A date straddling a timezone transition is not a full captured day.
 SELECT EXISTS(SELECT 1 FROM public.daily_timezone_transitions WHERE user_id=u AND status='applied'
 AND first_day=d AND effective_at>d::timestamp AT TIME ZONE to_timezone) INTO partial_day;
 INSERT INTO public.daily_records(user_id,day_key,timezone,evidence,evidence_reason,expected_count,opens_at,closes_at,materialized_at)
 VALUES(u,d,z,'incomplete','assembling',0,d::timestamp AT TIME ZONE z,(d+1)::timestamp AT TIME ZONE z,crystrack_daily.clock());
 FOR v IN SELECT * FROM (SELECT DISTINCT ON(routine_key) * FROM public.routine_schedule_versions
  WHERE user_id=u AND effective_from<=d ORDER BY routine_key,effective_from DESC,version DESC) versions
  WHERE enabled AND EXISTS(SELECT 1 FROM jsonb_array_elements(schedule) rule WHERE (rule->>'weekday')::integer=extract(dow FROM d)
   AND (rule->>'start' IS NULL OR d>=((rule->>'start')::timestamptz AT TIME ZONE z)::date)
   AND (rule->>'end' IS NULL OR d<((rule->>'end')::timestamptz AT TIME ZONE z)::date)) LOOP
  SELECT count(*) INTO n FROM public.task_occurrences WHERE task_id=v.routine_key AND (date AT TIME ZONE 'UTC')::date=d;
  o:=NULL;
  IF n=1 THEN SELECT * INTO o FROM public.task_occurrences WHERE task_id=v.routine_key AND (date AT TIME ZONE 'UTC')::date=d; END IF;
  conflict_found:=conflict_found OR n>1 OR (n=1 AND NOT coalesce(o.status::text IN ('pending','completed','skipped','missed'),false));
  event_id:=NULL;
  SELECT id INTO event_id FROM public.activity_events WHERE user_id=u AND entity_type='task' AND entity_id=v.routine_key
   AND metadata_json->>'date'=d::text AND type::text IN ('task_completed','task_skipped','task_missed') ORDER BY created_at,id LIMIT 1;
  INSERT INTO public.daily_routine_records(user_id,day_key,routine_key,schedule_version_id,title,description,preferred_time,category,
   status,completed_at,compatibility_occurrence_id,legacy_conflict,activity_event_id)
  VALUES(u,d,v.routine_key,v.id,v.title,v.description,v.preferred_time,v.category,
   CASE WHEN n=1 AND o.status::text IN ('completed','skipped','missed') THEN o.status::text ELSE 'pending' END,
   CASE WHEN n=1 AND o.status='completed' THEN coalesce(o.completed_at,o.date) ELSE NULL END,o.id,(n>1 OR (n=1 AND NOT coalesce(o.status::text IN ('pending','completed','skipped','missed'),false))),
   coalesce(event_id,gen_random_uuid()));
 END LOOP;
 UPDATE public.daily_records SET expected_count=(SELECT count(*) FROM public.daily_routine_records WHERE user_id=u AND day_key=d),
 evidence=CASE WHEN d>=s.capture_starts_on AND NOT conflict_found AND NOT partial_day THEN 'verified' ELSE 'incomplete' END,
 evidence_reason=CASE WHEN d<s.capture_starts_on THEN 'capture_started_midday' WHEN conflict_found THEN 'legacy_conflict' WHEN partial_day THEN 'timezone_boundary' ELSE NULL END
 WHERE user_id=u AND day_key=d;
 UPDATE public.daily_tracking_states SET data_revision=data_revision+1 WHERE user_id=u;
END $$;
CREATE FUNCTION crystrack_daily.sync_outcome(u uuid,d date,r uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE x public.daily_routine_records; oid uuid; daystamp timestamptz:=d::timestamp AT TIME ZONE 'UTC';
BEGIN
 SELECT * INTO STRICT x FROM public.daily_routine_records WHERE user_id=u AND day_key=d AND routine_key=r;
 IF EXISTS(SELECT 1 FROM public.recurring_tasks WHERE id=r AND user_id=u) THEN
  oid:=coalesce(x.compatibility_occurrence_id,gen_random_uuid());
  INSERT INTO public.task_occurrences(id,task_id,date,status,completed_at) VALUES(oid,r,daystamp,x.status::public.task_status,x.completed_at)
  ON CONFLICT(id) DO UPDATE SET status=excluded.status,completed_at=excluded.completed_at;
  UPDATE public.daily_routine_records SET compatibility_occurrence_id=oid WHERE user_id=u AND day_key=d AND routine_key=r;
 END IF;
 IF x.status='pending' THEN DELETE FROM public.activity_events WHERE id=x.activity_event_id AND user_id=u;
 ELSE
  INSERT INTO public.activity_events(id,user_id,type,entity_type,entity_id,metadata_json,created_at)
  VALUES(x.activity_event_id,u,('task_'||x.status)::public.activity_type,'task',r,
  jsonb_build_object('title',x.title,'status',x.status,'date',d,'daily_record',true),crystrack_daily.clock())
  ON CONFLICT(id) DO UPDATE SET type=excluded.type,metadata_json=excluded.metadata_json,created_at=excluded.created_at;
 END IF;
 RETURN jsonb_build_object('id',coalesce(oid,x.id),'task_id',r,'date',daystamp,'status',x.status,
 'completed_at',x.completed_at,'note',NULL,'revision',x.revision,'daily_record_id',x.id);
END $$;
CREATE FUNCTION crystrack_daily.close_day(u uuid,d date) RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
DECLARE h public.daily_records; r uuid;
BEGIN
 PERFORM crystrack_daily.lock_owner(u);
 PERFORM crystrack_daily.materialize(u,d);
 SELECT * INTO h FROM public.daily_records WHERE user_id=u AND day_key=d FOR UPDATE;
 IF NOT FOUND OR h.close_status='closed' OR h.closes_at>crystrack_daily.clock() THEN RETURN false; END IF;
 IF h.evidence='verified' THEN
  FOR r IN SELECT routine_key FROM public.daily_routine_records WHERE user_id=u AND day_key=d AND status='pending' LOOP
   UPDATE public.daily_routine_records SET status='missed',revision=revision+1 WHERE user_id=u AND day_key=d AND routine_key=r;
   PERFORM crystrack_daily.sync_outcome(u,d,r);
  END LOOP;
 END IF;
 UPDATE public.daily_records SET close_status='closed',closed_at=crystrack_daily.clock(),revision=revision+1 WHERE user_id=u AND day_key=d;
 UPDATE public.daily_tracking_states SET data_revision=data_revision+1 WHERE user_id=u;
 RETURN true;
END $$;
CREATE FUNCTION crystrack_daily.recover_elapsed(u uuid,p_limit integer) RETURNS integer LANGUAGE plpgsql SET search_path='' AS $$
DECLARE s public.daily_tracking_states; d date; z text; n integer:=0;
BEGIN
 s:=crystrack_daily.ensure_state(u);
 FOR d IN SELECT generate_series(s.recovery_cursor+1,s.recovery_cursor+p_limit,interval '1 day')::date LOOP
  z:=crystrack_daily.zone_for(u,d);
  IF z IS NOT NULL AND (d+1)::timestamp AT TIME ZONE z>crystrack_daily.clock() THEN EXIT; END IF;
  IF EXISTS(SELECT 1 FROM public.daily_timezone_transitions WHERE user_id=u AND status='pending' AND d>previous_day) THEN EXIT; END IF;
  IF z IS NOT NULL THEN PERFORM crystrack_daily.close_day(u,d); END IF;
  UPDATE public.daily_tracking_states SET recovery_cursor=d WHERE user_id=u;
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;
CREATE FUNCTION crystrack_daily.context(u uuid,p_recover boolean DEFAULT true) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE s public.daily_tracking_states; t public.daily_timezone_transitions; d date;
BEGIN
 s:=crystrack_daily.ensure_state(u);
 SELECT * INTO t FROM public.daily_timezone_transitions WHERE user_id=u AND status='pending';
 IF FOUND THEN
  IF crystrack_daily.clock()>=t.effective_at THEN
   PERFORM crystrack_daily.close_day(u,t.previous_day);
   UPDATE public.daily_timezone_transitions SET status='applied',revision=revision+1 WHERE id=t.id;
   UPDATE public.daily_tracking_states SET scheduling_timezone=t.to_timezone,revision=revision+1,data_revision=data_revision+1 WHERE user_id=u RETURNING * INTO s;
   UPDATE public.profiles SET scheduling_timezone=t.to_timezone WHERE user_id=u;
  ELSIF crystrack_daily.clock()>=(t.previous_day+1)::timestamp AT TIME ZONE t.from_timezone THEN
   RAISE EXCEPTION 'Scheduling timezone boundary in progress' USING ERRCODE='40001';
  END IF;
 END IF;
 IF p_recover THEN PERFORM crystrack_daily.recover_elapsed(u,31); END IF;
 d:=(crystrack_daily.clock() AT TIME ZONE s.scheduling_timezone)::date;
 PERFORM crystrack_daily.materialize(u,d);
 RETURN jsonb_build_object('day',d,'timezone',s.scheduling_timezone,'revision',s.revision,'captureStartsOn',s.capture_starts_on);
END $$;
CREATE FUNCTION public.daily_context() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RETURN crystrack_daily.context(auth.uid()); END $$;
CREATE FUNCTION public.daily_set_outcome(p_day date,p_routine uuid,p_status text,p_expected_revision integer,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); ctx jsonb; h public.daily_records; x public.daily_routine_records;
 old public.daily_mutation_requests; payload jsonb; result jsonb;
BEGIN
 PERFORM crystrack_daily.lock_owner(u);
 IF p_day IS NULL OR p_routine IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
 OR p_status IS NULL OR p_status NOT IN ('pending','completed','skipped') THEN RAISE EXCEPTION 'Invalid outcome request' USING ERRCODE='22023'; END IF;
 payload:=jsonb_build_object('day',p_day,'routine',p_routine,'status',p_status,'expectedRevision',p_expected_revision);
 SELECT * INTO old FROM public.daily_mutation_requests WHERE user_id=u AND request_id=p_request_id;
 IF FOUND THEN
  IF old.payload<>payload THEN RAISE EXCEPTION 'Request ID reused' USING ERRCODE='40001'; END IF;
  RETURN old.result;
 END IF;
 ctx:=crystrack_daily.context(u);
 IF p_day<>(ctx->>'day')::date THEN RAISE EXCEPTION 'Only the open local day can change' USING ERRCODE='40001'; END IF;
 SELECT * INTO h FROM public.daily_records WHERE user_id=u AND day_key=p_day FOR UPDATE;
 IF h.close_status<>'open' OR crystrack_daily.clock()>=h.closes_at THEN RAISE EXCEPTION 'Day is closed' USING ERRCODE='40001'; END IF;
 SELECT * INTO x FROM public.daily_routine_records WHERE user_id=u AND day_key=p_day AND routine_key=p_routine;
 IF NOT FOUND THEN RAISE EXCEPTION 'Routine not eligible' USING ERRCODE='42501'; END IF;
 IF x.legacy_conflict OR x.revision<>p_expected_revision THEN RAISE EXCEPTION 'Refresh the daily record' USING ERRCODE='40001'; END IF;
 IF x.status<>p_status THEN
  UPDATE public.daily_routine_records SET status=p_status,completed_at=CASE WHEN p_status='completed' THEN crystrack_daily.clock() ELSE NULL END,
   revision=revision+1 WHERE user_id=u AND day_key=p_day AND routine_key=p_routine;
  result:=crystrack_daily.sync_outcome(u,p_day,p_routine);
  UPDATE public.daily_records SET revision=revision+1 WHERE user_id=u AND day_key=p_day;
  UPDATE public.daily_tracking_states SET data_revision=data_revision+1 WHERE user_id=u;
 ELSE
  result:=jsonb_build_object('id',coalesce(x.compatibility_occurrence_id,x.id),'task_id',p_routine,'date',p_day::timestamp AT TIME ZONE 'UTC',
   'status',x.status,'completed_at',x.completed_at,'note',NULL,'revision',x.revision,'daily_record_id',x.id);
 END IF;
 INSERT INTO public.daily_mutation_requests(user_id,request_id,payload,result,created_at) VALUES(u,p_request_id,payload,result,crystrack_daily.clock());
 RETURN result;
END $$;
CREATE FUNCTION public.recover_daily_records(p_user_id uuid,p_limit integer DEFAULT 31) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>366 THEN RAISE EXCEPTION 'Invalid recovery limit' USING ERRCODE='22023'; END IF;
 PERFORM crystrack_daily.ensure_state(p_user_id);
 IF EXISTS(SELECT 1 FROM public.daily_timezone_transitions WHERE user_id=p_user_id AND status='pending' AND effective_at<=crystrack_daily.clock()) THEN
  PERFORM crystrack_daily.context(p_user_id,false);
 END IF;
 RETURN crystrack_daily.recover_elapsed(p_user_id,p_limit);
END $$;
CREATE FUNCTION public.daily_request_timezone(p_timezone text,p_expected_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); ctx jsonb; d date; firstdate date; midnight timestamptz; boundary timestamptz; t public.daily_timezone_transitions;
BEGIN
 ctx:=crystrack_daily.context(u);
 IF NOT crystrack_daily.zone_valid(p_timezone) THEN RAISE EXCEPTION 'Invalid timezone' USING ERRCODE='22023'; END IF;
 IF p_expected_revision IS NULL OR (ctx->>'revision')::integer<>p_expected_revision OR EXISTS(SELECT 1 FROM public.daily_timezone_transitions WHERE user_id=u AND status='pending') THEN
  RAISE EXCEPTION 'Refresh scheduling settings' USING ERRCODE='40001'; END IF;
 IF p_timezone=ctx->>'timezone' THEN RETURN ctx; END IF;
 d:=(ctx->>'day')::date; midnight:=(d+1)::timestamp AT TIME ZONE (ctx->>'timezone');
 firstdate:=greatest(d+1,(midnight AT TIME ZONE p_timezone)::date);
 boundary:=greatest(midnight,firstdate::timestamp AT TIME ZONE p_timezone);
 INSERT INTO public.daily_timezone_transitions(user_id,from_timezone,to_timezone,previous_day,first_day,requested_at,effective_at)
 VALUES(u,ctx->>'timezone',p_timezone,d,firstdate,crystrack_daily.clock(),boundary) RETURNING * INTO t;
 UPDATE public.daily_tracking_states SET revision=revision+1,data_revision=data_revision+1 WHERE user_id=u;
 RETURN to_jsonb(t);
END $$;
CREATE FUNCTION public.daily_save_note(p_day date,p_body text,p_expected_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); n public.daily_notes;
BEGIN
 PERFORM crystrack_daily.lock_owner(u);
 IF p_day IS NULL OR p_day<'0001-01-01' OR p_day>'9999-12-31' OR p_body IS NULL OR char_length(p_body)>4000 OR p_expected_revision IS NULL OR p_expected_revision<0 THEN
 RAISE EXCEPTION 'Invalid daily note' USING ERRCODE='22023'; END IF;
 SELECT * INTO n FROM public.daily_notes WHERE user_id=u AND day_key=p_day FOR UPDATE;
 IF coalesce(n.revision,0)<>p_expected_revision THEN RAISE EXCEPTION 'Note revision conflict' USING ERRCODE='40001'; END IF;
 INSERT INTO public.daily_notes(user_id,day_key,body,revision,updated_at) VALUES(u,p_day,CASE WHEN p_body ~ '^[[:space:]]*$' THEN '' ELSE p_body END,1,crystrack_daily.clock())
 ON CONFLICT(user_id,day_key) DO UPDATE SET body=excluded.body,revision=public.daily_notes.revision+1,updated_at=excluded.updated_at RETURNING * INTO n;
 RETURN to_jsonb(n)-'user_id';
END $$;
-- A scalar JSON page includes ALL children, not a truncated PostgREST relationship page.
CREATE FUNCTION public.daily_read_window(p_from date,p_to date,p_after date DEFAULT NULL,p_limit integer DEFAULT 31,p_data_revision bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); ctx jsonb; rev bigint; rows jsonb; lastday date; more boolean;
BEGIN
 ctx:=crystrack_daily.context(u);
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to OR p_limit IS NULL OR p_limit<1 OR p_limit>31 OR p_to-p_from>3660 THEN
 RAISE EXCEPTION 'Invalid window' USING ERRCODE='22023'; END IF;
 SELECT data_revision INTO rev FROM public.daily_tracking_states WHERE user_id=u;
 IF p_data_revision IS NOT NULL AND p_data_revision<>rev THEN RAISE EXCEPTION 'Daily window changed; retry' USING ERRCODE='40001'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object('routines',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY routine_key)
 FROM public.daily_routine_records r WHERE r.user_id=u AND r.day_key=h.day_key),'[]'::jsonb)) ORDER BY h.day_key),'[]'::jsonb),max(h.day_key)
 INTO rows,lastday FROM (SELECT * FROM public.daily_records WHERE user_id=u AND day_key BETWEEN p_from AND p_to
 AND (p_after IS NULL OR day_key>p_after) ORDER BY day_key LIMIT p_limit) h;
 SELECT EXISTS(SELECT 1 FROM public.daily_records WHERE user_id=u AND day_key>lastday AND day_key<=p_to) INTO more;
 RETURN jsonb_build_object('records',rows,'dataRevision',rev,'nextCursor',CASE WHEN more THEN lastday ELSE NULL END,'context',ctx);
END $$;

-- Capture BEFORE changes, publish future versions AFTER changes. No routine FK in history.
CREATE FUNCTION crystrack_daily.definition_before() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid; r uuid; ctx jsonb;
BEGIN
 IF TG_TABLE_NAME='recurring_tasks' THEN
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id) THEN RAISE EXCEPTION 'Immutable routine identity' USING ERRCODE='42501'; END IF;
  u:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
 ELSE
  IF TG_OP='UPDATE' AND NEW.task_id<>OLD.task_id THEN RAISE EXCEPTION 'Immutable schedule identity' USING ERRCODE='42501'; END IF;
  r:=CASE WHEN TG_OP='DELETE' THEN OLD.task_id ELSE NEW.task_id END;
  SELECT user_id INTO u FROM public.recurring_tasks WHERE id=r;
  IF u IS NULL AND TG_OP='DELETE' THEN RETURN OLD; END IF; -- parent cascade already captured
 END IF;
 IF auth.uid() IS NOT NULL AND auth.uid()<>u THEN RAISE EXCEPTION 'Foreign routine' USING ERRCODE='42501'; END IF;
 ctx:=crystrack_daily.context(u);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE FUNCTION crystrack_daily.definition_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid; r uuid; z text;
BEGIN
 IF TG_TABLE_NAME='recurring_tasks' THEN
  u:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END; r:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 ELSE
  r:=CASE WHEN TG_OP='DELETE' THEN OLD.task_id ELSE NEW.task_id END;
  SELECT user_id INTO u FROM public.recurring_tasks WHERE id=r;
  IF u IS NULL THEN RETURN NULL; END IF;
 END IF;
 SELECT scheduling_timezone INTO z FROM public.daily_tracking_states WHERE user_id=u;
 PERFORM crystrack_daily.capture(u,r,(crystrack_daily.clock() AT TIME ZONE z)::date+1);
 RETURN NULL;
END $$;
CREATE TRIGGER daily_definition_before BEFORE INSERT OR UPDATE OR DELETE ON public.recurring_tasks FOR EACH ROW EXECUTE FUNCTION crystrack_daily.definition_before();
CREATE TRIGGER daily_definition_after AFTER INSERT OR UPDATE OR DELETE ON public.recurring_tasks FOR EACH ROW EXECUTE FUNCTION crystrack_daily.definition_after();
CREATE TRIGGER daily_schedule_before BEFORE INSERT OR UPDATE OR DELETE ON public.task_schedules FOR EACH ROW EXECUTE FUNCTION crystrack_daily.definition_before();
CREATE TRIGGER daily_schedule_after AFTER INSERT OR UPDATE OR DELETE ON public.task_schedules FOR EACH ROW EXECUTE FUNCTION crystrack_daily.definition_after();

CREATE FUNCTION crystrack_daily.profile_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user NOT IN ('postgres','supabase_admin') AND NEW.scheduling_timezone IS DISTINCT FROM OLD.scheduling_timezone THEN
 RAISE EXCEPTION 'Use explicit timezone boundary' USING ERRCODE='42501'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER daily_profile_zone BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION crystrack_daily.profile_guard();
CREATE FUNCTION crystrack_daily.occurrence_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user NOT IN ('postgres','supabase_admin') AND NOT(TG_OP='DELETE' AND pg_trigger_depth()>1) THEN
 RAISE EXCEPTION 'Use atomic daily outcome' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER daily_occurrence_guard BEFORE INSERT OR UPDATE OR DELETE ON public.task_occurrences FOR EACH ROW EXECUTE FUNCTION crystrack_daily.occurrence_guard();
REVOKE INSERT,UPDATE,DELETE ON public.task_occurrences FROM authenticated,anon;
CREATE FUNCTION crystrack_daily.freeze_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='daily_records' THEN
  IF TG_OP='DELETE' OR OLD.close_status='closed' OR (NEW.user_id,NEW.day_key,NEW.timezone,NEW.policy_version,NEW.opens_at,NEW.closes_at)
   IS DISTINCT FROM (OLD.user_id,OLD.day_key,OLD.timezone,OLD.policy_version,OLD.opens_at,OLD.closes_at) THEN
   RAISE EXCEPTION 'Frozen daily facts' USING ERRCODE='23514'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM public.daily_records WHERE user_id=OLD.user_id AND day_key=OLD.day_key AND close_status='closed') OR TG_OP='DELETE' OR
  (NEW.user_id,NEW.day_key,NEW.routine_key,NEW.schedule_version_id,NEW.title,NEW.description,NEW.preferred_time,NEW.category)
  IS DISTINCT FROM (OLD.user_id,OLD.day_key,OLD.routine_key,OLD.schedule_version_id,OLD.title,OLD.description,OLD.preferred_time,OLD.category) THEN
   RAISE EXCEPTION 'Frozen routine facts' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER daily_freeze BEFORE UPDATE OR DELETE ON public.daily_records FOR EACH ROW EXECUTE FUNCTION crystrack_daily.freeze_guard();
CREATE TRIGGER daily_routine_freeze BEFORE UPDATE OR DELETE ON public.daily_routine_records FOR EACH ROW EXECUTE FUNCTION crystrack_daily.freeze_guard();
CREATE FUNCTION crystrack_daily.complete_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid; d date; h public.daily_records;
BEGIN
 u:=NEW.user_id; d:=NEW.day_key;
 SELECT * INTO h FROM public.daily_records WHERE user_id=u AND day_key=d;
 IF h.evidence='verified' AND h.expected_count<>(SELECT count(*) FROM public.daily_routine_records WHERE user_id=u AND day_key=d) THEN
 RAISE EXCEPTION 'Incomplete verified daily set' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER daily_complete AFTER INSERT OR UPDATE ON public.daily_records DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION crystrack_daily.complete_guard();
CREATE CONSTRAINT TRIGGER daily_routine_complete AFTER INSERT OR UPDATE ON public.daily_routine_records DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION crystrack_daily.complete_guard();

-- Existing task creation is now one transaction (definition + all schedules).
CREATE FUNCTION public.daily_create_routine(p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); t public.recurring_tasks; day integer; days integer[];
BEGIN
 PERFORM crystrack_daily.context(u);
 IF p_payload IS NULL OR nullif(btrim(p_payload->>'title'),'') IS NULL OR char_length(p_payload->>'title')>255 OR jsonb_typeof(p_payload->'schedules')<>'array' THEN
 RAISE EXCEPTION 'Invalid routine' USING ERRCODE='22023'; END IF;
 SELECT array_agg(DISTINCT value::integer) INTO days FROM jsonb_array_elements_text(p_payload->'schedules');
 IF coalesce(cardinality(days),0)=0 OR NOT(days<@ARRAY[0,1,2,3,4,5,6]) THEN RAISE EXCEPTION 'Invalid schedule' USING ERRCODE='22023'; END IF;
 INSERT INTO public.recurring_tasks(user_id,title,description,preferred_time,category,reminder_config)
 VALUES(u,btrim(p_payload->>'title'),p_payload->>'description',p_payload->>'preferredTime',p_payload->>'category',p_payload->'reminderConfig') RETURNING * INTO t;
 FOREACH day IN ARRAY days LOOP INSERT INTO public.task_schedules(task_id,weekday) VALUES(t.id,day); END LOOP;
 RETURN to_jsonb(t)||jsonb_build_object('task_schedules',(SELECT jsonb_agg(to_jsonb(s)) FROM public.task_schedules s WHERE task_id=t.id));
END $$;
CREATE FUNCTION public.daily_retire_routine(p_routine uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); t public.recurring_tasks; ctx jsonb;
BEGIN
 ctx:=crystrack_daily.context(u);
 SELECT * INTO t FROM public.recurring_tasks WHERE id=p_routine AND user_id=u;
 IF NOT FOUND THEN RAISE EXCEPTION 'Routine unavailable' USING ERRCODE='42501'; END IF;
 UPDATE public.recurring_tasks SET active=false,archived_at=coalesce(archived_at,crystrack_daily.clock()) WHERE id=p_routine RETURNING * INTO t;
 UPDATE public.reminders SET status='cancelled' WHERE user_id=u AND entity_type='task' AND entity_id=p_routine AND status='pending'
  AND scheduled_for>=((ctx->>'day')::date+1)::timestamp AT TIME ZONE (ctx->>'timezone');
 RETURN jsonb_build_object('ok',true,'task',to_jsonb(t),'deletedId',p_routine,'cleanupWarning',false);
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crystrack_daily FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.daily_context(),public.daily_set_outcome(date,uuid,text,integer,uuid),public.recover_daily_records(uuid,integer),
 public.daily_request_timezone(text,integer),public.daily_save_note(date,text,integer),public.daily_read_window(date,date,date,integer,bigint),
 public.daily_create_routine(jsonb),public.daily_retire_routine(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.daily_context(),public.daily_set_outcome(date,uuid,text,integer,uuid),
 public.daily_request_timezone(text,integer),public.daily_save_note(date,text,integer),public.daily_read_window(date,date,date,integer,bigint),
 public.daily_create_routine(jsonb),public.daily_retire_routine(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recover_daily_records(uuid,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
