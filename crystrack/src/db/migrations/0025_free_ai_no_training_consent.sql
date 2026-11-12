-- Free-only OpenRouter consent update (2026-11-12).
-- Privacy scope changes: no ZDR routing requirement; data_collection='deny' stays.
-- Existing consents must NEVER silently authorize weaker provider retention.
-- Preserve all user tasks, goals, check-ins, money, rewards, and saved AI history.
BEGIN;
LOCK TABLE public.ai_privacy_preferences IN SHARE ROW EXCLUSIVE MODE;
-- Revoke prior version consent and invalidate in-flight leases.
UPDATE public.ai_privacy_preferences
SET enabled=false, wealth_enabled=false, accepted_policy=NULL, accepted_at=NULL,
    revision=revision+1, updated_at=now()
WHERE enabled OR wealth_enabled OR accepted_policy IS NOT NULL;
ALTER TABLE public.ai_privacy_preferences DROP CONSTRAINT ai_privacy_preferences_check1;
ALTER TABLE public.ai_privacy_preferences ADD CONSTRAINT ai_privacy_preferences_check1
CHECK (NOT enabled OR (accepted_policy='2026-11-12-free-no-training-v2' AND accepted_at IS NOT NULL));
-- Function privileges remain unchanged (CREATE OR REPLACE keeps existing ACLs).
CREATE OR REPLACE FUNCTION public.ai_privacy_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u uuid:=crystrack_ai.owner(); p public.ai_privacy_preferences;
BEGIN
 SELECT * INTO p FROM public.ai_privacy_preferences WHERE user_id=u;
 RETURN jsonb_build_object('enabled',coalesce(p.enabled,false),'wealthEnabled',coalesce(p.wealth_enabled,false),
  'revision',coalesce(p.revision,0),'policy','2026-11-12-free-no-training-v2','acceptedPolicy',p.accepted_policy,'acceptedAt',p.accepted_at);
END $function$;

CREATE OR REPLACE FUNCTION public.ai_privacy_mutate(p_action text, p_expected_revision integer, p_request_id uuid, p_enabled boolean DEFAULT false, p_wealth boolean DEFAULT false, p_policy text DEFAULT NULL::text, p_confirm boolean DEFAULT false, p_conversation uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u uuid:=crystrack_ai.owner(); p public.ai_privacy_preferences; previous jsonb;
 payload jsonb:=jsonb_build_array(p_action,p_expected_revision,p_enabled,p_wealth,p_policy,p_confirm,p_conversation);
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,41));
 IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_action IS NULL
 OR p_action NOT IN('consent','clear','delete_conversation') THEN RAISE EXCEPTION 'Invalid privacy change' USING ERRCODE='22023'; END IF;
 SELECT m.payload INTO previous FROM crystrack_ai.mutations m WHERE user_id=u AND request_id=p_request_id;
 IF FOUND THEN
  IF previous IS DISTINCT FROM payload THEN RAISE EXCEPTION 'Privacy retry changed' USING ERRCODE='PT409'; END IF;
  RETURN public.ai_privacy_state(); -- current truth, never replay an obsolete opt-in
 END IF;
 SELECT * INTO p FROM public.ai_privacy_preferences WHERE user_id=u FOR UPDATE;
 IF coalesce(p.revision,0)<>p_expected_revision THEN RAISE EXCEPTION 'Privacy revision changed' USING ERRCODE='PT409'; END IF;
 IF p_action='consent' AND (p_enabled IS NULL OR p_wealth IS NULL OR (p_wealth AND NOT p_enabled)
 OR (p_enabled AND p_policy IS DISTINCT FROM '2026-11-12-free-no-training-v2')) THEN RAISE EXCEPTION 'Explicit privacy scope required' USING ERRCODE='22023'; END IF;
 IF p_action IN('clear','delete_conversation') AND p_confirm IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm local deletion' USING ERRCODE='22023'; END IF;
 IF p_action='delete_conversation' AND (p_conversation IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.ai_conversations WHERE id=p_conversation AND user_id=u)) THEN RAISE EXCEPTION 'Conversation unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO public.ai_privacy_preferences(user_id) VALUES(u) ON CONFLICT DO NOTHING;
 UPDATE public.ai_privacy_preferences SET revision=revision+1,updated_at=now(),
  enabled=CASE WHEN p_action='consent' THEN p_enabled ELSE enabled END,
  wealth_enabled=CASE WHEN p_action='consent' THEN p_enabled AND p_wealth ELSE wealth_enabled END,
  accepted_policy=CASE WHEN p_action='consent' AND p_enabled THEN p_policy ELSE accepted_policy END,
  accepted_at=CASE WHEN p_action='consent' AND p_enabled THEN now() ELSE accepted_at END WHERE user_id=u;
 IF p_action IN('clear','delete_conversation') AND EXISTS(
  SELECT 1 FROM public.ai_messages m JOIN public.ai_conversations conv ON conv.id=m.conversation_id
   WHERE conv.user_id=u AND m.user_id<>u AND (p_action='clear' OR conv.id=p_conversation))
 THEN RAISE EXCEPTION 'Local AI ownership requires verification' USING ERRCODE='42501'; END IF;
 IF p_action='clear' THEN
  DELETE FROM public.ai_conversations WHERE user_id=u; -- FK cascades only messages
  DELETE FROM public.ai_domain_insights WHERE user_id=u;
  DELETE FROM public.goal_insights WHERE goal_id IN(SELECT id FROM public.goals WHERE user_id=u);
  UPDATE public.goal_checkins SET ai_analysis=NULL WHERE user_id=u AND ai_analysis IS NOT NULL;
  DELETE FROM crystrack_ai.requests WHERE user_id=u; -- metadata only; no prompt copies retained
 ELSIF p_action='delete_conversation' THEN
  DELETE FROM public.ai_conversations WHERE id=p_conversation AND user_id=u;
 END IF;
 INSERT INTO crystrack_ai.mutations(user_id,request_id,payload) VALUES(u,p_request_id,payload);
 RETURN public.ai_privacy_state();
