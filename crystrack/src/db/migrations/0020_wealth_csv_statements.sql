-- Issue #31 additive LOCAL-ONLY candidate. Hosted compatibility UNKNOWN; #18 blocks release.
BEGIN;
CREATE SCHEMA crystrack_csv;
REVOKE ALL ON SCHEMA crystrack_csv FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.wealth_csv_batches(
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),source_key text NOT NULL,file_hash text NOT NULL,
 payload_hash text NOT NULL,timezone text NOT NULL,row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 500),
 income_total numeric NOT NULL CHECK(income_total>=0),expense_total numeric NOT NULL CHECK(expense_total>=0),created_at timestamptz NOT NULL,
 CONSTRAINT csv_batch_owner_identity UNIQUE(id,user_id),CHECK(source_key~'^[a-z0-9][a-z0-9_-]{0,59}$'),CHECK(file_hash~'^[a-f0-9]{64}$')
);
CREATE TABLE public.wealth_csv_rows(
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),batch_id uuid NOT NULL,source_key text NOT NULL,file_hash text NOT NULL,
 row_number integer NOT NULL CHECK(row_number BETWEEN 1 AND 500),reference_key text,entry_id uuid NOT NULL UNIQUE,reviewed_row jsonb NOT NULL,
 FOREIGN KEY(batch_id,user_id) REFERENCES public.wealth_csv_batches(id,user_id),
 CONSTRAINT csv_file_row_unique UNIQUE(user_id,source_key,file_hash,row_number)
);
CREATE UNIQUE INDEX csv_reference_unique ON public.wealth_csv_rows(user_id,source_key,reference_key) WHERE reference_key IS NOT NULL;
CREATE INDEX csv_batch_owner_idx ON public.wealth_csv_batches(user_id,id);
CREATE INDEX csv_rows_owner_idx ON public.wealth_csv_rows(user_id,batch_id);
ALTER TABLE public.money_entries ADD COLUMN import_batch_id uuid REFERENCES public.wealth_csv_batches(id),ADD COLUMN import_row_id uuid REFERENCES public.wealth_csv_rows(id),
 ADD CONSTRAINT csv_origin_pair CHECK((import_batch_id IS NULL)=(import_row_id IS NULL));
