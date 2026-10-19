-- Piece 4 candidate. Disposable LOCAL testing only; hosted history/compatibility UNKNOWN.
-- Requires approved September 0000–0005, 0013–0015. No historical outcome/reward backfill.
BEGIN;
ALTER TABLE public.assignments ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 ADD COLUMN reminder_version integer NOT NULL DEFAULT 1 CHECK(reminder_version>0);
CREATE INDEX assignment_owner_deadline_id_idx ON public.assignments(user_id,deadline,id);
CREATE SCHEMA crystrack_assignments;
REVOKE ALL ON SCHEMA crystrack_assignments FROM PUBLIC,anon,authenticated,service_role;
-- Minimal identity tombstones prevent a delayed create retry resurrecting deleted work.
CREATE TABLE crystrack_assignments.identities(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE);
ALTER TABLE crystrack_assignments.identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crystrack_assignments.identities FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION crystrack_assignments.same_schedule(a jsonb,b jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(a->>'enabled','true')=coalesce(b->>'enabled','true')
 AND coalesce(a->'channels','["push"]') @> coalesce(b->'channels','["push"]') AND coalesce(b->'channels','["push"]') @> coalesce(a->'channels','["push"]')
 AND coalesce(a->'offsetMinutes','[1440,120,0]') @> coalesce(b->'offsetMinutes','[1440,120,0]') AND coalesce(b->'offsetMinutes','[1440,120,0]') @> coalesce(a->'offsetMinutes','[1440,120,0]')
$$;


CREATE FUNCTION crystrack_assignments.zone(u uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT coalesce(scheduling_timezone,timezone,'UTC') FROM public.profiles WHERE user_id=u),'UTC')
$$;
CREATE FUNCTION crystrack_assignments.state(d timestamptz,c timestamptz,n timestamptz,z text) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN c IS NOT NULL THEN CASE WHEN c>d THEN 'finished_late' ELSE 'completed_on_time' END
 WHEN d<n THEN 'overdue' WHEN (d AT TIME ZONE z)::date=(n AT TIME ZONE z)::date THEN 'due_today'
 WHEN (d AT TIME ZONE z)::date<(n AT TIME ZONE z)::date+3 THEN 'due_soon' ELSE 'upcoming' END
$$;

-- All source writes, event reconciliation and pending reminder plans share the source transaction.
-- The original 0015 reward trigger remains the only assignment shard authority.
CREATE FUNCTION crystrack_assignments.reconcile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid; ident uuid; v_offset integer; cfg jsonb; channels text[];
BEGIN
 u:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
 ident:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 IF TG_OP='DELETE' THEN
  INSERT INTO crystrack_assignments.identities(id,user_id) VALUES(ident,u) ON CONFLICT(id) DO NOTHING;
  DELETE FROM public.reminders WHERE user_id=u AND entity_type='assignment' AND entity_id=ident;
  DELETE FROM public.reminder_deliveries WHERE user_id=u AND entity_type='assignment' AND entity_id=ident;
  DELETE FROM public.activity_events WHERE user_id=u AND entity_type='assignment' AND entity_id=ident;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND OLD.status='completed' AND NEW.status<>'completed' THEN
  DELETE FROM public.activity_events WHERE user_id=u AND entity_type='assignment' AND entity_id=ident AND type='assignment_completed';
 END IF;
 IF NEW.status='completed' THEN
  DELETE FROM public.reminders WHERE user_id=u AND entity_type='assignment' AND entity_id=ident AND status IN ('pending','snoozed');
  IF TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
   INSERT INTO public.activity_events(user_id,type,entity_type,entity_id,metadata_json)
   VALUES(u,'assignment_completed','assignment',ident,jsonb_build_object('title',NEW.title,'status','completed','deadline',NEW.deadline,'completed_at',NEW.completed_at,'finished_late',NEW.completed_at>NEW.deadline));
  END IF;
 ELSIF TG_OP='INSERT' OR OLD.reminder_version<>NEW.reminder_version THEN
  DELETE FROM public.reminders WHERE user_id=u AND entity_type='assignment' AND entity_id=ident AND status IN ('pending','snoozed');
  cfg:=NEW.reminder_config;
  IF coalesce((cfg->>'enabled')::boolean,true) THEN
   channels:=ARRAY(SELECT jsonb_array_elements_text(coalesce(cfg->'channels','["push"]')));
   FOR v_offset IN SELECT jsonb_array_elements_text(coalesce(cfg->'offsetMinutes','[1440,120,0]'))::integer LOOP
    INSERT INTO public.reminders(user_id,entity_type,entity_id,title,kind,scheduled_for,channels,delivery_key,metadata_json)
    VALUES(u,'assignment',ident,NEW.title,'assignment_deadline',NEW.deadline-make_interval(mins=>v_offset),channels,
     'assignment:'||ident||':v'||NEW.reminder_version||':offset:'||v_offset,jsonb_build_object('revision',NEW.reminder_version,'offsetMinutes',v_offset));
   END LOOP;
  END IF;
 ELSE
  UPDATE public.reminders SET title=NEW.title WHERE user_id=u AND entity_type='assignment' AND entity_id=ident AND status='pending';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assignment_reconcile AFTER INSERT OR UPDATE OR DELETE ON public.assignments FOR EACH ROW EXECUTE FUNCTION crystrack_assignments.reconcile();

