BEGIN;
ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'focus_completed';
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE IF NOT EXISTS public.daily_rituals (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,day date NOT NULL,
 top_three jsonb NOT NULL DEFAULT '[]',deferred jsonb NOT NULL DEFAULT '[]',deferred_to date,
 capacity_minutes integer NOT NULL DEFAULT 480 CHECK(capacity_minutes BETWEEN 0 AND 1440),
 wins text NOT NULL DEFAULT '',reflection text NOT NULL DEFAULT '',weekly_reflection text NOT NULL DEFAULT '',next_focus uuid[] NOT NULL DEFAULT '{}',
 morning_at timestamptz,evening_at timestamptz,review_at timestamptz,revision integer NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,day),CHECK(jsonb_typeof(top_three)='array' AND jsonb_array_length(top_three)<=3),
 CHECK(jsonb_typeof(deferred)='array' AND jsonb_array_length(deferred)<=50),CHECK(cardinality(next_focus)<=3)
);
CREATE TABLE IF NOT EXISTS public.task_timeboxes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 task_id uuid NOT NULL REFERENCES public.recurring_tasks(id) ON DELETE CASCADE,occurrence_day date NOT NULL,
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,
 UNIQUE(user_id,task_id,occurrence_day),CHECK(ends_at>=starts_at+interval '5 minutes' AND ends_at<=starts_at+interval '480 minutes'),
 EXCLUDE USING gist(user_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&)
);
CREATE TABLE IF NOT EXISTS public.task_focus_sessions (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 task_id uuid NOT NULL REFERENCES public.recurring_tasks(id) ON DELETE CASCADE,
 planned_minutes integer NOT NULL CHECK(planned_minutes BETWEEN 1 AND 180),elapsed_seconds integer NOT NULL DEFAULT 0 CHECK(elapsed_seconds>=0),
 status varchar(20) NOT NULL DEFAULT 'running' CHECK(status IN ('running','paused','completed','cancelled')),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),resumed_at timestamptz DEFAULT clock_timestamp(),completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_focus_per_user ON public.task_focus_sessions(user_id) WHERE status IN ('running','paused');
