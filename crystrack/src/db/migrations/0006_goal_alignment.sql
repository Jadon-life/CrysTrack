BEGIN;
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS why_matters text,
  ADD COLUMN IF NOT EXISTS badge varchar(30) NOT NULL DEFAULT 'target',
  ADD COLUMN IF NOT EXISTS reflection text,
  ADD COLUMN IF NOT EXISTS milestones jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS task_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS routine_target integer NOT NULL DEFAULT 10 CHECK (routine_target BETWEEN 1 AND 100000),
  ADD COLUMN IF NOT EXISTS finance_target_id uuid REFERENCES public.finance_targets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_source varchar(30) NOT NULL DEFAULT 'manual' CHECK (progress_source IN ('manual','milestones','tasks'));

-- Goal plans, including their embedded milestones, share the goal owner's RLS boundary.
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS goal_plan_owner ON public.goals;
CREATE POLICY goal_plan_owner ON public.goals FOR ALL TO authenticated
 USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.validate_goal_alignment() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
 IF NEW.user_id IS DISTINCT FROM auth.uid() AND current_user = 'authenticated' THEN
  RAISE EXCEPTION 'Goal ownership required' USING ERRCODE = '42501';
 END IF;
 IF NEW.finance_target_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.finance_targets WHERE id=NEW.finance_target_id AND user_id=NEW.user_id
 ) THEN RAISE EXCEPTION 'Target ownership required' USING ERRCODE = '42501'; END IF;
 IF EXISTS (SELECT 1 FROM unnest(NEW.task_ids) AS linked(task_id) WHERE NOT EXISTS (
   SELECT 1 FROM public.recurring_tasks t WHERE t.id=linked.task_id AND t.user_id=NEW.user_id
 )) THEN RAISE EXCEPTION 'Routine ownership required' USING ERRCODE = '42501'; END IF;
 IF jsonb_typeof(NEW.milestones) <> 'array' OR jsonb_array_length(NEW.milestones)>50 THEN
  RAISE EXCEPTION 'Invalid milestones' USING ERRCODE='22023';
 END IF;
 IF NEW.status NOT IN ('active','achieved','paused','let_go','completed','abandoned') THEN
  RAISE EXCEPTION 'Invalid lifecycle' USING ERRCODE='22023';
 END IF;
 IF TG_OP='UPDATE' THEN
  NEW.revision := OLD.revision+1;
  IF NEW.task_ids IS DISTINCT FROM OLD.task_ids OR NEW.progress_source IS DISTINCT FROM OLD.progress_source OR NEW.target_value IS DISTINCT FROM OLD.target_value OR NEW.starting_value IS DISTINCT FROM OLD.starting_value OR NEW.routine_target IS DISTINCT FROM OLD.routine_target OR NEW.progress_mode IS DISTINCT FROM OLD.progress_mode THEN NEW.linked_at:=now(); END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('achieved','paused','let_go') AND length(trim(coalesce(NEW.reflection,'')))=0 THEN
   RAISE EXCEPTION 'Please add a reflection' USING ERRCODE='22023';
  END IF;
 END IF;
 IF NEW.status='achieved' THEN NEW.completed_at:=coalesce(NEW.completed_at,now());
 ELSIF NEW.status='active' THEN NEW.completed_at:=NULL; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS goal_alignment_guard ON public.goals;
CREATE TRIGGER goal_alignment_guard BEFORE INSERT OR UPDATE ON public.goals
 FOR EACH ROW EXECUTE FUNCTION public.validate_goal_alignment();

-- A single transaction covers all goal fields, milestones, and links. A revision prevents stale edits.
CREATE OR REPLACE FUNCTION public.save_goal_alignment(p_id uuid, p_revision integer, p_plan jsonb)
RETURNS public.goals LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE g public.goals; candidate public.goals;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_plan) k WHERE k NOT IN (
 'title','description','category','deadline','measurable','starting_value','target_value','progress_value',
 'progress_unit','progress_mode','ai_coaching','checkin_config','deadline_reminder_config',
 'why_matters','badge','reflection','milestones','task_ids','routine_target','finance_target_id','progress_source','status'
 )) THEN RAISE EXCEPTION 'Unknown plan field' USING ERRCODE='22023'; END IF;
 IF p_id IS NULL THEN
  INSERT INTO public.goals(user_id,title) VALUES(auth.uid(), 'New goal') RETURNING * INTO g;
 ELSE
  SELECT * INTO g FROM public.goals WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Goal unavailable' USING ERRCODE='P0002'; END IF;
  IF p_revision IS NULL OR g.revision<>p_revision THEN RAISE EXCEPTION 'Goal changed; refresh and try again' USING ERRCODE='40001'; END IF;
 END IF;
 candidate := jsonb_populate_record(g,p_plan);
 IF length(trim(candidate.title)) NOT BETWEEN 1 AND 255 THEN RAISE EXCEPTION 'Title required' USING ERRCODE='22023'; END IF;
 IF candidate.progress_source='milestones' AND jsonb_array_length(candidate.milestones)=0 THEN RAISE EXCEPTION 'Add a milestone' USING ERRCODE='22023'; END IF;
 IF candidate.progress_source='tasks' AND cardinality(candidate.task_ids)=0 THEN RAISE EXCEPTION 'Link a routine' USING ERRCODE='22023'; END IF;
 IF candidate.progress_source='manual' AND candidate.progress_mode='percentage' AND (candidate.target_value IS NULL OR candidate.target_value=coalesce(candidate.starting_value,0)) THEN
  RAISE EXCEPTION 'Choose distinct starting and target values' USING ERRCODE='22023';
 END IF;
 UPDATE public.goals SET title=trim(candidate.title), description=candidate.description, category=candidate.category,
 deadline=candidate.deadline, measurable=candidate.measurable, starting_value=candidate.starting_value,
 target_value=candidate.target_value, progress_value=candidate.progress_value, progress_unit=candidate.progress_unit,
 progress_mode=candidate.progress_mode, ai_coaching=candidate.ai_coaching, checkin_config=candidate.checkin_config,
 deadline_reminder_config=candidate.deadline_reminder_config, why_matters=candidate.why_matters,
 badge=candidate.badge, reflection=candidate.reflection, milestones=candidate.milestones, task_ids=candidate.task_ids,
 routine_target=candidate.routine_target, finance_target_id=candidate.finance_target_id,
 progress_source=candidate.progress_source, status=candidate.status WHERE id=g.id RETURNING * INTO g;
 RETURN g;