-- No caller can write completion timestamps, ownership, revisions or reward amounts.
-- Direct source writes are removed; existing owner SELECT RLS is retained.
REVOKE INSERT,UPDATE,DELETE ON public.assignments FROM anon,authenticated;
CREATE FUNCTION public.assignment_mutate(p_action text,p_id uuid,p_revision integer DEFAULT NULL,p_fields jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); a public.assignments; d timestamptz; cfg jsonb; z text; result jsonb;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_action IS NULL OR p_action NOT IN ('create','edit','complete','delete') THEN RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023'; END IF;
 -- Owner lock also serializes concurrent creates and retries of the same UUID.
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,24));
 SELECT * INTO a FROM public.assignments WHERE id=p_id AND user_id=u FOR UPDATE;
 IF p_action='delete' AND a.id IS NULL THEN RETURN jsonb_build_object('ok',true,'deletedId',p_id); END IF;
 IF p_action<>'create' AND a.id IS NULL THEN RAISE EXCEPTION 'Assignment not found' USING ERRCODE='P0002'; END IF;
 IF p_action='complete' AND a.status='completed' THEN RETURN to_jsonb(a); END IF;
 IF p_action IN ('edit','delete','complete') AND (p_revision IS NULL OR a.revision<>p_revision) THEN RAISE EXCEPTION 'Assignment changed. Refresh and review before trying again.' USING ERRCODE='PT409'; END IF;
 IF p_action='delete' THEN
  DELETE FROM public.assignments WHERE id=a.id AND user_id=u;
  RETURN jsonb_build_object('ok',true,'deletedId',p_id);
 END IF;
 IF p_action='complete' THEN
  UPDATE public.assignments SET status='completed',completed_at=crystrack_daily.clock(),revision=revision+1 WHERE id=a.id RETURNING * INTO a;
  RETURN to_jsonb(a);
 END IF;
 IF p_action='edit' AND a.status='completed' THEN RAISE EXCEPTION 'Finished work keeps its recorded deadline.' USING ERRCODE='PT409'; END IF;
 IF jsonb_typeof(p_fields)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_fields) k WHERE k NOT IN ('title','description','deadline','priority','category','reminder_config','timezone')) THEN RAISE EXCEPTION 'Invalid assignment fields' USING ERRCODE='22023'; END IF;
 z:=crystrack_assignments.zone(u);
 IF p_fields->>'timezone' IS DISTINCT FROM z THEN RAISE EXCEPTION 'Scheduling timezone changed. Refresh and review the deadline.' USING ERRCODE='PT409'; END IF;
 d:=(p_fields->>'deadline')::timestamptz; cfg:=p_fields->'reminder_config';
 IF d IS NULL OR NOT isfinite(d) OR length(trim(p_fields->>'title')) NOT BETWEEN 1 AND 255 OR p_fields->>'title' IS NULL
 OR length(coalesce(p_fields->>'description',''))>10000 OR length(coalesce(p_fields->>'category',''))>100
 OR coalesce(p_fields->>'priority','') NOT IN ('low','medium','high','urgent')
 OR jsonb_typeof(cfg) IS DISTINCT FROM 'object' OR jsonb_typeof(cfg->'enabled') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(cfg->'channels') IS DISTINCT FROM 'array' OR jsonb_typeof(cfg->'offsetMinutes') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid assignment fields' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(cfg->'channels') NOT BETWEEN 1 AND 2 OR jsonb_array_length(cfg->'offsetMinutes')>12
 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(cfg->'channels') c WHERE c NOT IN ('push','telegram'))
 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(cfg->'offsetMinutes') o WHERE o !~ '^\d{1,5}$' OR o::integer>43200)
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(cfg) k WHERE k NOT IN ('enabled','channels','offsetMinutes'))
 OR (SELECT count(*) FROM jsonb_array_elements(cfg->'offsetMinutes'))<>(SELECT count(DISTINCT value) FROM jsonb_array_elements(cfg->'offsetMinutes')) THEN RAISE EXCEPTION 'Invalid reminders' USING ERRCODE='22023'; END IF;
 IF p_action='create' THEN
  IF a.id IS NOT NULL THEN
   IF a.title=trim(p_fields->>'title') AND a.description IS NOT DISTINCT FROM nullif(p_fields->>'description','') AND a.deadline=d AND a.priority::text=p_fields->>'priority' AND a.category IS NOT DISTINCT FROM nullif(p_fields->>'category','') AND crystrack_assignments.same_schedule(a.reminder_config,cfg) THEN RETURN to_jsonb(a); END IF;
   RAISE EXCEPTION 'This submission already exists with different details.' USING ERRCODE='PT409';
  END IF;
  IF EXISTS(SELECT 1 FROM crystrack_assignments.identities WHERE id=p_id) THEN RAISE EXCEPTION 'This assignment was removed. Start a new submission.' USING ERRCODE='PT409'; END IF;
  INSERT INTO crystrack_assignments.identities(id,user_id) VALUES(p_id,u);
  INSERT INTO public.assignments(id,user_id,title,description,deadline,priority,category,reminder_config)
  VALUES(p_id,u,trim(p_fields->>'title'),nullif(p_fields->>'description',''),d,(p_fields->>'priority')::public.priority,nullif(p_fields->>'category',''),cfg) RETURNING * INTO a;
 ELSE
  -- Metadata edits do not reset delivery keys; only the schedule/channels/offsets do.
  UPDATE public.assignments SET title=trim(p_fields->>'title'),description=nullif(p_fields->>'description',''),deadline=d,
   priority=(p_fields->>'priority')::public.priority,category=nullif(p_fields->>'category',''),reminder_config=cfg,
   reminder_version=reminder_version+CASE WHEN deadline IS DISTINCT FROM d OR NOT crystrack_assignments.same_schedule(reminder_config,cfg) THEN 1 ELSE 0 END,
   revision=revision+1 WHERE id=a.id RETURNING * INTO a;
 END IF;
 RETURN to_jsonb(a);
