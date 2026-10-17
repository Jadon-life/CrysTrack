-- PREVIEW DATABASE ONLY. Never apply this migration to production for Piece 9.
-- Prerequisites: complete migrations 0000-0010, including 0008_daily_rhythm.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public.preview_coach_actions (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 tool jsonb NOT NULL,
 status varchar(20) NOT NULL CHECK(status IN ('approved','dismissed')),
 result jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.preview_coach_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS preview_coach_owner_read ON public.preview_coach_actions;
CREATE POLICY preview_coach_owner_read ON public.preview_coach_actions FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.preview_coach_actions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.preview_coach_actions TO authenticated;
CREATE OR REPLACE FUNCTION public.preview_decide_coach_action(p_id uuid,p_tool jsonb,p_approve boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); prior public.preview_coach_actions; entity uuid; result jsonb:='{}'; kind text:=p_tool->>'kind'; value numeric; weekday integer; zone text; entry public.money_entries;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to confirm' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_approve IS NULL OR jsonb_typeof(p_tool) IS DISTINCT FROM 'object' OR octet_length(p_tool::text)>8000 THEN RAISE EXCEPTION 'Invalid proposal' USING ERRCODE='23514'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,11));
 SELECT * INTO prior FROM public.preview_coach_actions WHERE id=p_id;
 IF FOUND THEN
  IF prior.user_id<>uid OR prior.tool<>p_tool THEN RAISE EXCEPTION 'Confirmation inaccessible' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('status',prior.status,'result',prior.result,'replayed',true);
 END IF;
 IF p_approve THEN
  IF kind='create_task' THEN
   IF length(trim(p_tool->>'title')) NOT BETWEEN 1 AND 255 OR jsonb_typeof(p_tool->'weekdays') IS DISTINCT FROM 'array' OR jsonb_array_length(p_tool->'weekdays') NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION 'Invalid task' USING ERRCODE='23514'; END IF;
   INSERT INTO public.recurring_tasks(user_id,title) VALUES(uid,trim(p_tool->>'title')) RETURNING id INTO entity;
   FOR weekday IN SELECT DISTINCT (v #>> '{}')::integer FROM jsonb_array_elements(p_tool->'weekdays') v LOOP
    IF weekday NOT BETWEEN 0 AND 6 THEN RAISE EXCEPTION 'Invalid weekday' USING ERRCODE='23514'; END IF;
    INSERT INTO public.task_schedules(task_id,weekday) VALUES(entity,weekday);
   END LOOP;
   result:=jsonb_build_object('id',entity);
  ELSIF kind='reallocate_budget' THEN
   value:=(p_tool->>'amount')::numeric;
   IF value<=0 OR value<>round(value,2) THEN RAISE EXCEPTION 'Invalid amount' USING ERRCODE='23514'; END IF;
   PERFORM public.wealth_reallocate((p_tool->>'from')::uuid,(p_tool->>'to')::uuid,value);
  ELSIF kind='adjust_goal_target' THEN
   value:=(p_tool->>'targetValue')::numeric;
   IF value<=0 OR value<>round(value,2) THEN RAISE EXCEPTION 'Invalid target' USING ERRCODE='23514'; END IF;
   PERFORM public.save_goal_alignment((p_tool->>'goalId')::uuid,(p_tool->>'expectedRevision')::integer,jsonb_build_object('target_value',value));
  ELSIF kind='log_expense' THEN
   value:=(p_tool->>'amount')::numeric;
   IF value<=0 OR value<>round(value,2) OR length(trim(p_tool->>'note')) NOT BETWEEN 1 AND 255 THEN RAISE EXCEPTION 'Invalid expense' USING ERRCODE='23514'; END IF;
   -- The existing ledger RPC enforces account ownership, locks and Spend & Save rules.
   -- Omit date so the authoritative server clock records the actual confirmation instant.
   SELECT * INTO entry FROM public.wealth_write_entry(NULL,jsonb_build_object('flowKind','expense','amount',value::text,'note',p_tool->>'note','category','Other','source','Telegram preview'));
   result:=jsonb_build_object('id',entry.id);
  ELSE RAISE EXCEPTION 'Unsupported proposal' USING ERRCODE='23514';
  END IF;
 END IF;
 INSERT INTO public.preview_coach_actions(id,user_id,tool,status,result) VALUES(p_id,uid,p_tool,CASE WHEN p_approve THEN 'approved' ELSE 'dismissed' END,result);
 RETURN jsonb_build_object('status',CASE WHEN p_approve THEN 'approved' ELSE 'dismissed' END,'result',result,'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.preview_decide_coach_action(uuid,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_decide_coach_action(uuid,jsonb,boolean) TO authenticated;
COMMIT;
