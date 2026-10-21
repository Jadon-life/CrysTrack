-- Issue #15: business conflicts must reach PostgREST as HTTP 409 immediately.
-- The local HTTP rehearsal reproduced timeouts for explicit SQLSTATE 40001.
-- PT409 is PostgREST's custom HTTP conflict code, not a serialization failure.
-- Prerequisite: reviewed 0013. No tables, policies, grants or data are changed.
-- Replacement retains each existing function's ownership and ACL.
-- Bodies below match 0013 except the eight business-conflict SQLSTATEs.
BEGIN;

CREATE OR REPLACE FUNCTION crystrack_daily.context(u uuid,p_recover boolean DEFAULT true) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
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
   RAISE EXCEPTION 'Scheduling timezone boundary in progress' USING ERRCODE='PT409';
  END IF;
 END IF;
 IF p_recover THEN PERFORM crystrack_daily.recover_elapsed(u,31); END IF;
 d:=(crystrack_daily.clock() AT TIME ZONE s.scheduling_timezone)::date;
 PERFORM crystrack_daily.materialize(u,d);
 RETURN jsonb_build_object('day',d,'timezone',s.scheduling_timezone,'revision',s.revision,'captureStartsOn',s.capture_starts_on);
END $$;

CREATE OR REPLACE FUNCTION public.daily_set_outcome(p_day date,p_routine uuid,p_status text,p_expected_revision integer,p_request_id uuid)
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
  IF old.payload<>payload THEN RAISE EXCEPTION 'Request ID reused' USING ERRCODE='PT409'; END IF;
  RETURN old.result;
 END IF;
 ctx:=crystrack_daily.context(u);
 IF p_day<>(ctx->>'day')::date THEN RAISE EXCEPTION 'Only the open local day can change' USING ERRCODE='PT409'; END IF;
 SELECT * INTO h FROM public.daily_records WHERE user_id=u AND day_key=p_day FOR UPDATE;
 IF h.close_status<>'open' OR crystrack_daily.clock()>=h.closes_at THEN RAISE EXCEPTION 'Day is closed' USING ERRCODE='PT409'; END IF;
 SELECT * INTO x FROM public.daily_routine_records WHERE user_id=u AND day_key=p_day AND routine_key=p_routine;
 IF NOT FOUND THEN RAISE EXCEPTION 'Routine not eligible' USING ERRCODE='42501'; END IF;
 IF x.legacy_conflict OR x.revision<>p_expected_revision THEN RAISE EXCEPTION 'Refresh the daily record' USING ERRCODE='PT409'; END IF;
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

CREATE OR REPLACE FUNCTION public.daily_request_timezone(p_timezone text,p_expected_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); ctx jsonb; d date; firstdate date; midnight timestamptz; boundary timestamptz; t public.daily_timezone_transitions;
BEGIN
 ctx:=crystrack_daily.context(u);
 IF NOT crystrack_daily.zone_valid(p_timezone) THEN RAISE EXCEPTION 'Invalid timezone' USING ERRCODE='22023'; END IF;
 IF p_expected_revision IS NULL OR (ctx->>'revision')::integer<>p_expected_revision OR EXISTS(SELECT 1 FROM public.daily_timezone_transitions WHERE user_id=u AND status='pending') THEN
  RAISE EXCEPTION 'Refresh scheduling settings' USING ERRCODE='PT409'; END IF;
 IF p_timezone=ctx->>'timezone' THEN RETURN ctx; END IF;
 d:=(ctx->>'day')::date; midnight:=(d+1)::timestamp AT TIME ZONE (ctx->>'timezone');
 firstdate:=greatest(d+1,(midnight AT TIME ZONE p_timezone)::date);
 boundary:=greatest(midnight,firstdate::timestamp AT TIME ZONE p_timezone);
 INSERT INTO public.daily_timezone_transitions(user_id,from_timezone,to_timezone,previous_day,first_day,requested_at,effective_at)
 VALUES(u,ctx->>'timezone',p_timezone,d,firstdate,crystrack_daily.clock(),boundary) RETURNING * INTO t;
 UPDATE public.daily_tracking_states SET revision=revision+1,data_revision=data_revision+1 WHERE user_id=u;
 RETURN to_jsonb(t);
END $$;

CREATE OR REPLACE FUNCTION public.daily_save_note(p_day date,p_body text,p_expected_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); n public.daily_notes;
BEGIN
 PERFORM crystrack_daily.lock_owner(u);
 IF p_day IS NULL OR p_day<'0001-01-01' OR p_day>'9999-12-31' OR p_body IS NULL OR char_length(p_body)>4000 OR p_expected_revision IS NULL OR p_expected_revision<0 THEN
 RAISE EXCEPTION 'Invalid daily note' USING ERRCODE='22023'; END IF;
 SELECT * INTO n FROM public.daily_notes WHERE user_id=u AND day_key=p_day FOR UPDATE;
 IF coalesce(n.revision,0)<>p_expected_revision THEN RAISE EXCEPTION 'Note revision conflict' USING ERRCODE='PT409'; END IF;
 INSERT INTO public.daily_notes(user_id,day_key,body,revision,updated_at) VALUES(u,p_day,CASE WHEN p_body ~ '^[[:space:]]*$' THEN '' ELSE p_body END,1,crystrack_daily.clock())
 ON CONFLICT(user_id,day_key) DO UPDATE SET body=excluded.body,revision=public.daily_notes.revision+1,updated_at=excluded.updated_at RETURNING * INTO n;
 RETURN to_jsonb(n)-'user_id';
END $$;

CREATE OR REPLACE FUNCTION public.daily_read_window(p_from date,p_to date,p_after date DEFAULT NULL,p_limit integer DEFAULT 31,p_data_revision bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); ctx jsonb; rev bigint; rows jsonb; lastday date; more boolean;
BEGIN
 ctx:=crystrack_daily.context(u);
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to OR p_limit IS NULL OR p_limit<1 OR p_limit>31 OR p_to-p_from>3660 THEN
 RAISE EXCEPTION 'Invalid window' USING ERRCODE='22023'; END IF;
 SELECT data_revision INTO rev FROM public.daily_tracking_states WHERE user_id=u;
 IF p_data_revision IS NOT NULL AND p_data_revision<>rev THEN RAISE EXCEPTION 'Daily window changed; retry' USING ERRCODE='PT409'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object('routines',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY routine_key)
 FROM public.daily_routine_records r WHERE r.user_id=u AND r.day_key=h.day_key),'[]'::jsonb)) ORDER BY h.day_key),'[]'::jsonb),max(h.day_key)
 INTO rows,lastday FROM (SELECT * FROM public.daily_records WHERE user_id=u AND day_key BETWEEN p_from AND p_to
 AND (p_after IS NULL OR day_key>p_after) ORDER BY day_key LIMIT p_limit) h;
 SELECT EXISTS(SELECT 1 FROM public.daily_records WHERE user_id=u AND day_key>lastday AND day_key<=p_to) INTO more;
 RETURN jsonb_build_object('records',rows,'dataRevision',rev,'nextCursor',CASE WHEN more THEN lastday ELSE NULL END,'context',ctx);
END $$;

COMMIT;
