-- Issue #46 / Piece 8A-P1. Additive LOCAL-ONLY candidate; never run against hosted DB automatically.
-- Requires 0013–0022. No table/column, online-function, finance or reward-rule changes.
BEGIN;

CREATE FUNCTION crystrack_daily.validate_offline_intent(p jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k text; ident uuid; d date;
 keys text[]:=ARRAY['mode','requestId','day','timezone','contextRevision','snapshotId','snapshotVersion','definitionVersion','routineId','expectedRevision','desiredStatus'];
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' OR octet_length(p::text)>2048
 OR NOT(p ?& keys) OR p-keys<>'{}'::jsonb THEN
  RAISE EXCEPTION 'Invalid offline intent' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY ARRAY['mode','requestId','day','timezone','snapshotId','snapshotVersion','definitionVersion','routineId','desiredStatus'] LOOP
  IF jsonb_typeof(p->k)<>'string' THEN RAISE EXCEPTION 'Invalid offline intent' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF p->>'mode'<>'offline-v1' OR p->>'desiredStatus' NOT IN ('pending','completed','skipped')
 OR char_length(p->>'timezone') NOT BETWEEN 1 AND 100 OR NOT crystrack_daily.zone_valid(p->>'timezone')
 OR p->>'day' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
  RAISE EXCEPTION 'Invalid offline intent' USING ERRCODE='22023'; END IF;
 BEGIN
  d:=(p->>'day')::date;
  IF d<'0001-01-01' OR d>'9999-12-31' THEN RAISE EXCEPTION 'Invalid day'; END IF;
  FOREACH k IN ARRAY ARRAY['requestId','snapshotId','snapshotVersion','definitionVersion','routineId'] LOOP
   IF p->>k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Invalid ID'; END IF;
   ident:=(p->>k)::uuid;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['contextRevision','expectedRevision'] LOOP
   IF jsonb_typeof(p->k)<>'number' OR p->>k !~ '^[1-9][0-9]{0,9}$' OR (p->>k)::numeric>2147483647 THEN RAISE EXCEPTION 'Invalid revision'; END IF;
  END LOOP;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid offline intent' USING ERRCODE='22023'; END;
END $$;

-- Private, read-only projection. Callers hold the same owner lock as definitions/outcomes.
-- Does NOT call context/recover/materialize: historical ACK resolution must never write.
CREATE FUNCTION crystrack_daily.offline_receipt(u uuid,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE old public.daily_mutation_requests; s public.daily_tracking_states;
 h public.daily_records; x public.daily_routine_records; v public.routine_schedule_versions;
 current_source boolean:=false; d date:=(p->>'day')::date; r uuid:=(p->>'routineId')::uuid;
 instant timestamptz:=crystrack_daily.clock();
BEGIN
 SELECT * INTO old FROM public.daily_mutation_requests WHERE user_id=u AND request_id=(p->>'requestId')::uuid;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not-found'); END IF;
 -- Legacy online receipts lack this envelope and can never stand in for offline success.
 IF old.payload<>p THEN RAISE EXCEPTION 'Request ID reused' USING ERRCODE='PT409'; END IF;
 SELECT * INTO s FROM public.daily_tracking_states WHERE user_id=u;
 SELECT * INTO h FROM public.daily_records WHERE user_id=u AND day_key=d;
 SELECT * INTO x FROM public.daily_routine_records WHERE user_id=u AND day_key=d AND routine_key=r;
 SELECT * INTO v FROM public.routine_schedule_versions WHERE user_id=u AND routine_key=r ORDER BY version DESC LIMIT 1;
 current_source:=coalesce(
  s.scheduling_timezone=p->>'timezone' AND s.revision=(p->>'contextRevision')::integer
  AND (instant AT TIME ZONE s.scheduling_timezone)::date=d
  AND NOT EXISTS(SELECT 1 FROM public.daily_timezone_transitions WHERE user_id=u AND status='pending' AND effective_at<=instant)
  AND h.id=(p->>'snapshotId')::uuid AND h.timezone=p->>'timezone' AND h.evidence='verified'
  AND h.close_status='open' AND instant>=h.opens_at AND instant<h.closes_at
  AND h.expected_count=(SELECT count(*) FROM public.daily_routine_records WHERE user_id=u AND day_key=d)
  AND NOT EXISTS(SELECT 1 FROM public.daily_routine_records WHERE user_id=u AND day_key=d AND legacy_conflict)
  AND x.schedule_version_id=(p->>'snapshotVersion')::uuid AND NOT x.legacy_conflict
  AND x.revision=(old.result->>'revision')::integer AND x.status=old.result->>'status'
  AND v.id=(p->>'definitionVersion')::uuid AND v.enabled
  AND EXISTS(SELECT 1 FROM public.recurring_tasks WHERE id=r AND user_id=u AND active AND archived_at IS NULL),false);
 RETURN jsonb_build_object('state','confirmed','receipt',jsonb_build_object(
  'requestId',p->>'requestId','day',d,'routineId',r,'status',old.result->>'status','revision',(old.result->>'revision')::integer),
  'reconciliation',CASE WHEN current_source THEN 'current' ELSE 'manual-review' END);
END $$;

CREATE FUNCTION public.daily_replay_offline_outcome(p_intent jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); ctx jsonb; prior public.daily_mutation_requests;
 h public.daily_records; x public.daily_routine_records; v public.routine_schedule_versions;
 d date; r uuid; result jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 PERFORM crystrack_daily.validate_offline_intent(p_intent);
 -- Existing receipts are resolved before any source locking/eligibility work.
 SELECT * INTO prior FROM public.daily_mutation_requests WHERE user_id=u AND request_id=(p_intent->>'requestId')::uuid;
 IF FOUND THEN
  PERFORM crystrack_daily.lock_owner(u);
  RETURN crystrack_daily.offline_receipt(u,p_intent);
 END IF;
 -- Match DELETE's parent-row-before-trigger ordering. Otherwise a replay holding
 -- owner lock could wait on the compatibility FK while DELETE waits on owner.
 -- This is NOT the eligibility guard: absent/inactive rows are checked only below,
 -- after owner lock and prior-receipt resolution. KEY SHARE allows non-key edits.
 PERFORM 1 FROM public.recurring_tasks WHERE id=(p_intent->>'routineId')::uuid AND user_id=u FOR KEY SHARE;
 PERFORM crystrack_daily.lock_owner(u);
 SELECT * INTO prior FROM public.daily_mutation_requests WHERE user_id=u AND request_id=(p_intent->>'requestId')::uuid;
 IF FOUND THEN RETURN crystrack_daily.offline_receipt(u,p_intent); END IF;
 -- Everything below (including context recovery) rolls back on a conflict/error.
 ctx:=crystrack_daily.context(u);
 d:=(p_intent->>'day')::date; r:=(p_intent->>'routineId')::uuid;
 IF ctx->>'day'<>p_intent->>'day' OR ctx->>'timezone'<>p_intent->>'timezone'
 OR (ctx->>'revision')::integer<>(p_intent->>'contextRevision')::integer THEN
  RAISE EXCEPTION 'Offline source changed' USING ERRCODE='PT409'; END IF;
 SELECT * INTO h FROM public.daily_records WHERE user_id=u AND day_key=d FOR UPDATE;
 SELECT * INTO x FROM public.daily_routine_records WHERE user_id=u AND day_key=d AND routine_key=r;
 SELECT * INTO v FROM public.routine_schedule_versions WHERE user_id=u AND routine_key=r ORDER BY version DESC LIMIT 1;
 IF h.id IS NULL OR h.id<>(p_intent->>'snapshotId')::uuid OR h.timezone<>p_intent->>'timezone'
 OR h.evidence<>'verified' OR h.close_status<>'open'
 OR crystrack_daily.clock()<h.opens_at OR crystrack_daily.clock()>=h.closes_at
 OR h.expected_count<>(SELECT count(*) FROM public.daily_routine_records WHERE user_id=u AND day_key=d)
 OR EXISTS(SELECT 1 FROM public.daily_routine_records WHERE user_id=u AND day_key=d AND legacy_conflict)
 OR x.id IS NULL OR x.legacy_conflict OR x.schedule_version_id<>(p_intent->>'snapshotVersion')::uuid
 OR x.revision<>(p_intent->>'expectedRevision')::integer
 OR v.id IS NULL OR v.id<>(p_intent->>'definitionVersion')::uuid OR NOT v.enabled
 OR NOT EXISTS(SELECT 1 FROM public.recurring_tasks WHERE id=r AND user_id=u AND active AND archived_at IS NULL) THEN
  RAISE EXCEPTION 'Offline source changed' USING ERRCODE='PT409'; END IF;
 -- Reentrant owner lock, same transaction, exact existing compatibility/activity/reward machinery.
 result:=public.daily_set_outcome(d,r,p_intent->>'desiredStatus',(p_intent->>'expectedRevision')::integer,(p_intent->>'requestId')::uuid);
 -- Enrich the ONE existing receipt, never insert a parallel receipt or fabricate a result.
 -- Reusing this ID through the online signature now conflicts with its legacy payload.
 UPDATE public.daily_mutation_requests SET payload=p_intent WHERE user_id=u AND request_id=(p_intent->>'requestId')::uuid;
 RETURN crystrack_daily.offline_receipt(u,p_intent);
END $$;

CREATE FUNCTION public.daily_resolve_offline_outcome(p_intent jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 PERFORM crystrack_daily.validate_offline_intent(p_intent);
 PERFORM crystrack_daily.lock_owner(u);
 RETURN crystrack_daily.offline_receipt(u,p_intent);
END $$;
REVOKE ALL ON FUNCTION crystrack_daily.validate_offline_intent(jsonb),crystrack_daily.offline_receipt(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.daily_replay_offline_outcome(jsonb),public.daily_resolve_offline_outcome(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.daily_replay_offline_outcome(jsonb),public.daily_resolve_offline_outcome(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