CREATE INDEX IF NOT EXISTS focus_owner_completed ON public.task_focus_sessions(user_id,completed_at);
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['daily_rituals','task_timeboxes','task_focus_sessions'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('DROP POLICY IF EXISTS rhythm_owner ON public.%I',t);
 EXECUTE format('CREATE POLICY rhythm_owner ON public.%I FOR SELECT TO authenticated USING(user_id=auth.uid())',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
END LOOP;END $$;

CREATE OR REPLACE FUNCTION public.save_task_timebox(p_task uuid,p_day date,p_start timestamptz,p_minutes integer)
RETURNS public.task_timeboxes LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid();zone text;result public.task_timeboxes;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.recurring_tasks WHERE id=p_task AND user_id=uid AND archived_at IS NULL AND active=true) THEN RAISE EXCEPTION 'Task unavailable' USING ERRCODE='P0002';END IF;
 SELECT coalesce(nullif(current_timezone,''),nullif(timezone,''),'UTC') INTO zone FROM public.profiles WHERE user_id=uid;zone:=coalesce(zone,'UTC');
 IF (p_start AT TIME ZONE zone)::date<>p_day OR p_minutes NOT BETWEEN 5 AND 480 THEN RAISE EXCEPTION 'Choose a valid local slot' USING ERRCODE='22023';END IF;
 INSERT INTO public.task_timeboxes(user_id,task_id,occurrence_day,starts_at,ends_at) VALUES(uid,p_task,p_day,p_start,p_start+make_interval(mins=>p_minutes))
 ON CONFLICT(user_id,task_id,occurrence_day) DO UPDATE SET starts_at=excluded.starts_at,ends_at=excluded.ends_at RETURNING * INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.remove_task_timebox(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';END IF;
 DELETE FROM public.task_timeboxes WHERE id=p_id AND user_id=auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.save_daily_ritual(p_plan jsonb) RETURNS public.daily_rituals
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid();zone text;today date;target date;kind text:=p_plan->>'kind';current_row public.daily_rituals;r jsonb;entity uuid;candidate public.daily_rituals;deadline_local timestamp;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';END IF;
 SELECT coalesce(nullif(current_timezone,''),nullif(timezone,''),'UTC') INTO zone FROM public.profiles WHERE user_id=uid;zone:=coalesce(zone,'UTC');today:=(clock_timestamp() AT TIME ZONE zone)::date;
 target:=(p_plan->>'day')::date;
 IF jsonb_typeof(p_plan->'topThree') IS DISTINCT FROM 'array' OR jsonb_typeof(p_plan->'deferred') IS DISTINCT FROM 'array' OR jsonb_typeof(p_plan->'nextFocus') IS DISTINCT FROM 'array' OR (p_plan->>'capacityMinutes') IS NULL THEN RAISE EXCEPTION 'Complete the ritual fields' USING ERRCODE='22023';END IF;
 IF kind IS NULL OR target IS NULL OR (p_plan->>'expectedRevision') IS NULL OR kind NOT IN ('morning','evening','weekly') OR (kind<>'weekly' AND target<>today) OR (kind='weekly' AND target<>today-extract(dow FROM today)::integer) THEN RAISE EXCEPTION 'Refresh your local day' USING ERRCODE='40001';END IF;
 INSERT INTO public.daily_rituals(user_id,day) VALUES(uid,target) ON CONFLICT DO NOTHING;
 SELECT * INTO current_row FROM public.daily_rituals WHERE user_id=uid AND day=target FOR UPDATE;
 IF current_row.revision<>(p_plan->>'expectedRevision')::integer THEN RAISE EXCEPTION 'Ritual changed; refresh' USING ERRCODE='40001';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_plan->'topThree','[]')) UNION ALL SELECT value FROM jsonb_array_elements(coalesce(p_plan->'deferred','[]')) LOOP
 entity:=(r->>'id')::uuid;
 IF NOT ((r->>'type'='task' AND EXISTS(SELECT 1 FROM public.recurring_tasks WHERE id=entity AND user_id=uid)) OR (r->>'type'='assignment' AND EXISTS(SELECT 1 FROM public.assignments WHERE id=entity AND user_id=uid)) OR (r->>'type'='goal' AND EXISTS(SELECT 1 FROM public.goals WHERE id=entity AND user_id=uid))) THEN RAISE EXCEPTION 'Choose your own items' USING ERRCODE='42501';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(p_plan->'nextFocus','[]')) id WHERE NOT EXISTS(SELECT 1 FROM public.goals g WHERE g.id=id::uuid AND g.user_id=uid AND g.status='active')) THEN RAISE EXCEPTION 'Goal unavailable' USING ERRCODE='42501';END IF;
 IF kind IN ('morning','evening') THEN
 IF jsonb_array_length(p_plan->'deferred')>0 AND ((p_plan->>'deferredTo') IS NULL OR (p_plan->>'deferredTo')::date<=target) THEN RAISE EXCEPTION 'Choose a later date' USING ERRCODE='22023';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_plan->'deferred') LOOP
 IF r->>'type'='assignment' THEN
 SELECT (deadline AT TIME ZONE zone) INTO deadline_local FROM public.assignments WHERE id=(r->>'id')::uuid AND user_id=uid AND status NOT IN ('completed','dropped') FOR UPDATE;
 IF FOUND THEN UPDATE public.assignments SET deadline=((p_plan->>'deferredTo')::date+deadline_local::time) AT TIME ZONE zone WHERE id=(r->>'id')::uuid AND user_id=uid;END IF;
 ELSIF r->>'type'='task' THEN
 DELETE FROM public.task_timeboxes WHERE user_id=uid AND task_id=(r->>'id')::uuid AND occurrence_day=target;
 END IF;END LOOP;
 END IF;
 UPDATE public.daily_rituals SET
 top_three=CASE WHEN kind='morning' THEN p_plan->'topThree' ELSE top_three END,
 deferred=CASE WHEN kind IN ('morning','evening') THEN p_plan->'deferred' ELSE deferred END,
 deferred_to=CASE WHEN kind IN ('morning','evening') THEN (p_plan->>'deferredTo')::date ELSE deferred_to END,
 capacity_minutes=CASE WHEN kind='morning' THEN (p_plan->>'capacityMinutes')::integer ELSE capacity_minutes END,
 wins=CASE WHEN kind='evening' THEN left(p_plan->>'wins',3000) ELSE wins END,
 reflection=CASE WHEN kind='evening' THEN left(p_plan->>'reflection',500) ELSE reflection END,
 weekly_reflection=CASE WHEN kind='weekly' THEN left(p_plan->>'reflection',500) ELSE weekly_reflection END,
 next_focus=CASE WHEN kind='weekly' THEN ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_plan->'nextFocus')) ELSE next_focus END,
 morning_at=CASE WHEN kind='morning' THEN clock_timestamp() ELSE morning_at END,
 evening_at=CASE WHEN kind='evening' THEN clock_timestamp() ELSE evening_at END,
 review_at=CASE WHEN kind='weekly' THEN clock_timestamp() ELSE review_at END,revision=revision+1
 WHERE user_id=uid AND day=target RETURNING * INTO candidate;RETURN candidate;
