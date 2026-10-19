-- September-only additive candidate. Apply ONLY in the isolated local sandbox in this PR.
-- No legacy XP/gamification dependency, backfill, finance arithmetic, or source-row rewrite.
-- Deliberately fail on a name collision; never adopt/overwrite a hosted object.
BEGIN;
CREATE SCHEMA crystrack_sep28_crystals;
REVOKE ALL ON SCHEMA crystrack_sep28_crystals FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.sep28_crystal_preferences (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT true, activated_at timestamptz NOT NULL,
 enabled_since timestamptz NOT NULL, revision integer NOT NULL DEFAULT 1 CHECK(revision>0)
);
CREATE TABLE public.sep28_crystal_awards (
 user_id uuid NOT NULL REFERENCES public.sep28_crystal_preferences(user_id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('task','day','goal','assignment','spending')),
 source_key text NOT NULL, eligible boolean NOT NULL, allowed_source boolean NOT NULL DEFAULT true,
 balance integer NOT NULL, revision integer NOT NULL CHECK(revision>0),
 PRIMARY KEY(user_id,kind,source_key),
 CHECK(balance=0 OR balance=CASE kind WHEN 'task' THEN 5 WHEN 'day' THEN 50 WHEN 'goal' THEN 25 WHEN 'assignment' THEN 30 WHEN 'spending' THEN 5 END),
 CHECK(eligible OR balance=0)
);
CREATE TABLE public.sep28_crystal_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 kind text NOT NULL, source_key text NOT NULL, revision integer NOT NULL CHECK(revision>0),
 delta integer NOT NULL, created_at timestamptz NOT NULL,
 FOREIGN KEY(user_id,kind,source_key) REFERENCES public.sep28_crystal_awards(user_id,kind,source_key) ON DELETE CASCADE,
 UNIQUE(user_id,kind,source_key,revision),
 CHECK(abs(delta)=CASE kind WHEN 'task' THEN 5 WHEN 'day' THEN 50 WHEN 'goal' THEN 25 WHEN 'assignment' THEN 30 WHEN 'spending' THEN 5 ELSE 0 END AND delta<>0)
);
CREATE INDEX sep28_crystal_events_owner ON public.sep28_crystal_events(user_id);
CREATE TABLE public.sep28_crystal_moments (
 user_id uuid NOT NULL REFERENCES public.sep28_crystal_preferences(user_id) ON DELETE CASCADE,
 level integer NOT NULL CHECK(level>=2), reached_at timestamptz NOT NULL, claimed_at timestamptz,
 PRIMARY KEY(user_id,level)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['sep28_crystal_preferences','sep28_crystal_awards','sep28_crystal_events','sep28_crystal_moments'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY sep28_crystal_owner_read ON public.%I FOR SELECT TO authenticated USING(user_id=auth.uid())',t);
 END LOOP;
END $$;
CREATE FUNCTION crystrack_sep28_crystals.lock_owner(u uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,23));
 INSERT INTO public.sep28_crystal_preferences(user_id,activated_at,enabled_since)
 VALUES(u,crystrack_daily.clock(),crystrack_daily.clock()) ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION crystrack_sep28_crystals.level_for(total numeric) RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE n integer:=1; segment numeric:=500; remaining numeric:=total;
BEGIN
 IF total<0 OR total<>trunc(total) THEN RAISE EXCEPTION 'Invalid shard total'; END IF;
 WHILE remaining>=segment LOOP remaining:=remaining-segment; segment:=ceil(segment*6/5); n:=n+1; END LOOP;
 RETURN n;
END $$;
CREATE FUNCTION crystrack_sep28_crystals.reconcile(u uuid,k text,s text,wanted boolean,register_source boolean,allow_credit boolean,allowed boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.sep28_crystal_awards; pref public.sep28_crystal_preferences; points integer; next_balance integer;
 total numeric; before_level integer; after_level integer;
BEGIN
 -- Account deletion may cascade sources after the auth row is already gone.
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u) THEN RETURN; END IF;
 PERFORM crystrack_sep28_crystals.lock_owner(u);
 SELECT * INTO a FROM public.sep28_crystal_awards WHERE user_id=u AND kind=k AND source_key=s FOR UPDATE;
 IF NOT FOUND THEN
  IF NOT register_source THEN RETURN; END IF;
  INSERT INTO public.sep28_crystal_awards(user_id,kind,source_key,eligible,allowed_source,balance,revision)
   VALUES(u,k,s,false,allowed,0,1) RETURNING * INTO a;
 END IF;
 wanted:=wanted AND a.allowed_source;
 IF a.eligible=wanted THEN RETURN; END IF;
 SELECT * INTO pref FROM public.sep28_crystal_preferences WHERE user_id=u;
 points:=CASE k WHEN 'task' THEN 5 WHEN 'day' THEN 50 WHEN 'goal' THEN 25 WHEN 'assignment' THEN 30 WHEN 'spending' THEN 5 END;
 next_balance:=CASE WHEN wanted AND pref.enabled AND allow_credit THEN points ELSE 0 END;
 SELECT coalesce(sum(delta),0) INTO total FROM public.sep28_crystal_events WHERE user_id=u;
 before_level:=crystrack_sep28_crystals.level_for(total);
 UPDATE public.sep28_crystal_awards SET eligible=wanted,balance=next_balance,revision=revision+1 WHERE user_id=u AND kind=k AND source_key=s;
 IF next_balance<>a.balance THEN
  INSERT INTO public.sep28_crystal_events(user_id,kind,source_key,revision,delta,created_at)
   VALUES(u,k,s,a.revision+1,next_balance-a.balance,crystrack_daily.clock());
  after_level:=crystrack_sep28_crystals.level_for(total+next_balance-a.balance);
  IF after_level>before_level THEN
   INSERT INTO public.sep28_crystal_moments(user_id,level,reached_at)
    SELECT u,n,crystrack_daily.clock() FROM generate_series(before_level+1,after_level) n ON CONFLICT DO NOTHING;
  END IF;
 END IF;
END $$;
CREATE FUNCTION crystrack_sep28_crystals.day_bonus(u uuid,d date,register_source boolean) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE h public.daily_records; pref public.sep28_crystal_preferences; valid boolean;
BEGIN
 PERFORM crystrack_sep28_crystals.lock_owner(u);
 SELECT * INTO h FROM public.daily_records WHERE user_id=u AND day_key=d;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO pref FROM public.sep28_crystal_preferences WHERE user_id=u;
 valid:=h.evidence='verified' AND h.close_status='closed' AND h.expected_count>0
  AND h.closed_at>=h.closes_at AND h.closes_at<=crystrack_daily.clock()
  AND h.expected_count=(SELECT count(*) FROM public.daily_routine_records WHERE user_id=u AND day_key=d)
  AND NOT EXISTS(SELECT 1 FROM public.daily_routine_records WHERE user_id=u AND day_key=d AND (status<>'completed' OR legacy_conflict));
 PERFORM crystrack_sep28_crystals.reconcile(u,'day',h.id::text,valid,register_source,register_source AND h.opens_at>=pref.activated_at AND h.opens_at>=pref.enabled_since);
END $$;
CREATE FUNCTION crystrack_sep28_crystals.daily_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid; d date; h public.daily_records; x public.daily_routine_records; valid boolean; authentic boolean;
BEGIN
 IF TG_TABLE_NAME='daily_records' THEN
  IF OLD.evidence IS DISTINCT FROM NEW.evidence THEN
   FOR x IN SELECT * FROM public.daily_routine_records WHERE user_id=NEW.user_id AND day_key=NEW.day_key LOOP
    PERFORM crystrack_sep28_crystals.reconcile(NEW.user_id,'task',x.id::text,NEW.evidence='verified' AND x.status='completed' AND NOT x.legacy_conflict,false,false);
   END LOOP;
  END IF;
  PERFORM crystrack_sep28_crystals.day_bonus(NEW.user_id,NEW.day_key,OLD.close_status='open' AND NEW.close_status='closed');
  RETURN NEW;
 END IF;
 u:=OLD.user_id; d:=OLD.day_key;
 IF TG_OP='DELETE' THEN
  PERFORM crystrack_sep28_crystals.reconcile(u,'task',OLD.id::text,false,false,false);
 ELSE
  SELECT * INTO h FROM public.daily_records WHERE user_id=u AND day_key=d;
  valid:=NEW.status='completed' AND NOT NEW.legacy_conflict AND h.evidence='verified';
  authentic:=auth.uid()=u AND auth.role()='authenticated';
  PERFORM crystrack_sep28_crystals.reconcile(u,'task',NEW.id::text,coalesce(valid,false),
   OLD.status<>'completed' AND NEW.status='completed',coalesce(authentic,false) AND OLD.status<>'completed' AND NEW.status='completed');
 END IF;
 -- Corrections may revoke a closed-day bonus, but never mint a new past bonus.
 PERFORM crystrack_sep28_crystals.day_bonus(u,d,false);
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER sep28_crystal_daily_close AFTER UPDATE ON public.daily_records FOR EACH ROW EXECUTE FUNCTION crystrack_sep28_crystals.daily_source();
CREATE TRIGGER sep28_crystal_daily_tick AFTER UPDATE OR DELETE ON public.daily_routine_records FOR EACH ROW EXECUTE FUNCTION crystrack_sep28_crystals.daily_source();

CREATE FUNCTION crystrack_sep28_crystals.source_identity() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id OR (TG_TABLE_NAME='goal_checkins' AND
  (to_jsonb(NEW)->>'goal_id' IS DISTINCT FROM to_jsonb(OLD)->>'goal_id' OR to_jsonb(NEW)->>'occurrence_key' IS DISTINCT FROM to_jsonb(OLD)->>'occurrence_key')) THEN
  RAISE EXCEPTION 'Immutable reward source identity' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION crystrack_sep28_crystals.ordinary_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rowdata jsonb; u uuid; k text; s text; valid boolean:=false; manual boolean; g public.goals;
 z text; d date; startday date; frequency text; weekday integer; expected_key text;
BEGIN
 rowdata:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 u:=(rowdata->>'user_id')::uuid;
 k:=CASE TG_TABLE_NAME WHEN 'goal_checkins' THEN 'goal' WHEN 'assignments' THEN 'assignment' ELSE 'spending' END;
 s:=CASE WHEN k='goal' THEN (rowdata->>'goal_id')||':'||coalesce(rowdata->>'occurrence_key','legacy:'||(rowdata->>'id')) ELSE rowdata->>'id' END;
 IF TG_OP='DELETE' THEN
  PERFORM crystrack_sep28_crystals.reconcile(u,k,s,false,false,false); RETURN OLD;
 END IF;
 IF k='goal' THEN
  IF TG_OP='UPDATE' THEN RETURN NEW; END IF; -- AI/text edits never mint/reconfirm.
  SELECT * INTO g FROM public.goals WHERE id=(rowdata->>'goal_id')::uuid AND user_id=u;
  IF FOUND AND g.status='active' AND (g.deadline IS NULL OR g.deadline>=crystrack_daily.clock()) THEN
   SELECT coalesce(scheduling_timezone,timezone,'UTC') INTO z FROM public.profiles WHERE user_id=u;
   IF EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=z) THEN
    d:=(crystrack_daily.clock() AT TIME ZONE z)::date;
    frequency:=coalesce(g.checkin_config->>'frequency','weekly');
    IF frequency='daily' THEN expected_key:='daily:'||d::text;
    ELSIF frequency='specific' THEN
     IF coalesce(g.checkin_config->'days','[]'::jsonb) @> to_jsonb(ARRAY[extract(dow FROM d)::integer]) THEN expected_key:='specific:'||d::text; END IF;
    ELSE
     weekday:=CASE WHEN (g.checkin_config->'days'->>0) ~ '^[0-6]$' THEN (g.checkin_config->'days'->>0)::integer ELSE extract(dow FROM d)::integer END;
     startday:=d-((extract(dow FROM d)::integer-weekday+7)%7); expected_key:='weekly:'||startday::text;
    END IF;
    valid:=rowdata->>'occurrence_key'=expected_key;
   END IF;
  END IF;
 ELSIF k='assignment' THEN
  valid:=rowdata->>'status'='completed' AND rowdata->>'completed_at' IS NOT NULL;
  IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status AND OLD.completed_at IS NOT DISTINCT FROM NEW.completed_at THEN RETURN NEW; END IF;
 ELSE
  -- Mark origin at INSERT: FK clearing/editing an automatic row can never make it manual.
  manual:=auth.uid()=u AND auth.role()='authenticated' AND rowdata->>'debt_id' IS NULL
   AND rowdata->>'expected_flow_id' IS NULL AND rowdata->>'parent_entry_id' IS NULL AND rowdata->>'bill_id' IS NULL;
  valid:=rowdata->>'type'='expense' AND coalesce(rowdata->>'flow_kind',rowdata->>'type')='expense'
   AND (rowdata->>'amount')::numeric>0 AND rowdata->>'deleted_at' IS NULL
   AND rowdata->>'debt_id' IS NULL AND rowdata->>'expected_flow_id' IS NULL
   AND rowdata->>'parent_entry_id' IS NULL AND rowdata->>'bill_id' IS NULL;
 END IF;
 PERFORM crystrack_sep28_crystals.reconcile(u,k,s,coalesce(valid,false),
  TG_OP='INSERT' OR (k='assignment' AND TG_OP='UPDATE' AND (to_jsonb(OLD)->>'status') IS DISTINCT FROM (rowdata->>'status')),
  coalesce(auth.uid()=u AND auth.role()='authenticated',false),CASE WHEN k='spending' THEN coalesce(manual,false) ELSE true END);
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['goal_checkins','assignments','money_entries'] LOOP
  EXECUTE format('CREATE TRIGGER sep28_crystal_identity BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION crystrack_sep28_crystals.source_identity()',t);
  EXECUTE format('CREATE TRIGGER sep28_crystal_source AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION crystrack_sep28_crystals.ordinary_source()',t);
 END LOOP;
