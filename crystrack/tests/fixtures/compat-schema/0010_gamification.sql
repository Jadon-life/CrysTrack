-- Piece 8: rewards come from authoritative rows, never client-submitted XP or activity logs.
BEGIN;
SET LOCAL search_path=public;
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS hide_gamification boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS public.gamification_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 action_key text NOT NULL,
 kind varchar(20) NOT NULL CHECK(kind IN ('task','goal','expense','morning','evening','weekly','assignment')),
 source_id text NOT NULL,
 day date NOT NULL,
 area varchar(100),
 active boolean NOT NULL DEFAULT true,
 on_time boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(user_id,action_key)
);
CREATE INDEX IF NOT EXISTS gamification_owner_day ON public.gamification_events(user_id,day);
ALTER TABLE public.gamification_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gamification_owner_read ON public.gamification_events;
CREATE POLICY gamification_owner_read ON public.gamification_events FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.gamification_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.gamification_events TO authenticated;

-- Private trigger helper. SECURITY DEFINER is limited to writing the protected ledger;
-- identity, source state and earning date are derived by the trigger, not API parameters.
CREATE OR REPLACE FUNCTION public.capture_gamification_action() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid();owner_id uuid;key text;source text;kind text;zone text;today date;area text;eligible boolean;ontime boolean:=false;row_day date;phase text;old_task uuid;can_create boolean:=TG_OP='INSERT';
BEGIN
 IF uid IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME IN ('task_occurrences','goal_checkins','assignments') THEN
  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Action identity cannot change' USING ERRCODE='23514';END IF;
 END IF;
 IF TG_TABLE_NAME='daily_rituals' AND TG_OP='UPDATE' THEN
  IF NEW.day IS DISTINCT FROM OLD.day OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Ritual identity cannot change' USING ERRCODE='23514';END IF;
 END IF;
 IF TG_TABLE_NAME='goal_checkins' AND TG_OP='UPDATE' THEN
  IF NEW.goal_id IS DISTINCT FROM OLD.goal_id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.occurrence_key IS DISTINCT FROM OLD.occurrence_key THEN RAISE EXCEPTION 'Check-in identity cannot change' USING ERRCODE='23514';END IF;
 END IF;
 IF TG_TABLE_NAME='task_occurrences' THEN
  IF TG_OP='DELETE' THEN old_task:=OLD.task_id;ELSE old_task:=NEW.task_id;END IF;
  SELECT user_id,category INTO owner_id,area FROM public.recurring_tasks WHERE id=old_task;
  -- Cascading task deletion may already hide the parent row: retained source ids revoke its awards.
  IF TG_OP='DELETE' THEN
   UPDATE public.gamification_events SET active=false WHERE user_id=uid AND gamification_events.kind='task' AND source_id=OLD.id::text;
   RETURN OLD;
  END IF;
  IF owner_id IS DISTINCT FROM uid THEN RAISE EXCEPTION 'Action owner mismatch' USING ERRCODE='42501';END IF;
 ELSE
  IF TG_OP='DELETE' THEN owner_id:=OLD.user_id;ELSE owner_id:=NEW.user_id;END IF;
  IF owner_id IS DISTINCT FROM uid THEN RAISE EXCEPTION 'Action owner mismatch' USING ERRCODE='42501';END IF;
 END IF;
 SELECT coalesce(nullif(current_timezone,''),nullif(timezone,''),'UTC') INTO zone FROM public.profiles WHERE user_id=uid;
 today:=(clock_timestamp() AT TIME ZONE coalesce(zone,'UTC'))::date;
 IF TG_OP='DELETE' THEN
  IF TG_TABLE_NAME='daily_rituals' THEN source:=OLD.day::text;ELSE source:=OLD.id::text;END IF;
  UPDATE public.gamification_events SET active=false WHERE user_id=uid AND source_id=source AND gamification_events.kind=ANY(CASE TG_TABLE_NAME WHEN 'goal_checkins' THEN ARRAY['goal'] WHEN 'money_entries' THEN ARRAY['expense'] WHEN 'assignments' THEN ARRAY['assignment'] ELSE ARRAY['morning','evening','weekly'] END);
  RETURN OLD;
 END IF;
 IF TG_TABLE_NAME='task_occurrences' THEN
  row_day:=(NEW.date AT TIME ZONE 'UTC')::date;
  IF TG_OP='UPDATE' THEN can_create:=OLD.status::text<>'completed' AND NEW.status::text='completed';END IF;
  key:='task:'||NEW.task_id::text||':'||row_day::text;source:=NEW.id::text;kind:='task';eligible:=NEW.status::text='completed';
  IF TG_OP='UPDATE' AND (OLD.task_id IS DISTINCT FROM NEW.task_id OR OLD.date IS DISTINCT FROM NEW.date) THEN
   UPDATE public.gamification_events SET active=false WHERE user_id=uid AND gamification_events.kind='task' AND source_id=OLD.id::text;
  END IF;
 ELSIF TG_TABLE_NAME='goal_checkins' THEN
  SELECT category INTO area FROM public.goals WHERE id=NEW.goal_id AND user_id=uid;
  key:='goal:'||NEW.goal_id::text||':'||coalesce(NEW.occurrence_key,NEW.id::text);source:=NEW.id::text;kind:='goal';eligible:=true;row_day:=today;
 ELSIF TG_TABLE_NAME='money_entries' THEN
  IF TG_OP='UPDATE' THEN can_create:=coalesce(OLD.flow_kind,OLD.type::text)<>'expense' AND coalesce(NEW.flow_kind,NEW.type::text)='expense';END IF;
  key:='expense:'||NEW.id::text;source:=NEW.id::text;kind:='expense';area:='Wealth';
  eligible:=coalesce(NEW.flow_kind,NEW.type::text)='expense' AND NEW.amount>0 AND NEW.deleted_at IS NULL AND NEW.parent_entry_id IS NULL;
  row_day:=today;
 ELSIF TG_TABLE_NAME='assignments' THEN
  IF TG_OP='UPDATE' THEN can_create:=OLD.status::text<>'completed' AND NEW.status::text='completed';END IF;
  key:='assignment:'||NEW.id::text;source:=NEW.id::text;kind:='assignment';area:='Learning';eligible:=NEW.status::text='completed';ontime:=NOT NEW.finished_late;row_day:=today;
 ELSIF TG_TABLE_NAME='daily_rituals' THEN
  FOREACH phase IN ARRAY ARRAY['morning','evening','weekly'] LOOP
   eligible:=CASE phase WHEN 'morning' THEN NEW.morning_at IS NOT NULL WHEN 'evening' THEN NEW.evening_at IS NOT NULL ELSE NEW.review_at IS NOT NULL END;
   key:='ritual:'||NEW.day::text||':'||phase;
   IF eligible AND (NEW.day=today OR (phase='weekly' AND NEW.day=today-extract(dow FROM today)::integer)) THEN
    INSERT INTO public.gamification_events(user_id,action_key,kind,source_id,day,area)
    VALUES(uid,key,phase,NEW.day::text,today,'Reflection')
    ON CONFLICT(user_id,action_key) DO UPDATE SET active=true;
   ELSIF NOT eligible THEN UPDATE public.gamification_events SET active=false WHERE user_id=uid AND action_key=key;
   END IF;
  END LOOP;
  RETURN NEW;
 ELSE RETURN NEW;
 END IF;
 IF eligible THEN
  -- Reactivation keeps the original earning day and timestamp: undo/replay cannot create a new day.
  UPDATE public.gamification_events SET active=true,source_id=source WHERE user_id=uid AND action_key=key;
  IF NOT FOUND AND row_day<=today AND can_create THEN
   INSERT INTO public.gamification_events(user_id,action_key,kind,source_id,day,area,on_time)
   VALUES(uid,key,kind,source,today,left(coalesce(area,'Personal'),100),ontime)
   ON CONFLICT(user_id,action_key) DO UPDATE SET active=true,source_id=excluded.source_id;
  END IF;
 ELSE UPDATE public.gamification_events SET active=false WHERE user_id=uid AND action_key=key;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_gamification_action() FROM PUBLIC,anon,authenticated;