END $$;

CREATE OR REPLACE FUNCTION public.control_task_focus(p_action text,p_id uuid,p_task uuid DEFAULT NULL,p_minutes integer DEFAULT NULL)
RETURNS public.task_focus_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid();s public.task_focus_sessions;elapsed integer;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';END IF;
 IF p_action='start' THEN
 IF NOT EXISTS(SELECT 1 FROM public.recurring_tasks WHERE id=p_task AND user_id=uid AND archived_at IS NULL AND active=true) THEN RAISE EXCEPTION 'Task unavailable' USING ERRCODE='P0002';END IF;
 INSERT INTO public.task_focus_sessions(id,user_id,task_id,planned_minutes) VALUES(p_id,uid,p_task,p_minutes) ON CONFLICT(id) DO NOTHING;
 END IF;
 SELECT * INTO s FROM public.task_focus_sessions WHERE id=p_id AND user_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Focus session unavailable' USING ERRCODE='P0002';END IF;
 IF s.status IN ('completed','cancelled') OR p_action='start' THEN RETURN s;END IF;
 elapsed:=s.elapsed_seconds+CASE WHEN s.status='running' THEN greatest(0,floor(extract(epoch FROM clock_timestamp()-s.resumed_at))::integer) ELSE 0 END;
 IF p_action='complete' AND elapsed<s.planned_minutes*60 THEN RAISE EXCEPTION 'Your focus block is still running' USING ERRCODE='40001';END IF;
 IF p_action NOT IN ('pause','resume','complete','cancel') THEN RAISE EXCEPTION 'Invalid focus action' USING ERRCODE='22023';END IF;
 UPDATE public.task_focus_sessions SET elapsed_seconds=least(elapsed,planned_minutes*60),status=CASE p_action WHEN 'pause' THEN 'paused' WHEN 'resume' THEN 'running' WHEN 'complete' THEN 'completed' ELSE 'cancelled' END,
 resumed_at=CASE WHEN p_action='resume' THEN clock_timestamp() ELSE NULL END,completed_at=CASE WHEN p_action='complete' THEN clock_timestamp() ELSE NULL END WHERE id=s.id RETURNING * INTO s;
 IF p_action='complete' THEN INSERT INTO public.activity_events(user_id,type,entity_type,entity_id,metadata_json) VALUES(uid,'focus_completed','task',s.task_id,jsonb_build_object('session_id',s.id,'minutes',s.planned_minutes));END IF;
 RETURN s;
END $$;
REVOKE ALL ON FUNCTION public.save_task_timebox(uuid,date,timestamptz,integer),public.remove_task_timebox(uuid),public.save_daily_ritual(jsonb),public.control_task_focus(text,uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_task_timebox(uuid,date,timestamptz,integer),public.remove_task_timebox(uuid),public.save_daily_ritual(jsonb),public.control_task_focus(text,uuid,uuid,integer) TO authenticated;

-- Owner RLS remains in force when reading aggregate task analytics.
CREATE OR REPLACE VIEW public.task_focus_totals WITH (security_invoker=true) AS
 SELECT user_id,task_id,sum(planned_minutes) AS minutes FROM public.task_focus_sessions
 WHERE status='completed' GROUP BY user_id,task_id;
REVOKE ALL ON public.task_focus_totals FROM PUBLIC,anon;
GRANT SELECT ON public.task_focus_totals TO authenticated;

COMMIT;