END $$;

CREATE FUNCTION public.sep28_crystal_state() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); pref public.sep28_crystal_preferences; total numeric;
BEGIN
 PERFORM crystrack_sep28_crystals.lock_owner(u);
 SELECT * INTO pref FROM public.sep28_crystal_preferences WHERE user_id=u;
 SELECT coalesce(sum(delta),0) INTO total FROM public.sep28_crystal_events WHERE user_id=u;
 RETURN jsonb_build_object('enabled',pref.enabled,'revision',pref.revision,'total',total::text,
  'pendingMoment',pref.enabled AND EXISTS(SELECT 1 FROM public.sep28_crystal_moments WHERE user_id=u AND claimed_at IS NULL AND level<=crystrack_sep28_crystals.level_for(total)));
END $$;
CREATE FUNCTION public.sep28_crystal_configure(p_enabled boolean,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); pref public.sep28_crystal_preferences;
BEGIN
 PERFORM crystrack_sep28_crystals.lock_owner(u);
 SELECT * INTO pref FROM public.sep28_crystal_preferences WHERE user_id=u;
 IF p_enabled IS NULL OR p_revision IS DISTINCT FROM pref.revision THEN RAISE EXCEPTION 'Refresh reward settings' USING ERRCODE='PT409'; END IF;
 IF pref.enabled<>p_enabled THEN
  UPDATE public.sep28_crystal_preferences SET enabled=p_enabled,revision=revision+1,
   enabled_since=CASE WHEN p_enabled THEN crystrack_daily.clock() ELSE enabled_since END WHERE user_id=u;
  IF NOT p_enabled THEN UPDATE public.sep28_crystal_moments SET claimed_at=crystrack_daily.clock() WHERE user_id=u AND claimed_at IS NULL; END IF;
 END IF;
 RETURN public.sep28_crystal_state();