END $function$;

CREATE OR REPLACE FUNCTION public.ai_request_begin(p_owner uuid, p_revision integer, p_domain text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u uuid:=crystrack_ai.server_owner(p_owner); p public.ai_privacy_preferences; r crystrack_ai.requests;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,41));
 SELECT * INTO p FROM public.ai_privacy_preferences WHERE user_id=u FOR UPDATE;
 IF NOT coalesce(p.enabled,false) OR p.accepted_policy IS DISTINCT FROM '2026-11-12-free-no-training-v2' THEN RAISE EXCEPTION 'AI consent required' USING ERRCODE='42501'; END IF;
 IF p.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Privacy changed' USING ERRCODE='PT409'; END IF;
 IF p_domain IS NULL OR p_domain NOT IN('chat','conversation','tasks','goals','assignments','wealth','overview','goal','wealth_legacy') THEN RAISE EXCEPTION 'Invalid AI scope' USING ERRCODE='22023'; END IF;
 IF p_domain IN('wealth','wealth_legacy') AND NOT p.wealth_enabled THEN RAISE EXCEPTION 'Wealth consent required' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM crystrack_ai.requests WHERE user_id=u AND created_at>now()-interval '10 minutes')>=20 THEN RAISE EXCEPTION 'AI rate limit' USING ERRCODE='PT429'; END IF;
 INSERT INTO crystrack_ai.requests(user_id,revision,domain,wealth_enabled) VALUES(u,p.revision,p_domain,p.wealth_enabled) RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'revision',r.revision,'wealthEnabled',r.wealth_enabled,'domain',r.domain);
END $function$;