END $$;

CREATE FUNCTION public.assignment_list(p_filter jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); z text; n timestamptz:=crystrack_daily.clock(); today date; rows jsonb; counts jsonb; week jsonb;
 lim integer:=coalesce((p_filter->>'limit')::integer,30); pg integer:=coalesce((p_filter->>'page')::integer,0);
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 IF lim NOT BETWEEN 1 AND 200 OR pg NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
 z:=crystrack_assignments.zone(u);today:=(n AT TIME ZONE z)::date;
 WITH classified AS (SELECT a.*,CASE WHEN status='completed' AND completed_at IS NULL THEN 'completion_unknown' ELSE crystrack_assignments.state(deadline,CASE WHEN status='completed' THEN completed_at END,n,z) END computed_status FROM public.assignments a WHERE user_id=u),
 filtered AS (SELECT * FROM classified WHERE
 (coalesce(p_filter->>'search','')='' OR position(lower(p_filter->>'search') IN lower(title||' '||coalesce(description,'')||' '||coalesce(category,'')))>0)
 AND (coalesce(p_filter->>'priority','')='' OR priority::text=p_filter->>'priority')
 AND (coalesce(p_filter->>'category','')='' OR position(lower(p_filter->>'category') IN lower(coalesce(category,'')))>0)
 AND (coalesce(p_filter->>'state','active')='all' OR (p_filter->>'state'='completed' AND status='completed') OR (coalesce(p_filter->>'state','active')='active' AND status<>'completed') OR computed_status=p_filter->>'state')
 AND (coalesce(p_filter->>'from','')='' OR (deadline AT TIME ZONE z)::date>=(p_filter->>'from')::date)
 AND (coalesce(p_filter->>'to','')='' OR (deadline AT TIME ZONE z)::date<=(p_filter->>'to')::date)),
 sorted AS (SELECT * FROM filtered ORDER BY CASE WHEN p_filter->>'sort'='desc' THEN deadline END DESC, CASE WHEN coalesce(p_filter->>'sort','asc')<>'desc' THEN deadline END ASC,id LIMIT lim+1 OFFSET pg*lim)
 SELECT coalesce(jsonb_agg(to_jsonb(sorted)),'[]') INTO rows FROM sorted;
 SELECT jsonb_object_agg(s,c) INTO counts FROM (SELECT CASE WHEN status='completed' AND completed_at IS NULL THEN 'completion_unknown' ELSE crystrack_assignments.state(deadline,CASE WHEN status='completed' THEN completed_at END,n,z) END s,count(*) c FROM public.assignments WHERE user_id=u GROUP BY 1) q;
 SELECT jsonb_agg(jsonb_build_object('day',day_key,'count',c) ORDER BY day_key) INTO week FROM (
 SELECT today+i day_key,(SELECT count(*) FROM public.assignments WHERE user_id=u AND status<>'completed' AND deadline>=n AND (deadline AT TIME ZONE z)::date=today+i) c FROM generate_series(0,6) i) q;
 RETURN jsonb_build_object('items',(SELECT coalesce(jsonb_agg(value),'[]') FROM jsonb_array_elements(rows) WITH ORDINALITY t(value,i) WHERE i<=lim),
 'hasMore',jsonb_array_length(rows)>lim,'page',pg,'timezone',z,'now',n,'counts',coalesce(counts,'{}'),'week',week);
