/** Generate ONLY the new, unshipped Issue #44 local candidate from its explicit projection registry. */
import fs from 'node:fs';
const catalog=JSON.parse(fs.readFileSync('src/lib/account-export/catalog.json','utf8'));
const registry=JSON.stringify(catalog.filter(x=>x.category!=='ai')).replaceAll("'","''");
const sql=`-- Issue #44 additive LOCAL-ONLY candidate. Hosted rollout blocked by #18.
-- No table, source DML, trigger, existing function replacement or privilege widening.
BEGIN;
CREATE FUNCTION public.account_export_ai_v1(p_revision integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE u uuid:=auth.uid(); p public.ai_privacy_preferences; n bigint; b bigint; messages jsonb; conversations jsonb;
BEGIN
 IF u IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.ai_privacy_preferences WHERE user_id=u;
 IF NOT coalesce(p.enabled,false) OR p.revision IS DISTINCT FROM p_revision OR p.accepted_policy IS DISTINCT FROM '2026-10-20-minimal-v1' THEN RAISE EXCEPTION 'AI consent changed' USING ERRCODE='PT409'; END IF;
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
END $$;
CREATE FUNCTION public.account_export_snapshot_v1(p_categories text[],p_counts_only boolean DEFAULT false,p_ai_revision integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' SET timezone='UTC' AS $$
DECLARE u uuid:=auth.uid(); d jsonb; col text; link record; projection text; pred text; sorting text; query text; n bigint; b bigint;
 bad boolean; total_n bigint:=0; total_b bigint:=0; offset_n integer; rows jsonb; page jsonb; result jsonb:='{}'; counts jsonb:='{}'; ai jsonb; z text;
BEGIN
 IF u IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 IF p_counts_only IS NULL OR p_categories IS NULL OR cardinality(p_categories) NOT BETWEEN 1 AND 7
 OR (SELECT count(DISTINCT x) FROM unnest(p_categories)x)<>cardinality(p_categories)
 OR EXISTS(SELECT 1 FROM unnest(p_categories)x WHERE x IS NULL OR x NOT IN('tasks','assignments','goals','wealth','settings','history','ai'))
 THEN RAISE EXCEPTION 'Choose export categories' USING ERRCODE='22023'; END IF;
 SELECT coalesce((SELECT scheduling_timezone FROM public.daily_tracking_states WHERE user_id=u),
 (SELECT coalesce(scheduling_timezone,timezone) FROM public.profiles WHERE user_id=u)) INTO z;
 IF z IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=z) THEN RAISE EXCEPTION 'Timezone requires review' USING ERRCODE='23514'; END IF;
 FOR d IN SELECT value FROM jsonb_array_elements('${registry}'::jsonb) LOOP
 IF NOT d->>'category'=ANY(p_categories) THEN CONTINUE; END IF;
 projection:='';sorting:='';
 FOR col IN SELECT jsonb_array_elements_text(d->'columns') LOOP
 projection:=projection||CASE WHEN projection='' THEN '' ELSE ',' END||format('t.%I%s AS %I',col,CASE WHEN d->'decimals'?col THEN '::text' ELSE '' END,col);
 END LOOP;
 FOR col IN SELECT jsonb_array_elements_text(d->'order') LOOP sorting:=sorting||CASE WHEN sorting='' THEN '' ELSE ',' END||format('t.%I',col);END LOOP;
 pred:=CASE WHEN d->>'parent' IS NOT NULL THEN 'EXISTS(SELECT 1 FROM public.recurring_tasks p WHERE p.id=t.task_id AND p.user_id=$1)' ELSE 't.user_id=$1' END;
 FOR link IN SELECT key,value FROM jsonb_each_text(d->'links') LOOP
 IF link.value='wealth_bills' AND to_regclass('public.wealth_bills') IS NULL THEN
  -- A fresh synthetic fixture does not include the older bill table.
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.money_entries WHERE user_id=$1 AND bill_id IS NOT NULL)' INTO bad USING u;
  IF bad THEN RAISE EXCEPTION 'Legacy bill owner cannot be verified' USING ERRCODE='23514'; END IF;
  CONTINUE;
 END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I t WHERE %s AND t.%I IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.%I p WHERE p.id=t.%I AND p.user_id=$1))',d->>'table',pred,link.key,link.value,link.key) INTO bad USING u;
 IF bad THEN RAISE EXCEPTION 'Ownership requires review' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF d->>'table'='daily_routine_records' AND EXISTS(SELECT 1 FROM public.daily_routine_records r WHERE r.user_id=u AND (NOT EXISTS(SELECT 1 FROM public.daily_records h WHERE h.user_id=u AND h.day_key=r.day_key) OR NOT EXISTS(SELECT 1 FROM public.routine_schedule_versions v WHERE v.user_id=u AND v.id=r.schedule_version_id AND v.routine_key=r.routine_key))) THEN RAISE EXCEPTION 'Daily provenance requires review' USING ERRCODE='23514'; END IF;
 query:=format('SELECT %s FROM public.%I t WHERE %s ORDER BY %s',projection,d->>'table',pred,sorting);
 EXECUTE 'SELECT count(*),coalesce(sum(octet_length(to_jsonb(x)::text)),0) FROM ('||query||' LIMIT 10001)x' INTO n,b USING u;
 total_n:=total_n+n;total_b:=total_b+b;
 IF n>10000 OR total_n>25000 OR total_b>8388608 THEN RAISE EXCEPTION 'Export scope too large; choose fewer categories' USING ERRCODE='54000'; END IF;
 counts:=counts||jsonb_build_object(d->>'table',jsonb_build_object('rows',n,'projectedBytes',b));
 IF NOT p_counts_only THEN
 rows:='[]';offset_n:=0;
 WHILE offset_n<n LOOP
 EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) FROM ('||query||format(' LIMIT 250 OFFSET %s',offset_n)||')x' INTO page USING u;
 rows:=rows||page;offset_n:=offset_n+250;
 END LOOP;
 IF jsonb_array_length(rows)<>n THEN RAISE EXCEPTION 'Incomplete export' USING ERRCODE='23514'; END IF;
 result:=result||jsonb_build_object(d->>'table',rows);
 END IF;
 END LOOP;
 IF 'ai'=ANY(p_categories) THEN
 ai:=public.account_export_ai_v1(p_ai_revision);
 FOR col,page IN SELECT key,value FROM jsonb_each(ai) LOOP
 n:=jsonb_array_length(page);b:=octet_length(page::text);total_n:=total_n+n;total_b:=total_b+b;
 IF n>10000 OR total_n>25000 OR total_b>8388608 THEN RAISE EXCEPTION 'Export scope too large' USING ERRCODE='54000';END IF;
 counts:=counts||jsonb_build_object(col,jsonb_build_object('rows',n,'projectedBytes',b));
 IF NOT p_counts_only THEN result:=result||jsonb_build_object(col,page);END IF;
 END LOOP;
 END IF;
 RETURN jsonb_build_object('owner',u,'snapshotAt',statement_timestamp(),'savedTimezone',z,'categories',to_jsonb(p_categories),'counts',counts,'data',result,'aiRevision',CASE WHEN 'ai'=ANY(p_categories) THEN p_ai_revision ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.account_export_ai_v1(integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.account_export_snapshot_v1(text[],boolean,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.account_export_ai_v1(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.account_export_snapshot_v1(text[],boolean,integer) TO authenticated;
COMMIT;
`;
if(process.argv.includes('--check')){if(fs.readFileSync('src/db/migrations/0024_private_account_export.sql','utf8')!==sql)throw Error('Export registry / SQL drift');}else fs.writeFileSync('src/db/migrations/0024_private_account_export.sql',sql);