CREATE OR REPLACE FUNCTION public.ai_request_check(p_owner uuid, p_request uuid, p_revision integer, p_domain text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u uuid:=crystrack_ai.server_owner(p_owner); r crystrack_ai.requests; p public.ai_privacy_preferences;
BEGIN
 SELECT * INTO r FROM crystrack_ai.requests WHERE id=p_request AND user_id=u;
 SELECT * INTO p FROM public.ai_privacy_preferences WHERE user_id=u;
 IF r.id IS NULL OR r.revision IS DISTINCT FROM p_revision OR r.domain IS DISTINCT FROM p_domain OR p.user_id IS NULL OR NOT p.enabled OR p.accepted_policy IS DISTINCT FROM '2026-11-12-free-no-training-v2'
 OR p.revision<>r.revision OR p.wealth_enabled<>r.wealth_enabled OR r.created_at<now()-interval '2 minutes'
 THEN RAISE EXCEPTION 'AI permission changed or expired' USING ERRCODE='PT409'; END IF;
 RETURN jsonb_build_object('id',r.id,'revision',r.revision,'wealthEnabled',r.wealth_enabled,'domain',r.domain);
END $function$;

CREATE OR REPLACE FUNCTION public.ai_request_finish(p_owner uuid, p_request uuid, p_revision integer, p_domain text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u uuid:=crystrack_ai.server_owner(p_owner); r crystrack_ai.requests; c public.ai_conversations; m1 public.ai_messages; m2 public.ai_messages;
 insight_id uuid; v_goal_id uuid; v_checkin_id uuid; model_name text; result jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,41));
 PERFORM 1 FROM public.ai_privacy_preferences WHERE user_id=u FOR UPDATE;
 PERFORM public.ai_request_check(u,p_request,p_revision,p_domain);
 SELECT * INTO r FROM crystrack_ai.requests WHERE id=p_request AND user_id=u FOR UPDATE;
 IF r.stored THEN RAISE EXCEPTION 'AI result already committed' USING ERRCODE='PT409'; END IF;
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>65536 THEN RAISE EXCEPTION 'Invalid AI result' USING ERRCODE='22023'; END IF;
 model_name:=left(coalesce(p_data->>'model','unknown'),50);
 IF r.domain IN('chat','conversation') THEN
  IF r.domain='chat' AND ((p_data->>'message') IS NULL OR length(p_data->>'message') NOT BETWEEN 1 AND 4000
   OR (p_data->>'answer') IS NULL OR length(p_data->>'answer') NOT BETWEEN 1 AND 12000) THEN RAISE EXCEPTION 'Invalid AI message' USING ERRCODE='22023'; END IF;
  IF nullif(p_data->>'conversationId','') IS NOT NULL THEN
   SELECT * INTO c FROM public.ai_conversations WHERE id=(p_data->>'conversationId')::uuid AND user_id=u FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Conversation unavailable' USING ERRCODE='42501'; END IF;
  ELSE
   INSERT INTO public.ai_conversations(user_id,title) VALUES(u,left(coalesce(nullif(p_data->>'title',''),'New conversation'),180)) RETURNING * INTO c;
  END IF;
  IF r.domain='chat' THEN
   INSERT INTO public.ai_messages(conversation_id,user_id,role,content) VALUES(c.id,u,'user',p_data->>'message') RETURNING * INTO m1;
   INSERT INTO public.ai_messages(conversation_id,user_id,role,content) VALUES(c.id,u,'assistant',p_data->>'answer') RETURNING * INTO m2;
   UPDATE public.ai_conversations SET updated_at=now(),title=CASE WHEN title='New conversation' THEN left(coalesce(p_data->>'title',title),180) ELSE title END WHERE id=c.id RETURNING * INTO c;
  END IF;
  result:=jsonb_build_object('conversation',to_jsonb(c)-'user_id','userMessage',to_jsonb(m1)-'user_id','assistantMessage',to_jsonb(m2)-'user_id');
  UPDATE crystrack_ai.requests SET refs=jsonb_build_object('conversationId',c.id,'userMessage',m1.id,'assistantMessage',m2.id) WHERE id=r.id;
 ELSIF r.domain='goal' THEN
  v_goal_id:=(p_data->>'goalId')::uuid;v_checkin_id:=(p_data->>'checkinId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.goals WHERE id=v_goal_id AND user_id=u AND status='active') THEN RAISE EXCEPTION 'Goal unavailable' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_data->'analysis') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid analysis' USING ERRCODE='22023'; END IF;
  IF v_checkin_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.goal_checkins gc WHERE gc.id=v_checkin_id AND gc.goal_id=v_goal_id AND gc.user_id=u) THEN RAISE EXCEPTION 'Check-in unavailable' USING ERRCODE='42501'; END IF;
   UPDATE public.goal_checkins SET ai_analysis=p_data->'analysis' WHERE id=v_checkin_id AND user_id=u;
  END IF;
  INSERT INTO public.goal_insights(goal_id,summary,risk_level,estimate_text,recommendations,model_version)
   VALUES(v_goal_id,p_data->'analysis'->>'summary',CASE WHEN p_data->'analysis'->>'status'='insufficient_evidence' THEN 'insufficient' ELSE p_data->'analysis'->>'status' END,p_data->'analysis'->>'confidence',p_data->'analysis'->>'next_action',model_name) RETURNING id INTO insight_id;
  UPDATE crystrack_ai.requests SET refs=jsonb_build_object('goalId',v_goal_id,'insightId',insight_id) WHERE id=r.id;
  result:=jsonb_build_object('configured',true,'analysis',p_data->'analysis');
 ELSIF r.domain='wealth_legacy' THEN result:=jsonb_build_object('source','ai','insight',p_data->'insight');
 ELSE
  IF jsonb_typeof(p_data->'insight') IS DISTINCT FROM 'object' OR length(coalesce(p_data->>'fingerprint',''))<>64 THEN RAISE EXCEPTION 'Invalid insight' USING ERRCODE='22023'; END IF;
  INSERT INTO public.ai_domain_insights(user_id,domain,data_fingerprint,insight,model)
   VALUES(u,r.domain,'2026-11-12-free-no-training-v2:'||r.revision::text||':'||(p_data->>'fingerprint'),p_data->'insight',model_name)
   ON CONFLICT(user_id,domain,data_fingerprint) DO UPDATE SET insight=excluded.insight,model=excluded.model,generated_at=now() RETURNING id INTO insight_id;
  UPDATE crystrack_ai.requests SET refs=jsonb_build_object('insightId',insight_id) WHERE id=r.id;
  result:=jsonb_build_object('insight',p_data->'insight','generatedAt',now(),'model',model_name,'cached',false);
 END IF;
 UPDATE crystrack_ai.requests SET stored=true WHERE id=r.id;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.account_export_ai_v1(p_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE u uuid:=auth.uid(); p public.ai_privacy_preferences; n bigint; b bigint; messages jsonb; conversations jsonb;
BEGIN
 IF u IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.ai_privacy_preferences WHERE user_id=u;
 IF NOT coalesce(p.enabled,false) OR p.revision IS DISTINCT FROM p_revision OR p.accepted_policy IS DISTINCT FROM '2026-11-12-free-no-training-v2' THEN RAISE EXCEPTION 'AI consent changed' USING ERRCODE='PT409'; END IF;
 IF EXISTS(SELECT 1 FROM public.ai_messages m WHERE m.user_id=u AND NOT EXISTS(SELECT 1 FROM public.ai_conversations c WHERE c.id=m.conversation_id AND c.user_id=u))
 OR EXISTS(SELECT 1 FROM public.ai_messages m JOIN public.ai_conversations c ON c.id=m.conversation_id WHERE c.user_id=u AND m.user_id<>u)
 THEN RAISE EXCEPTION 'Ownership requires review' USING ERRCODE='23514'; END IF;
 -- Exactly the current trusted provenance policy, without the interactive chat's last-12 cap.
 WITH eligible AS (SELECT m.id,m.conversation_id,m.user_id,m.role,m.content,m.created_at FROM public.ai_messages m
 WHERE m.user_id=u AND EXISTS(SELECT 1 FROM crystrack_ai.requests r WHERE r.user_id=u AND r.revision=p.revision AND r.stored AND r.domain='chat'
 AND (r.refs->>'userMessage'=m.id::text OR r.refs->>'assistantMessage'=m.id::text)))
 SELECT count(*),coalesce(sum(octet_length(to_jsonb(e)::text)),0) INTO n,b FROM (SELECT * FROM eligible LIMIT 10001)e;
 IF n>10000 OR b>8388608 THEN RAISE EXCEPTION 'Export scope too large' USING ERRCODE='54000'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]') INTO messages FROM (
 SELECT m.id,m.conversation_id,m.user_id,m.role,m.content,m.created_at FROM public.ai_messages m
 WHERE m.user_id=u AND EXISTS(SELECT 1 FROM crystrack_ai.requests r WHERE r.user_id=u AND r.revision=p.revision AND r.stored AND r.domain='chat'
 AND (r.refs->>'userMessage'=m.id::text OR r.refs->>'assistantMessage'=m.id::text)))e;
 SELECT count(*),coalesce(sum(octet_length(to_jsonb(e)::text)),0) INTO n,b FROM (
 SELECT c.id,c.user_id,c.title,c.created_at,c.updated_at FROM public.ai_conversations c WHERE c.user_id=u AND EXISTS(
 SELECT 1 FROM crystrack_ai.requests r WHERE r.user_id=u AND r.revision=p.revision AND r.stored AND r.domain IN('chat','conversation') AND r.refs->>'conversationId'=c.id::text) LIMIT 10001)e;
 IF n>10000 OR b+octet_length(messages::text)>8388608 THEN RAISE EXCEPTION 'Export scope too large' USING ERRCODE='54000'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]') INTO conversations FROM (
 SELECT c.id,c.user_id,c.title,c.created_at,c.updated_at FROM public.ai_conversations c WHERE c.user_id=u AND EXISTS(
 SELECT 1 FROM crystrack_ai.requests r WHERE r.user_id=u AND r.revision=p.revision AND r.stored AND r.domain IN('chat','conversation') AND r.refs->>'conversationId'=c.id::text))e;
 RETURN jsonb_build_object('ai_conversations',conversations,'ai_messages',messages);
END $function$;

COMMIT;