END $$;

-- Atomic service-only schedule claim. An edit/completion that wins the row lock first
-- makes stale cron snapshots harmless. Delivery already claimed/in flight cannot be unsent.
CREATE FUNCTION public.assignment_claim_reminder(p_id uuid,p_version integer,p_offset integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.assignments; r public.reminder_deliveries; n timestamptz:=clock_timestamp(); diff numeric; channels text[]; remaining text[]; k text; v_payload jsonb;
BEGIN
 SELECT * INTO a FROM public.assignments WHERE id=p_id FOR UPDATE;
 IF a.id IS NULL OR a.status='completed' OR a.reminder_version<>p_version OR coalesce(a.reminder_config->>'enabled','true')='false'
 OR NOT (coalesce(a.reminder_config->'offsetMinutes','[1440,120,0]') @> to_jsonb(ARRAY[p_offset])) THEN RETURN NULL; END IF;
 diff:=extract(epoch FROM(a.deadline-n))/60;
 IF NOT ((p_offset=0 AND diff<=0 AND diff> -1440) OR (p_offset>0 AND diff<=p_offset AND diff>p_offset-CASE WHEN p_offset>=1440 THEN 15 ELSE 5 END)) THEN RETURN NULL; END IF;
 k:='assignment:'||a.id||':v'||p_version||':offset:'||p_offset;
 channels:=ARRAY(SELECT jsonb_array_elements_text(coalesce(a.reminder_config->'channels','["push"]')));
 v_payload:=jsonb_build_object('title',a.title,'body',CASE WHEN p_offset=0 THEN 'Your assignment deadline is here. Ready when you are.' ELSE 'An assignment deadline is coming up.' END,'url','/assignments','tag',k);
 SELECT * INTO r FROM public.reminder_deliveries WHERE delivery_key=k OR (p_version=1 AND delivery_key='assignment:'||a.id||':offset:'||p_offset) ORDER BY created_at LIMIT 1 FOR UPDATE;
 IF r.id IS NOT NULL THEN
  remaining:=ARRAY(SELECT unnest(channels) EXCEPT SELECT unnest(r.sent_channels));
  IF r.status='sent' OR cardinality(remaining)=0 OR r.attempt_count>=3 OR (r.status='processing' AND r.updated_at>n-interval '5 minutes') OR r.updated_at>n-interval '45 seconds' THEN RETURN NULL; END IF;
  UPDATE public.reminder_deliveries SET status='processing',attempt_count=attempt_count+1,failed_channels='{}',last_error=NULL,payload=v_payload WHERE id=r.id RETURNING * INTO r;
 ELSE
  remaining:=channels;
  INSERT INTO public.reminder_deliveries(user_id,entity_type,entity_id,delivery_key,scheduled_for,channels,payload)
   VALUES(a.user_id,'assignment',a.id,k,n,channels,v_payload) RETURNING * INTO r;
 END IF;
 UPDATE public.reminders SET status='sent',sent_at=n WHERE user_id=a.user_id AND delivery_key=k;
 RETURN jsonb_build_object('id',r.id,'priorSent',r.sent_channels,'channelsToAttempt',remaining,'payload',v_payload,'userId',a.user_id,'deliveryKey',k);
END $$;
CREATE FUNCTION public.assignment_finish_delivery(p_delivery uuid,p_sent text[],p_failed text[],p_error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.reminder_deliveries; a public.assignments;
BEGIN
 -- Same source-row lock order as edit/delete/claim; deletion cannot resurrect activity.
 SELECT a0.* INTO a FROM public.assignments a0 JOIN public.reminder_deliveries d ON d.entity_id=a0.id AND d.user_id=a0.user_id WHERE d.id=p_delivery AND d.entity_type='assignment' FOR UPDATE OF a0;
 IF a.id IS NULL THEN RETURN; END IF;
 SELECT * INTO r FROM public.reminder_deliveries WHERE id=p_delivery FOR UPDATE;
 IF r.id IS NULL THEN RETURN; END IF;
 UPDATE public.reminder_deliveries SET sent_channels=p_sent,failed_channels=p_failed,status=CASE WHEN cardinality(p_failed)=0 THEN 'sent' WHEN cardinality(p_sent)>0 THEN 'partial' ELSE 'failed' END,last_error=p_error WHERE id=r.id;
 IF a.status<>'completed' AND (r.delivery_key='assignment:'||a.id||':v'||a.reminder_version||':offset:'||split_part(r.delivery_key,':',5) OR (a.reminder_version=1 AND r.delivery_key LIKE 'assignment:'||a.id||':offset:%')) AND EXISTS(SELECT 1 FROM unnest(p_sent) c WHERE NOT c=ANY(r.sent_channels)) THEN
  INSERT INTO public.activity_events(user_id,type,entity_type,entity_id,metadata_json) VALUES(a.user_id,'reminder_sent','assignment',a.id,jsonb_build_object('title',a.title,'delivery_key',r.delivery_key,'channels',p_sent));
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.assignment_finish_delivery(uuid,text[],text[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assignment_finish_delivery(uuid,text[],text[],text) TO service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crystrack_assignments FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.assignment_mutate(text,uuid,integer,jsonb),public.assignment_list(jsonb),public.assignment_claim_reminder(uuid,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.assignment_mutate(text,uuid,integer,jsonb),public.assignment_list(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assignment_claim_reminder(uuid,integer,integer) TO service_role;
COMMIT;
