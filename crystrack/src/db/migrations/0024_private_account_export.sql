-- Issue #44 additive LOCAL-ONLY candidate. Hosted rollout blocked by #18.
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
 FOR d IN SELECT value FROM jsonb_array_elements('[{"category":"tasks","table":"recurring_tasks","columns":["id","user_id","title","description","active","preferred_time","category","created_at","archived_at"],"decimals":[],"order":["id"],"parent":null,"links":{}},{"category":"tasks","table":"task_schedules","columns":["id","task_id","weekday","start_date","end_date"],"decimals":[],"order":["id"],"parent":"recurring_tasks","links":{}},{"category":"tasks","table":"task_occurrences","columns":["id","task_id","date","status","completed_at","note"],"decimals":[],"order":["id"],"parent":"recurring_tasks","links":{}},{"category":"tasks","table":"routine_schedule_versions","columns":["id","user_id","routine_key","version","effective_from","enabled","title","description","preferred_time","category","schedule","created_at"],"decimals":[],"order":["id"],"parent":null,"links":{}},{"category":"tasks","table":"daily_tracking_states","columns":["user_id","initial_timezone","scheduling_timezone","activated_at","activation_day","capture_starts_on","recovery_cursor","revision","data_revision"],"decimals":["data_revision"],"order":["user_id"],"parent":null,"links":{}},{"category":"tasks","table":"daily_timezone_transitions","columns":["id","user_id","from_timezone","to_timezone","previous_day","first_day","requested_at","effective_at","status","revision"],"decimals":[],"order":["id"],"parent":null,"links":{}},{"category":"tasks","table":"daily_records","columns":["id","user_id","day_key","timezone","policy_version","evidence","evidence_reason","expected_count","close_status","opens_at","closes_at","materialized_at","closed_at","revision"],"decimals":[],"order":["id"],"parent":null,"links":{}},{"category":"tasks","table":"daily_routine_records","columns":["id","user_id","day_key","routine_key","schedule_version_id","title","description","preferred_time","category","status","completed_at","revision","legacy_conflict"],"decimals":[],"order":["id"],"parent":null,"links":{"schedule_version_id":"routine_schedule_versions"}},{"category":"tasks","table":"daily_notes","columns":["user_id","day_key","body","revision","updated_at"],"decimals":[],"order":["day_key"],"parent":null,"links":{}},{"category":"assignments","table":"assignments","columns":["id","user_id","title","description","deadline","priority","status","category","completed_at","created_at","revision","reminder_version"],"decimals":[],"order":["id"],"parent":null,"links":{}},{"category":"goals","table":"goals","columns":["id","user_id","title","description","deadline","measurable","target_value","progress_value","status","category","created_at","completed_at","progress_mode","starting_value","progress_unit","ai_coaching"],"decimals":["target_value","progress_value","starting_value"],"order":["id"],"parent":null,"links":{}},{"category":"goals","table":"goal_checkins","columns":["id","goal_id","user_id","created_at","duration_minutes","response_text","learned_text","blockers","progress_percent","progress_value","occurrence_key","occurrence_start_date","occurrence_end_date"],"decimals":["progress_percent","progress_value"],"order":["id"],"parent":null,"links":{"goal_id":"goals"}},{"category":"wealth","table":"money_entries","columns":["id","user_id","type","amount","date","source","category","note","target_id","created_at","flow_kind","debt_id","expected_flow_id","bill_id","bill_occurrence_id","import_batch_id","import_row_id"],"decimals":["amount"],"order":["id"],"parent":null,"links":{"target_id":"finance_targets","debt_id":"wealth_debts","expected_flow_id":"wealth_expected_flows","bill_id":"wealth_recurring_bills","bill_occurrence_id":"wealth_bill_occurrences","import_batch_id":"wealth_csv_batches","import_row_id":"wealth_csv_rows"}},{"category":"wealth","table":"finance_targets","columns":["id","user_id","title","target_amount","current_amount","deadline","description","status","created_at"],"decimals":["target_amount","current_amount"],"order":["id"],"parent":null,"links":{}},{"category":"wealth","table":"wealth_debts","columns":["id","user_id","kind","counterparty","original_amount","outstanding_amount","due_date","note","status","created_at","updated_at"],"decimals":["original_amount","outstanding_amount"],"order":["id"],"parent":null,"links":{}},{"category":"wealth","table":"wealth_expected_flows","columns":["id","user_id","direction","title","category","amount_min","amount_max","frequency","expected_on","timing_hint","status","last_actual_amount","last_confirmed_at","note","created_at","updated_at"],"decimals":["amount_min","amount_max","last_actual_amount"],"order":["id"],"parent":null,"links":{}},{"category":"wealth","table":"wealth_monthly_budgets","columns":["id","user_id","month","category","currency","limit_amount","active","revision","created_at","updated_at","removed_at"],"decimals":["limit_amount"],"order":["id"],"parent":null,"links":{}},{"category":"wealth","table":"wealth_recurring_bills","columns":["id","user_id","title","category","merchant","amount","frequency","first_due","end_date","status","reminder_enabled","revision","created_at","updated_at"],"decimals":["amount"],"order":["id"],"parent":null,"links":{}},{"category":"wealth","table":"wealth_bill_occurrences","columns":["id","user_id","bill_id","due_day","timezone","title","category","merchant","expected_amount","status","revision","paid_at","actual_amount","entry_id"],"decimals":["expected_amount","actual_amount"],"order":["id"],"parent":null,"links":{"bill_id":"wealth_recurring_bills","entry_id":"money_entries"}},{"category":"wealth","table":"wealth_csv_batches","columns":["id","user_id","source_key","file_hash","payload_hash","timezone","row_count","income_total","expense_total","created_at"],"decimals":["income_total","expense_total"],"order":["id"],"parent":null,"links":{}},{"category":"wealth","table":"wealth_csv_rows","columns":["id","user_id","batch_id","source_key","file_hash","row_number","reference_key","entry_id"],"decimals":[],"order":["id"],"parent":null,"links":{"batch_id":"wealth_csv_batches","entry_id":"money_entries"}},{"category":"settings","table":"profiles","columns":["id","user_id","display_name","timezone","locale","created_at","updated_at","current_timezone","current_city","current_country_code","current_location_updated_at","scheduling_timezone"],"decimals":[],"order":["id"],"parent":null,"links":{}},{"category":"settings","table":"user_preferences","columns":["id","user_id","theme_preference","reduced_motion","weather_enabled","dnd_enabled","dnd_start_time","dnd_end_time","created_at","updated_at","default_reminder_channels","untimed_task_reminder_time","incomplete_task_reminder_time","location_enabled"],"decimals":[],"order":["id"],"parent":null,"links":{}},{"category":"settings","table":"ai_privacy_preferences","columns":["user_id","enabled","wealth_enabled","revision","accepted_policy","accepted_at","updated_at"],"decimals":[],"order":["user_id"],"parent":null,"links":{}},{"category":"settings","table":"reminders","columns":["id","user_id","entity_type","scheduled_for","sent_at","channel","status","snoozed_until","dnd_respected","kind","channels","attempt_count"],"decimals":[],"order":["id"],"parent":null,"links":{}},{"category":"settings","table":"reminder_deliveries","columns":["id","user_id","entity_type","scheduled_for","channels","sent_channels","failed_channels","status","attempt_count","created_at","updated_at"],"decimals":[],"order":["id"],"parent":null,"links":{}},{"category":"history","table":"activity_events","columns":["id","user_id","type","entity_type","created_at"],"decimals":[],"order":["id"],"parent":null,"links":{}},{"category":"history","table":"sep28_crystal_preferences","columns":["user_id","enabled","activated_at","enabled_since","revision"],"decimals":[],"order":["user_id"],"parent":null,"links":{}},{"category":"history","table":"sep28_crystal_awards","columns":["user_id","kind","source_key","eligible","allowed_source","balance","revision"],"decimals":[],"order":["kind","source_key"],"parent":null,"links":{}},{"category":"history","table":"sep28_crystal_events","columns":["id","user_id","kind","source_key","revision","delta","created_at"],"decimals":[],"order":["id"],"parent":null,"links":{}},{"category":"history","table":"sep28_crystal_moments","columns":["user_id","level","reached_at","claimed_at"],"decimals":[],"order":["level"],"parent":null,"links":{}}]'::jsonb) LOOP
 IF NOT d->>'category'=ANY(p_categories) THEN CONTINUE; END IF;
 projection:='';sorting:='';
 FOR col IN SELECT jsonb_array_elements_text(d->'columns') LOOP
 projection:=projection||CASE WHEN projection='' THEN '' ELSE ',' END||format('t.%I%s AS %I',col,CASE WHEN d->'decimals'?col THEN '::text' ELSE '' END,col);
 END LOOP;
 FOR col IN SELECT jsonb_array_elements_text(d->'order') LOOP sorting:=sorting||CASE WHEN sorting='' THEN '' ELSE ',' END||format('t.%I',col);END LOOP;
 pred:=CASE WHEN d->>'parent' IS NOT NULL THEN 'EXISTS(SELECT 1 FROM public.recurring_tasks p WHERE p.id=t.task_id AND p.user_id=$1)' ELSE 't.user_id=$1' END;
 FOR link IN SELECT key,value FROM jsonb_each_text(d->'links') LOOP
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