END $$;
CREATE FUNCTION public.sep28_crystal_claim_moment() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); n integer; total numeric;
BEGIN
 PERFORM crystrack_sep28_crystals.lock_owner(u);
 IF NOT (SELECT enabled FROM public.sep28_crystal_preferences WHERE user_id=u) THEN RETURN NULL; END IF;
 SELECT coalesce(sum(delta),0) INTO total FROM public.sep28_crystal_events WHERE user_id=u;
 SELECT max(level) INTO n FROM public.sep28_crystal_moments WHERE user_id=u AND claimed_at IS NULL AND level<=crystrack_sep28_crystals.level_for(total);
 IF n IS NULL THEN RETURN NULL; END IF;
 -- Claim before display: refresh/restored/concurrent tabs cannot replay a celebration.
 UPDATE public.sep28_crystal_moments SET claimed_at=crystrack_daily.clock() WHERE user_id=u AND claimed_at IS NULL AND level<=n;
 RETURN jsonb_build_object('level',n);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crystrack_sep28_crystals FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.sep28_crystal_state(),public.sep28_crystal_configure(boolean,integer),public.sep28_crystal_claim_moment() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.sep28_crystal_state(),public.sep28_crystal_configure(boolean,integer),public.sep28_crystal_claim_moment() TO authenticated;
COMMIT;