CREATE UNIQUE INDEX money_csv_row_unique ON public.money_entries(import_row_id) WHERE import_row_id IS NOT NULL;
ALTER TABLE public.wealth_csv_rows ADD CONSTRAINT csv_entry_fk FOREIGN KEY(entry_id) REFERENCES public.money_entries(id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE crystrack_csv.permits(entry_id uuid PRIMARY KEY,user_id uuid NOT NULL,batch_id uuid NOT NULL,row_id uuid NOT NULL);
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['wealth_csv_batches','wealth_csv_rows'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY csv_owner_select ON public.%I FOR SELECT TO authenticated USING(user_id=auth.uid())',t);
 END LOOP;
END $$;
ALTER TABLE crystrack_csv.permits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crystrack_csv.permits FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION crystrack_csv.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$SELECT clock_timestamp()$$;
CREATE FUNCTION crystrack_csv.lock_owner(u uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,39));
END $$;
CREATE FUNCTION crystrack_csv.hash(v jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT encode(sha256(convert_to(v::text,'UTF8')),'hex')$$;
CREATE FUNCTION crystrack_csv.guard_entry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid;permit uuid;
BEGIN
 u:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
 -- All existing ledger writes retain their behavior, but serialize with import review/confirmation.
 PERFORM crystrack_csv.lock_owner(u);
 IF TG_OP<>'INSERT' AND (OLD.import_batch_id IS NOT NULL OR OLD.import_row_id IS NOT NULL) THEN RAISE EXCEPTION 'Imported history is immutable' USING ERRCODE='42501';END IF;
 IF TG_OP<>'DELETE' AND (NEW.import_batch_id IS NOT NULL OR NEW.import_row_id IS NOT NULL) THEN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Immutable statement origin' USING ERRCODE='42501';END IF;
  DELETE FROM crystrack_csv.permits WHERE entry_id=NEW.id AND user_id=NEW.user_id AND batch_id=NEW.import_batch_id AND row_id=NEW.import_row_id RETURNING entry_id INTO permit;
  IF permit IS NULL OR NEW.type::text NOT IN('income','expense') OR NEW.flow_kind IS DISTINCT FROM NEW.type::text OR NEW.bill_id IS NOT NULL OR NEW.bill_occurrence_id IS NOT NULL OR NEW.debt_id IS NOT NULL OR NEW.expected_flow_id IS NOT NULL OR NEW.target_id IS NOT NULL THEN RAISE EXCEPTION 'Statement origin unavailable' USING ERRCODE='42501';END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER csv_payment_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.money_entries FOR EACH ROW EXECUTE FUNCTION crystrack_csv.guard_entry();
CREATE FUNCTION crystrack_csv.instant(v text,z text,n timestamptz) RETURNS timestamptz LANGUAGE plpgsql SET search_path='' AS $$
DECLARE t timestamptz;
BEGIN
 IF v~'^\d{4}-\d{2}-\d{2}$' THEN
  t:=v::date::timestamp AT TIME ZONE z;
  IF (t AT TIME ZONE z)::date<>v::date THEN RAISE EXCEPTION 'Local date does not exist' USING ERRCODE='22023'; END IF;
 ELSIF v~'^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?(Z|[+-](0\d|1[0-4]):[0-5]\d)$' THEN t:=v::timestamptz;
 ELSE RAISE EXCEPTION 'Explicit ISO date required' USING ERRCODE='22023';END IF;
 IF (t AT TIME ZONE z)::date<'1900-01-01'::date OR t>n THEN RAISE EXCEPTION 'Unsupported or future statement date' USING ERRCODE='22023';END IF;
 RETURN t;
END $$;
CREATE FUNCTION public.wealth_csv_context() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();z text;BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501';END IF;
 z:=crystrack_budgets.zone(u);RETURN jsonb_build_object('today',(crystrack_csv.clock() AT TIME ZONE z)::date,'timezone',z);
END $$;
CREATE FUNCTION crystrack_csv.review(u uuid,s text,f text,z text,rows jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE n timestamptz:=crystrack_csv.clock();actual_z text:=crystrack_budgets.zone(u);r jsonb;res jsonb:='[]';t timestamptz;a numeric;direction text;ref text;hard boolean;matches integer;bill boolean;income numeric:=0;expense numeric:=0;v_day date;
BEGIN
 PERFORM crystrack_csv.lock_owner(u);
 IF s IS NULL OR s!~'^[a-z0-9][a-z0-9_-]{0,59}$' OR f IS NULL OR f!~'^[a-f0-9]{64}$' OR z IS NULL OR z<>actual_z THEN RAISE EXCEPTION 'Statement context changed' USING ERRCODE='PT409';END IF;
 IF rows IS NULL OR jsonb_typeof(rows)<>'array' OR jsonb_array_length(rows) NOT BETWEEN 1 AND 500 OR octet_length(rows::text)>1048576 THEN RAISE EXCEPTION 'Bounded rows required' USING ERRCODE='22023';END IF;
 IF (SELECT count(DISTINCT value->>'row') FROM jsonb_array_elements(rows))<>jsonb_array_length(rows) THEN RAISE EXCEPTION 'Duplicate file row identity' USING ERRCODE='22023';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(rows) LOOP
  IF jsonb_typeof(r)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(r))<>10 OR NOT r?&ARRAY['row','date','description','amount','type','currency','category','reference','account','keepDuplicate']
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['date','description','amount','type','currency','category']) k WHERE jsonb_typeof(r->k) IS DISTINCT FROM 'string')
  OR jsonb_typeof(r->'row') IS DISTINCT FROM 'number' OR coalesce(r->>'row','')!~'^[1-9][0-9]{0,2}$' OR (r->>'row')::integer>500
  OR jsonb_typeof(r->'keepDuplicate') IS DISTINCT FROM 'boolean' OR r->>'currency'<>'NGN' OR r->>'type' NOT IN('income','expense')
  OR r->>'amount'!~'^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$' OR (r->>'amount')::numeric<=0 OR (r->>'amount')::numeric>=10000000000
  OR length(btrim(r->>'description')) NOT BETWEEN 1 AND 255 OR (r->>'description')~'[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'
  OR NOT (r->>'category')=ANY(crystrack_budgets.categories()) OR jsonb_typeof(r->'reference') NOT IN('string','null') OR jsonb_typeof(r->'account') NOT IN('string','null')
  OR (r->>'reference' IS NOT NULL AND (length(btrim(r->>'reference')) NOT BETWEEN 1 AND 120 OR r->>'reference'!~'^[A-Za-z0-9_.:/ -]+$'))
  OR length(coalesce(r->>'account',''))>100 OR (r->>'account')~'[\x01-\x1f\x7f]' THEN RAISE EXCEPTION 'Invalid normalized statement row' USING ERRCODE='22023';END IF;
  t:=crystrack_csv.instant(r->>'date',z,n);a:=(r->>'amount')::numeric;direction:=r->>'type';ref:=lower(btrim(r->>'reference'));v_day:=(t AT TIME ZONE z)::date;
  hard:=EXISTS(SELECT 1 FROM public.wealth_csv_rows c WHERE c.user_id=u AND c.source_key=s AND ((c.file_hash=f AND c.row_number=(r->>'row')::integer) OR (ref IS NOT NULL AND c.reference_key=ref)))
   OR (ref IS NOT NULL AND (SELECT count(*) FROM jsonb_array_elements(rows) x WHERE lower(btrim(x->>'reference'))=ref)>1);
  SELECT count(*),coalesce(bool_or(e.bill_id IS NOT NULL),false) INTO matches,bill FROM public.money_entries e
  WHERE e.user_id=u AND coalesce(e.flow_kind,e.type::text)=direction AND e.amount=a AND e.date>=v_day::timestamp AT TIME ZONE z AND e.date<(v_day+1)::timestamp AT TIME ZONE z AND lower(btrim(coalesce(e.source,'')))=lower(btrim(r->>'description'));
  -- Identical lines in this same file are warnings too, never silently collapsed.
  matches:=matches+(SELECT count(*) FROM jsonb_array_elements(rows) x WHERE x->>'row'<>r->>'row' AND x->>'type'=direction AND (x->>'amount')::numeric=a AND (crystrack_csv.instant(x->>'date',z,n) AT TIME ZONE z)::date=v_day AND lower(btrim(x->>'description'))=lower(btrim(r->>'description')));
  res:=res||jsonb_build_array(jsonb_build_object('row',(r->>'row')::integer,'date',t,'duplicate',hard,'possible',matches,'billMatch',bill,'referenceMissing',ref IS NULL));
  IF direction='income' THEN income:=income+a;ELSE expense:=expense+a;END IF;
 END LOOP;
 RETURN jsonb_build_object('token',crystrack_csv.hash(jsonb_build_object('source',s,'file',f,'zone',z,'today',(n AT TIME ZONE z)::date,'rows',rows,'proof',res)),'today',(n AT TIME ZONE z)::date,'timezone',z,'rows',res,'income',income::text,'expense',expense::text);