-- Definition precedes every trigger that references it.
DROP TRIGGER IF EXISTS gamification_task ON public.task_occurrences;
CREATE TRIGGER gamification_task AFTER INSERT OR UPDATE OR DELETE ON public.task_occurrences FOR EACH ROW EXECUTE FUNCTION public.capture_gamification_action();
DROP TRIGGER IF EXISTS gamification_goal ON public.goal_checkins;
CREATE TRIGGER gamification_goal AFTER INSERT OR UPDATE OR DELETE ON public.goal_checkins FOR EACH ROW EXECUTE FUNCTION public.capture_gamification_action();
DROP TRIGGER IF EXISTS gamification_expense ON public.money_entries;
CREATE TRIGGER gamification_expense AFTER INSERT OR UPDATE OR DELETE ON public.money_entries FOR EACH ROW EXECUTE FUNCTION public.capture_gamification_action();
DROP TRIGGER IF EXISTS gamification_ritual ON public.daily_rituals;
CREATE TRIGGER gamification_ritual AFTER INSERT OR UPDATE OR DELETE ON public.daily_rituals FOR EACH ROW EXECUTE FUNCTION public.capture_gamification_action();
DROP TRIGGER IF EXISTS gamification_academic ON public.assignments;
CREATE TRIGGER gamification_academic AFTER INSERT OR UPDATE OR DELETE ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.capture_gamification_action();
COMMIT;
