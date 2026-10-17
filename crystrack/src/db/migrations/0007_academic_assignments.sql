BEGIN;
ALTER TYPE public.assignment_status ADD VALUE IF NOT EXISTS 'dropped';
ALTER TABLE public.assignments
 ADD COLUMN IF NOT EXISTS course_code varchar(30),
 ADD COLUMN IF NOT EXISTS academic_kind varchar(20) NOT NULL DEFAULT 'Assignment',
 ADD COLUMN IF NOT EXISTS point_weight decimal(5,2),
 ADD COLUMN IF NOT EXISTS estimated_minutes integer,
 ADD COLUMN IF NOT EXISTS work_start_at timestamptz,
 ADD COLUMN IF NOT EXISTS subtasks jsonb NOT NULL DEFAULT '[]'::jsonb,
 ADD COLUMN IF NOT EXISTS finished_late boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.assignments'::regclass AND conname='assignment_academic_kind_check') THEN
  ALTER TABLE public.assignments ADD CONSTRAINT assignment_academic_kind_check CHECK(academic_kind IN ('Assignment','Test','Lab','Project'));
  ALTER TABLE public.assignments ADD CONSTRAINT assignment_point_weight_check CHECK(point_weight BETWEEN 0 AND 100);
  ALTER TABLE public.assignments ADD CONSTRAINT assignment_estimated_minutes_check CHECK(estimated_minutes BETWEEN 0 AND 60000);
  ALTER TABLE public.assignments ADD CONSTRAINT assignment_subtasks_array_check CHECK(jsonb_typeof(subtasks)='array' AND jsonb_array_length(subtasks)<=50);
 END IF;
END $$;
UPDATE public.assignments SET finished_late=(completed_at>deadline)
 WHERE status='completed' AND completed_at IS NOT NULL AND revision=0;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS academic_assignment_owner ON public.assignments;
CREATE POLICY academic_assignment_owner ON public.assignments FOR ALL TO authenticated
 USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());

CREATE OR REPLACE FUNCTION public.guard_academic_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.title IS NULL OR length(trim(NEW.title)) NOT BETWEEN 1 AND 255 THEN
  RAISE EXCEPTION 'Title required' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.subtasks) item WHERE
   jsonb_typeof(item->'title') IS DISTINCT FROM 'string' OR length(trim(item->>'title')) NOT BETWEEN 1 AND 255
   OR jsonb_typeof(item->'completed') IS DISTINCT FROM 'boolean'
   OR coalesce(item->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
  RAISE EXCEPTION 'Invalid subtask' USING ERRCODE='22023';
 END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(NEW.subtasks))<>(SELECT count(DISTINCT item->>'id') FROM jsonb_array_elements(NEW.subtasks) item) THEN
  RAISE EXCEPTION 'Duplicate subtask' USING ERRCODE='22023';
 END IF;
 IF TG_OP='UPDATE' THEN
  NEW.revision:=OLD.revision+1;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Ownership cannot change' USING ERRCODE='42501'; END IF;
 END IF;
 IF NEW.status::text='completed' THEN
  IF TG_OP='UPDATE' AND OLD.status::text='completed' THEN
   NEW.completed_at:=OLD.completed_at;NEW.finished_late:=OLD.finished_late;
  ELSE
   NEW.completed_at:=clock_timestamp();NEW.finished_late:=NEW.completed_at>NEW.deadline;
  END IF;
 ELSE NEW.completed_at:=NULL;NEW.finished_late:=false;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS academic_assignment_guard ON public.assignments;
CREATE TRIGGER academic_assignment_guard BEFORE INSERT OR UPDATE ON public.assignments
 FOR EACH ROW EXECUTE FUNCTION public.guard_academic_assignment();

CREATE OR REPLACE FUNCTION public.academic_assignment_effects() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status::text='completed' AND OLD.status::text<>'completed' THEN
  INSERT INTO public.activity_events(user_id,type,entity_type,entity_id,metadata_json)
  VALUES(NEW.user_id,'assignment_completed','assignment',NEW.id,jsonb_build_object('title',NEW.title,'status','completed','finished_late',NEW.finished_late));
 END IF;
 IF NEW.deadline IS DISTINCT FROM OLD.deadline OR NEW.reminder_config IS DISTINCT FROM OLD.reminder_config OR NEW.status::text IN ('completed','dropped') THEN
  UPDATE public.reminders SET status='cancelled' WHERE user_id=NEW.user_id AND entity_type='assignment' AND entity_id=NEW.id AND status IN ('pending','snoozed');
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS academic_assignment_effects ON public.assignments;
CREATE TRIGGER academic_assignment_effects AFTER UPDATE ON public.assignments
 FOR EACH ROW EXECUTE FUNCTION public.academic_assignment_effects();

CREATE OR REPLACE FUNCTION public.save_academic_assignment(p_id uuid,p_revision integer,p_plan jsonb)
RETURNS public.assignments LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE a public.assignments; candidate public.assignments;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_plan) k WHERE k NOT IN ('title','description','deadline','priority','category','course_code','academic_kind','point_weight','estimated_minutes','work_start_at','subtasks','reminder_config','status')) THEN
  RAISE EXCEPTION 'Unknown assignment field' USING ERRCODE='22023';
 END IF;
 IF p_plan ? 'status' AND p_plan->>'status' NOT IN ('upcoming','dropped') THEN
  RAISE EXCEPTION 'Use the completion action to finish an assignment' USING ERRCODE='22023';
 END IF;
 IF p_id IS NULL THEN
  INSERT INTO public.assignments(user_id,title,deadline) VALUES(auth.uid(),'New assignment',now()) RETURNING * INTO a;
 ELSE
  SELECT * INTO a FROM public.assignments WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignment unavailable' USING ERRCODE='P0002'; END IF;
  IF p_revision IS NULL OR a.revision<>p_revision THEN RAISE EXCEPTION 'Assignment changed; refresh' USING ERRCODE='40001'; END IF;
 END IF;
 candidate:=jsonb_populate_record(a,p_plan);
 UPDATE public.assignments SET title=trim(candidate.title),description=candidate.description,deadline=candidate.deadline,
 priority=candidate.priority,category=candidate.category,course_code=nullif(upper(trim(candidate.course_code)),''),
 academic_kind=candidate.academic_kind,point_weight=candidate.point_weight,estimated_minutes=candidate.estimated_minutes,
 work_start_at=candidate.work_start_at,subtasks=candidate.subtasks,reminder_config=candidate.reminder_config,status=candidate.status
 WHERE id=a.id RETURNING * INTO a;
 RETURN a;
END $$;
CREATE OR REPLACE FUNCTION public.finish_academic_assignment(p_id uuid)
RETURNS public.assignments LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE a public.assignments;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.assignments WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assignment unavailable' USING ERRCODE='P0002'; END IF;
 IF a.status::text='dropped' THEN RAISE EXCEPTION 'Restore the assignment before finishing' USING ERRCODE='40001'; END IF;
 IF a.status::text='completed' THEN RETURN a; END IF;
 UPDATE public.assignments SET status='completed' WHERE id=a.id RETURNING * INTO a;
 RETURN a;
END $$;
REVOKE ALL ON FUNCTION public.save_academic_assignment(uuid,integer,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.finish_academic_assignment(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_academic_assignment(uuid,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_academic_assignment(uuid) TO authenticated;
COMMIT;