END $$;
CREATE FUNCTION public.wealth_csv_review(p_source text,p_file text,p_timezone text,p_rows jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT crystrack_csv.review(auth.uid(),p_source,p_file,p_timezone,p_rows)$$;
CREATE FUNCTION crystrack_csv.receipt(b public.wealth_csv_batches) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$SELECT jsonb_build_object('batchId',b.id,'count',b.row_count,'income',b.income_total::text,'expense',b.expense_total::text,'createdAt',b.created_at)$$;
CREATE FUNCTION public.wealth_csv_receipt(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.wealth_csv_batches;BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501';END IF;
 SELECT * INTO b FROM public.wealth_csv_batches WHERE id=p_id AND user_id=auth.uid();
 IF NOT FOUND THEN RETURN NULL;END IF;RETURN crystrack_csv.receipt(b);
END $$;
CREATE FUNCTION public.wealth_csv_import(p_id uuid,p_source text,p_file text,p_timezone text,p_rows jsonb,p_token text,p_confirmed boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();b public.wealth_csv_batches;h text;v jsonb;r jsonb;proof jsonb;e uuid;rid uuid;n timestamptz:=crystrack_csv.clock();t timestamptz;
BEGIN
 PERFORM crystrack_csv.lock_owner(u);
 IF p_id IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Explicit confirmation required' USING ERRCODE='22023';END IF;
 h:=crystrack_csv.hash(jsonb_build_object('source',p_source,'file',p_file,'zone',p_timezone,'rows',p_rows));
 SELECT * INTO b FROM public.wealth_csv_batches WHERE id=p_id;
 IF FOUND THEN IF b.user_id<>u OR b.payload_hash<>h THEN RAISE EXCEPTION 'Batch identity changed' USING ERRCODE='PT409';END IF;RETURN crystrack_csv.receipt(b);END IF;
 v:=crystrack_csv.review(u,p_source,p_file,p_timezone,p_rows);
 IF p_token IS NULL OR p_token<>v->>'token' THEN RAISE EXCEPTION 'Review changed; check rows again' USING ERRCODE='PT409';END IF;
 FOR proof IN SELECT value FROM jsonb_array_elements(v->'rows') LOOP
  SELECT value INTO r FROM jsonb_array_elements(p_rows) WHERE (value->>'row')::integer=(proof->>'row')::integer;
  IF (proof->>'duplicate')::boolean OR ((proof->>'possible')::integer>0 AND (r->>'keepDuplicate')::boolean IS DISTINCT FROM true) THEN RAISE EXCEPTION 'Review duplicate rows explicitly' USING ERRCODE='PT409';END IF;
 END LOOP;
 INSERT INTO public.wealth_csv_batches(id,user_id,source_key,file_hash,payload_hash,timezone,row_count,income_total,expense_total,created_at)
 VALUES(p_id,u,p_source,p_file,h,p_timezone,jsonb_array_length(p_rows),(v->>'income')::numeric,(v->>'expense')::numeric,n) RETURNING * INTO b;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  e:=gen_random_uuid();rid:=gen_random_uuid();t:=crystrack_csv.instant(r->>'date',p_timezone,n);
  INSERT INTO public.wealth_csv_rows VALUES(rid,u,b.id,p_source,p_file,(r->>'row')::integer,lower(btrim(r->>'reference')),e,r);
  INSERT INTO crystrack_csv.permits VALUES(e,u,b.id,rid);
  INSERT INTO public.money_entries(id,user_id,type,flow_kind,amount,date,source,category,note,import_batch_id,import_row_id)
  VALUES(e,u,(r->>'type')::public.money_type,r->>'type',(r->>'amount')::numeric,t,btrim(r->>'description'),r->>'category',CASE WHEN r->>'account' IS NULL THEN NULL ELSE 'Statement source: '||(r->>'account') END,b.id,rid);
 END LOOP;
 INSERT INTO public.activity_events(user_id,type,entity_type,entity_id,metadata_json) VALUES(u,'finance_entry','finance',b.id,jsonb_build_object('title','Imported reviewed statement entries','count',b.row_count,'origin','csv'));
 RETURN crystrack_csv.receipt(b);
END $$;
CREATE FUNCTION public.wealth_csv_export(p_from date,p_to date,p_notes boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();z text;n integer;result jsonb;
BEGIN
 PERFORM crystrack_csv.lock_owner(u);z:=crystrack_budgets.zone(u);
 IF p_from IS NULL OR p_to IS NULL OR p_notes IS NULL OR p_from<'1900-01-01' OR p_to<p_from OR p_to-p_from>365 THEN RAISE EXCEPTION 'Choose up to 366 calendar days' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM public.money_entries WHERE user_id=u AND date IS NULL) THEN RAISE EXCEPTION 'Undated history needs review' USING ERRCODE='P0001';END IF;
 SELECT count(*) INTO n FROM (SELECT id FROM public.money_entries WHERE user_id=u AND date>=p_from::timestamp AT TIME ZONE z AND date<(p_to+1)::timestamp AT TIME ZONE z LIMIT 10001) bounded;
 IF n>10000 THEN RAISE EXCEPTION 'Export exceeds 10000 entries; narrow dates' USING ERRCODE='P0001';END IF;
 IF EXISTS(SELECT 1 FROM public.money_entries WHERE user_id=u AND date>=p_from::timestamp AT TIME ZONE z AND date<(p_to+1)::timestamp AT TIME ZONE z AND (amount<=0 OR amount IS NULL OR (p_notes AND octet_length(note)>4096))) THEN RAISE EXCEPTION 'Export values exceed supported scope' USING ERRCODE='P0001';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'date',date,'type',coalesce(flow_kind,type::text),'amount',amount::text,'category',coalesce(category,''),'source',coalesce(source,''),'origin',CASE WHEN bill_id IS NOT NULL THEN 'bill' WHEN import_batch_id IS NOT NULL THEN 'csv' WHEN expected_flow_id IS NOT NULL THEN 'expected' WHEN debt_id IS NOT NULL THEN 'debt' ELSE 'manual' END)||CASE WHEN p_notes THEN jsonb_build_object('note',coalesce(note,'')) ELSE '{}' END ORDER BY date,id),'[]') INTO result
 FROM public.money_entries WHERE user_id=u AND date>=p_from::timestamp AT TIME ZONE z AND date<(p_to+1)::timestamp AT TIME ZONE z;
 IF octet_length(result::text)>8388608 THEN RAISE EXCEPTION 'Export payload too large; narrow dates' USING ERRCODE='P0001';END IF;
 RETURN result;