END $$;
REVOKE ALL ON FUNCTION public.save_goal_alignment(uuid,integer,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_goal_alignment(uuid,integer,jsonb) TO authenticated;

-- Lock the goal during check-ins so pausing/achieving cannot race a submission.
CREATE OR REPLACE FUNCTION public.guard_goal_alignment_checkin() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE g public.goals; zone text; today date; start_day date; end_day date; frequency text; expected_key text; selected_day integer;
BEGIN
 SELECT * INTO g FROM public.goals WHERE id=NEW.goal_id AND user_id=NEW.user_id FOR UPDATE;
 IF NOT FOUND OR g.status<>'active' OR (g.deadline IS NOT NULL AND g.deadline<now()) THEN
  RAISE EXCEPTION 'Goal is not accepting check-ins; refresh to continue' USING ERRCODE='40001';
 END IF;
 SELECT coalesce(nullif(current_timezone,''),nullif(timezone,''),'UTC') INTO zone FROM profiles WHERE user_id=NEW.user_id;
 zone:=coalesce(zone,'UTC');
 today:=(now() AT TIME ZONE zone)::date;
 frequency:=coalesce(g.checkin_config->>'frequency','weekly');
 start_day:=today; end_day:=today;
 IF frequency='specific' AND NOT coalesce(g.checkin_config->'days','[]'::jsonb) @> to_jsonb(ARRAY[extract(dow FROM today)::integer]) THEN
  RAISE EXCEPTION 'Check-in rhythm changed; refresh' USING ERRCODE='40001';
 ELSIF frequency='weekly' THEN
  selected_day:=coalesce((g.checkin_config->'days'->>0)::integer,extract(dow FROM today)::integer);
  start_day:=today-((extract(dow FROM today)::integer-selected_day+7)%7);end_day:=start_day+6;
 END IF;
 expected_key:=frequency||':'||start_day::text;
 IF NEW.occurrence_key IS NOT NULL AND NEW.occurrence_key<>expected_key THEN
  RAISE EXCEPTION 'Check-in rhythm changed; refresh' USING ERRCODE='40001';
 END IF;
 NEW.occurrence_key:=expected_key;NEW.occurrence_start_date:=start_day;NEW.occurrence_end_date:=end_day;
 IF g.progress_source<>'manual' OR g.progress_mode<>'percentage' THEN
  NEW.progress_value:=NULL; NEW.progress_percent:=NULL;
 ELSIF NEW.progress_value IS NOT NULL THEN
  IF g.target_value IS NULL OR g.target_value=coalesce(g.starting_value,0) OR NEW.progress_value<least(coalesce(g.starting_value,0),g.target_value) OR NEW.progress_value>greatest(coalesce(g.starting_value,0),g.target_value) THEN
   RAISE EXCEPTION 'Check the measured value' USING ERRCODE='22023';
  END IF;
  NEW.progress_percent:=round((NEW.progress_value-coalesce(g.starting_value,0))*100/(g.target_value-coalesce(g.starting_value,0)),2);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS goal_alignment_checkin_guard ON public.goal_checkins;
CREATE TRIGGER goal_alignment_checkin_guard BEFORE INSERT ON public.goal_checkins FOR EACH ROW EXECUTE FUNCTION public.guard_goal_alignment_checkin();
CREATE OR REPLACE FUNCTION public.sync_goal_alignment_checkin() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.progress_value IS NOT NULL THEN
  UPDATE public.goals SET progress_value=NEW.progress_value WHERE id=NEW.goal_id AND user_id=NEW.user_id;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS goal_alignment_checkin_sync ON public.goal_checkins;
CREATE TRIGGER goal_alignment_checkin_sync AFTER INSERT ON public.goal_checkins FOR EACH ROW EXECUTE FUNCTION public.sync_goal_alignment_checkin();
COMMIT;