END $$;

-- Identical approved 0015 body, adding ONLY protected CSV origin exclusions.
CREATE OR REPLACE FUNCTION crystrack_sep28_crystals.ordinary_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
   AND rowdata->>'expected_flow_id' IS NULL AND rowdata->>'parent_entry_id' IS NULL AND rowdata->>'bill_id' IS NULL
   AND rowdata->>'import_batch_id' IS NULL AND rowdata->>'import_row_id' IS NULL;
  valid:=rowdata->>'type'='expense' AND coalesce(rowdata->>'flow_kind',rowdata->>'type')='expense'
   AND (rowdata->>'amount')::numeric>0 AND rowdata->>'deleted_at' IS NULL
   AND rowdata->>'debt_id' IS NULL AND rowdata->>'expected_flow_id' IS NULL
   AND rowdata->>'parent_entry_id' IS NULL AND rowdata->>'bill_id' IS NULL
   AND rowdata->>'import_batch_id' IS NULL AND rowdata->>'import_row_id' IS NULL;
 END IF;
 PERFORM crystrack_sep28_crystals.reconcile(u,k,s,coalesce(valid,false),
  TG_OP='INSERT' OR (k='assignment' AND TG_OP='UPDATE' AND (to_jsonb(OLD)->>'status') IS DISTINCT FROM (rowdata->>'status')),
  coalesce(auth.uid()=u AND auth.role()='authenticated',false),CASE WHEN k='spending' THEN coalesce(manual,false) ELSE true END);
 RETURN NEW;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crystrack_csv FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.wealth_csv_context(),public.wealth_csv_review(text,text,text,jsonb),public.wealth_csv_receipt(uuid),public.wealth_csv_import(uuid,text,text,text,jsonb,text,boolean),public.wealth_csv_export(date,date,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.wealth_csv_context(),public.wealth_csv_review(text,text,text,jsonb),public.wealth_csv_receipt(uuid),public.wealth_csv_import(uuid,text,text,text,jsonb,text,boolean),public.wealth_csv_export(date,date,boolean) TO authenticated;
COMMIT;
