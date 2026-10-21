-- Issue #30 LOCAL-ONLY candidate. Hosted numbering/compatibility UNKNOWN. Gate #18.
BEGIN;
CREATE SCHEMA crystrack_bills;
REVOKE ALL ON SCHEMA crystrack_bills FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.wealth_recurring_bills(
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 120),
 category text NOT NULL CHECK(category=ANY(ARRAY['Food','Transport','Housing','Utilities','Health','Family','Education','Business','Shopping','Entertainment','Giving','Debt','Subscriptions','Savings','Other'])),
 merchant text CHECK(merchant IS NULL OR length(merchant)<=100),amount numeric(12,2) NOT NULL CHECK(amount>0 AND amount<10000000000),
 frequency text NOT NULL CHECK(frequency IN('weekly','monthly','quarterly','yearly')),first_due date NOT NULL,end_date date CHECK(end_date>=first_due),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','canceled')),reminder_enabled boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,CONSTRAINT bill_owner_identity UNIQUE(id,user_id)
);
CREATE INDEX bill_owner_idx ON public.wealth_recurring_bills(user_id,id);
CREATE TABLE public.wealth_bill_occurrences(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),bill_id uuid NOT NULL,
 due_day date NOT NULL,timezone text NOT NULL,title text NOT NULL,category text NOT NULL,merchant text,
 expected_amount numeric(12,2) NOT NULL CHECK(expected_amount>0),status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','canceled','paid')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),paid_at timestamptz,actual_amount numeric(12,2),entry_id uuid UNIQUE,
 CONSTRAINT bill_due_unique UNIQUE(bill_id,due_day),FOREIGN KEY(bill_id,user_id) REFERENCES public.wealth_recurring_bills(id,user_id),
 CHECK((status='paid')=(paid_at IS NOT NULL)),CHECK((status='paid')=(entry_id IS NOT NULL)),CHECK((status='paid')=(actual_amount IS NOT NULL)),CHECK(actual_amount>0)
);
CREATE INDEX bill_occurrence_owner_day_idx ON public.wealth_bill_occurrences(user_id,due_day,id);
-- Keep legacy money_entries.bill_id (FK to public.wealth_bills) intact.
-- Sep28 bill payments use their own provenance FK.
ALTER TABLE public.money_entries ADD COLUMN sep28_bill_id uuid REFERENCES public.wealth_recurring_bills(id),ADD COLUMN bill_occurrence_id uuid REFERENCES public.wealth_bill_occurrences(id),
 ADD CONSTRAINT bill_origin_pair CHECK((sep28_bill_id IS NULL)=(bill_occurrence_id IS NULL));
CREATE UNIQUE INDEX money_bill_occurrence_unique ON public.money_entries(bill_occurrence_id) WHERE bill_occurrence_id IS NOT NULL;
ALTER TABLE public.wealth_bill_occurrences ADD CONSTRAINT bill_payment_entry_fk FOREIGN KEY(entry_id) REFERENCES public.money_entries(id);
CREATE TABLE crystrack_bills.states(user_id uuid PRIMARY KEY REFERENCES auth.users(id),revision bigint NOT NULL DEFAULT 1);
CREATE TABLE crystrack_bills.requests(user_id uuid NOT NULL REFERENCES auth.users(id),request_id uuid NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(user_id,request_id));
-- One-transaction, single-use insertion authority. Never use client-writable GUCs.
CREATE TABLE crystrack_bills.entry_permits(entry_id uuid PRIMARY KEY,user_id uuid NOT NULL,bill_id uuid NOT NULL,occurrence_id uuid UNIQUE NOT NULL);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['wealth_recurring_bills','wealth_bill_occurrences'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY bill_owner_select ON public.%I FOR SELECT TO authenticated USING(user_id=auth.uid())',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['states','requests','entry_permits'] LOOP
  EXECUTE format('ALTER TABLE crystrack_bills.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON crystrack_bills.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END $$;
CREATE FUNCTION crystrack_bills.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT clock_timestamp() $$;
CREATE FUNCTION crystrack_bills.lock_owner(u uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,38));
 INSERT INTO crystrack_bills.states(user_id) VALUES(u) ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION crystrack_bills.due(a date,f text,i integer) RETURNS date LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN f='weekly' THEN a+i*7 ELSE (
 date_trunc('month',a)::date+make_interval(months=>i*CASE f WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 ELSE 12 END))::date
 +least(extract(day FROM a)::integer,extract(day FROM(date_trunc('month',a)+make_interval(months=>i*CASE f WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 ELSE 12 END)+interval '1 month - 1 day'))::integer)-1 END
$$;
CREATE FUNCTION crystrack_bills.is_due(a date,f text,d date) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT d>=a AND crystrack_bills.due(a,f,CASE WHEN f='weekly' THEN (d-a)/7 ELSE
 ((extract(year FROM d)::integer-extract(year FROM a)::integer)*12+extract(month FROM d)::integer-extract(month FROM a)::integer)/CASE f WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 ELSE 12 END END)=d
$$;
CREATE FUNCTION crystrack_bills.materialize(u uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE z text:=crystrack_budgets.zone(u);d date:=(crystrack_bills.clock() AT TIME ZONE z)::date; changed integer; n integer;
BEGIN
 PERFORM crystrack_bills.lock_owner(u);
 IF EXISTS(SELECT 1 FROM public.wealth_recurring_bills b WHERE user_id=u AND status='active' AND crystrack_bills.due(first_due,frequency,4096)<=least(coalesce(end_date,d+30),d+30)) THEN
  RAISE EXCEPTION 'Plan recovery is not confirmed' USING ERRCODE='P0001'; END IF;
 -- Explicit edits affect only future unpaid plans; due/overdue/paid facts stay frozen.
 UPDATE public.wealth_bill_occurrences o SET status='canceled',revision=o.revision+1 FROM public.wealth_recurring_bills b
 WHERE b.id=o.bill_id AND b.user_id=u AND o.status='pending' AND (b.status='canceled' OR (o.due_day>d AND (NOT crystrack_bills.is_due(b.first_due,b.frequency,o.due_day) OR o.due_day>coalesce(b.end_date,o.due_day))));
 GET DIAGNOSTICS changed=ROW_COUNT;
 INSERT INTO public.wealth_bill_occurrences(user_id,bill_id,due_day,timezone,title,category,merchant,expected_amount)
 SELECT u,b.id,dates.due_date,z,b.title,b.category,b.merchant,b.amount FROM public.wealth_recurring_bills b
 CROSS JOIN LATERAL (SELECT crystrack_bills.due(b.first_due,b.frequency,i) AS due_date FROM generate_series(0,
  least(4095,greatest(0,CASE WHEN b.frequency='weekly' THEN (d+30-b.first_due)/7 ELSE
  ((extract(year FROM(d+30))::integer-extract(year FROM b.first_due)::integer)*12+extract(month FROM(d+30))::integer-extract(month FROM b.first_due)::integer)/CASE b.frequency WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 ELSE 12 END END))) i) dates
 WHERE b.user_id=u AND b.status='active' AND dates.due_date<=d+30 AND dates.due_date<=coalesce(b.end_date,dates.due_date)
 ON CONFLICT(bill_id,due_day) DO UPDATE SET timezone=EXCLUDED.timezone,title=EXCLUDED.title,category=EXCLUDED.category,merchant=EXCLUDED.merchant,expected_amount=EXCLUDED.expected_amount,status='pending',revision=wealth_bill_occurrences.revision+1
 WHERE wealth_bill_occurrences.status<>'paid' AND wealth_bill_occurrences.due_day>d AND
 (wealth_bill_occurrences.timezone,wealth_bill_occurrences.title,wealth_bill_occurrences.category,wealth_bill_occurrences.merchant,wealth_bill_occurrences.expected_amount,wealth_bill_occurrences.status)
 IS DISTINCT FROM (EXCLUDED.timezone,EXCLUDED.title,EXCLUDED.category,EXCLUDED.merchant,EXCLUDED.expected_amount,'pending');
 GET DIAGNOSTICS n=ROW_COUNT;changed:=changed+n;
 DELETE FROM public.reminders r USING public.wealth_bill_occurrences o,public.wealth_recurring_bills b WHERE r.entity_type='bill' AND r.entity_id=o.id AND o.bill_id=b.id AND b.user_id=u AND (b.status<>'active' OR NOT b.reminder_enabled OR o.status<>'pending');
 INSERT INTO public.reminders(user_id,entity_type,entity_id,title,kind,scheduled_for,channels,delivery_key,metadata_json)
 SELECT u,'bill',o.id,o.title,'bill_due',(o.due_day+time '09:00') AT TIME ZONE z,ARRAY['push'],'bill:'||o.id,jsonb_build_object('billId',b.id,'revision',o.revision,'timezone',z)
 FROM public.wealth_bill_occurrences o JOIN public.wealth_recurring_bills b ON b.id=o.bill_id WHERE b.user_id=u AND b.status='active' AND b.reminder_enabled AND o.status='pending'
 ON CONFLICT(delivery_key) WHERE delivery_key IS NOT NULL DO UPDATE SET title=EXCLUDED.title,scheduled_for=EXCLUDED.scheduled_for,metadata_json=EXCLUDED.metadata_json;
 IF changed>0 THEN UPDATE crystrack_bills.states SET revision=revision+1 WHERE user_id=u; END IF;
END $$;
CREATE FUNCTION crystrack_bills.guard_entry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE permit uuid;
BEGIN
 IF TG_OP<>'INSERT' AND (OLD.sep28_bill_id IS NOT NULL OR OLD.bill_occurrence_id IS NOT NULL) THEN RAISE EXCEPTION 'Bill payment history is immutable' USING ERRCODE='42501';END IF;
 IF TG_OP<>'DELETE' AND (NEW.sep28_bill_id IS NOT NULL OR NEW.bill_occurrence_id IS NOT NULL) THEN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Immutable bill origin' USING ERRCODE='42501'; END IF;
  DELETE FROM crystrack_bills.entry_permits WHERE entry_id=NEW.id AND user_id=NEW.user_id AND bill_id=NEW.sep28_bill_id AND occurrence_id=NEW.bill_occurrence_id RETURNING entry_id INTO permit;
  IF permit IS NULL OR NEW.type<>'expense' OR NEW.flow_kind<>'expense' OR NEW.debt_id IS NOT NULL OR NEW.expected_flow_id IS NOT NULL THEN RAISE EXCEPTION 'Bill origin unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER bill_payment_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.money_entries FOR EACH ROW EXECUTE FUNCTION crystrack_bills.guard_entry();
CREATE FUNCTION public.wealth_bill_mutate(p_action text,p_id uuid,p_revision integer,p_request uuid,p_timezone text,p_fields jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();b public.wealth_recurring_bills;o public.wealth_bill_occurrences;receipt crystrack_bills.requests;payload jsonb;result jsonb;z text;d date;n timestamptz:=crystrack_bills.clock();v_amount numeric;e uuid;f date;ending date;
BEGIN
 PERFORM crystrack_bills.lock_owner(u);
 IF p_action IS NULL OR p_action NOT IN('create','edit','pause','resume','cancel','pay') OR p_id IS NULL OR p_revision IS NULL OR p_request IS NULL OR p_timezone IS NULL OR p_fields IS NULL OR jsonb_typeof(p_fields)<>'object' THEN RAISE EXCEPTION 'Invalid bill action' USING ERRCODE='22023'; END IF;
 payload:=jsonb_build_object('action',p_action,'id',p_id,'revision',p_revision,'timezone',p_timezone,'fields',p_fields);
 SELECT * INTO receipt FROM crystrack_bills.requests WHERE user_id=u AND request_id=p_request;
 IF FOUND THEN IF receipt.payload<>payload THEN RAISE EXCEPTION 'Request changed' USING ERRCODE='PT409';END IF;RETURN receipt.result;END IF;
 z:=crystrack_budgets.zone(u);d:=(n AT TIME ZONE z)::date;
 IF p_timezone<>z THEN RAISE EXCEPTION 'Saved zone changed' USING ERRCODE='PT409';END IF;
 SELECT * INTO b FROM public.wealth_recurring_bills WHERE id=p_id AND user_id=u FOR UPDATE;
 IF p_revision<>coalesce(b.revision,0) OR (p_action='create')<>(b.id IS NULL) OR (b.id IS NOT NULL AND b.status='canceled') THEN RAISE EXCEPTION 'Bill changed' USING ERRCODE='PT409';END IF;
 IF p_action IN('create','edit') THEN
  IF EXISTS(SELECT 1 FROM unnest(ARRAY['title','category','amount','frequency','firstDue']) key WHERE jsonb_typeof(p_fields->key) IS DISTINCT FROM 'string') OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_fields) k WHERE k NOT IN('title','category','merchant','amount','frequency','firstDue','endDate','reminderEnabled'))
   OR (p_fields ? 'merchant' AND jsonb_typeof(p_fields->'merchant') NOT IN('string','null')) OR (p_fields ? 'endDate' AND jsonb_typeof(p_fields->'endDate') NOT IN('string','null'))
   OR coalesce(p_fields->>'title','')!~'\S' OR length(p_fields->>'title')>120 OR NOT coalesce(p_fields->>'category','')=ANY(crystrack_budgets.categories())
   OR coalesce(p_fields->>'amount','')!~'^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$' OR coalesce(p_fields->>'frequency','') NOT IN('weekly','monthly','quarterly','yearly')
   OR coalesce(p_fields->>'firstDue','')!~'^\d{4}-\d{2}-\d{2}$' OR length(coalesce(p_fields->>'merchant',''))>100 OR jsonb_typeof(p_fields->'reminderEnabled') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid bill fields' USING ERRCODE='22023';END IF;
  v_amount:=(p_fields->>'amount')::numeric;f:=(p_fields->>'firstDue')::date;ending:=(p_fields->>'endDate')::date;
  IF v_amount<=0 OR f>d+366 OR (p_action='create' AND f<d-366) OR ending<f OR ending>f+interval '100 years' THEN RAISE EXCEPTION 'Invalid bill range' USING ERRCODE='22023';END IF;
  IF p_action='edit' AND (b.first_due<>f OR b.frequency<>p_fields->>'frequency') AND f<=d THEN RAISE EXCEPTION 'Revised schedule must start tomorrow or later' USING ERRCODE='22023';END IF;
  IF p_action='create' THEN
   INSERT INTO public.wealth_recurring_bills(id,user_id,title,category,merchant,amount,frequency,first_due,end_date,reminder_enabled,created_at,updated_at)
   VALUES(p_id,u,btrim(p_fields->>'title'),p_fields->>'category',nullif(btrim(p_fields->>'merchant'),''),v_amount,p_fields->>'frequency',f,ending,(p_fields->>'reminderEnabled')::boolean,n,n) RETURNING * INTO b;
  ELSE
   UPDATE public.wealth_recurring_bills SET title=btrim(p_fields->>'title'),category=p_fields->>'category',merchant=nullif(btrim(p_fields->>'merchant'),''),amount=v_amount,frequency=p_fields->>'frequency',first_due=f,end_date=ending,reminder_enabled=(p_fields->>'reminderEnabled')::boolean,revision=revision+1,updated_at=n WHERE id=b.id RETURNING * INTO b;
  END IF;
 ELSIF p_action='pay' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_fields))<>3 OR NOT p_fields ?& ARRAY['occurrenceId','occurrenceRevision','actualAmount'] OR jsonb_typeof(p_fields->'occurrenceId') IS DISTINCT FROM 'string' OR jsonb_typeof(p_fields->'actualAmount') IS DISTINCT FROM 'string' OR jsonb_typeof(p_fields->'occurrenceRevision') IS DISTINCT FROM 'number' OR coalesce(p_fields->>'occurrenceRevision','')!~'^[1-9][0-9]{0,8}$' OR coalesce(p_fields->>'actualAmount','')!~'^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'Invalid payment fields' USING ERRCODE='22023';END IF;
  SELECT * INTO o FROM public.wealth_bill_occurrences WHERE id=(p_fields->>'occurrenceId')::uuid AND bill_id=b.id AND user_id=u FOR UPDATE;
  IF b.status<>'active' OR o.id IS NULL OR o.status<>'pending' OR o.revision<>(p_fields->>'occurrenceRevision')::integer THEN RAISE EXCEPTION 'Payment is not confirmed; refresh' USING ERRCODE='PT409';END IF;
  v_amount:=(p_fields->>'actualAmount')::numeric;IF v_amount<=0 THEN RAISE EXCEPTION 'Invalid actual amount' USING ERRCODE='22023';END IF;
  e:=gen_random_uuid();
  INSERT INTO crystrack_bills.entry_permits VALUES(e,u,b.id,o.id);
  INSERT INTO public.money_entries(id,user_id,type,flow_kind,amount,date,source,category,note,sep28_bill_id,bill_occurrence_id)
   VALUES(e,u,'expense','expense',v_amount,n,o.title,o.category,'Explicit bill payment; due '||o.due_day,b.id,o.id);
  UPDATE public.wealth_bill_occurrences SET status='paid',paid_at=n,actual_amount=v_amount,entry_id=e,revision=revision+1 WHERE id=o.id;
  INSERT INTO public.activity_events(user_id,type,entity_type,entity_id,metadata_json) VALUES(u,'finance_entry','finance',e,jsonb_build_object('title',o.title,'amount',-v_amount,'type','expense','origin','bill','billId',b.id,'occurrenceId',o.id));
  UPDATE public.wealth_recurring_bills SET revision=revision+1,updated_at=n WHERE id=b.id RETURNING * INTO b;
 ELSE
  IF p_fields<>'{}' THEN RAISE EXCEPTION 'Unexpected fields' USING ERRCODE='22023';END IF;
  IF (p_action='pause' AND b.status<>'active') OR (p_action='resume' AND b.status<>'paused') THEN RAISE EXCEPTION 'Bill state changed' USING ERRCODE='PT409';END IF;
  UPDATE public.wealth_recurring_bills SET status=CASE p_action WHEN 'pause' THEN 'paused' WHEN 'resume' THEN 'active' ELSE 'canceled' END,revision=revision+1,updated_at=n WHERE id=b.id RETURNING * INTO b;
 END IF;
 PERFORM crystrack_bills.materialize(u);
 UPDATE crystrack_bills.states SET revision=revision+1 WHERE user_id=u;
 result:=jsonb_build_object('id',b.id,'revision',b.revision,'entryId',e);
 INSERT INTO crystrack_bills.requests VALUES(u,p_request,payload,result);
 RETURN result;
END $$;
CREATE FUNCTION crystrack_bills.occ_json(o public.wealth_bill_occurrences,z text,d date) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',o.id,'billId',o.bill_id,'dueDay',o.due_day,'timezone',o.timezone,'title',o.title,'category',o.category,'expected',o.expected_amount::text,'actual',o.actual_amount::text,'revision',o.revision,'paidAt',o.paid_at,'entryId',o.entry_id,
 'status',CASE WHEN o.status='paid' THEN CASE WHEN EXISTS(SELECT 1 FROM public.money_entries e WHERE e.id=o.entry_id AND e.user_id=o.user_id AND e.sep28_bill_id=o.bill_id AND e.bill_occurrence_id=o.id AND e.amount=o.actual_amount AND e.date=o.paid_at AND e.type='expense' AND e.flow_kind='expense') THEN 'paid' ELSE 'not_confirmed' END
 WHEN o.status='canceled' THEN 'canceled' WHEN o.due_day<d THEN 'overdue' WHEN o.due_day<=d+6 THEN 'due_soon' ELSE 'planned' END)
$$;
CREATE FUNCTION public.wealth_bill_list(p_id uuid DEFAULT NULL,p_page integer DEFAULT 0,p_revision text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();z text;d date;token text;items jsonb;occ jsonb;counts jsonb;more boolean;nexto public.wealth_bill_occurrences;
BEGIN
 PERFORM crystrack_bills.lock_owner(u);PERFORM crystrack_bills.materialize(u);z:=crystrack_budgets.zone(u);d:=(crystrack_bills.clock() AT TIME ZONE z)::date;
 IF p_page IS NULL OR p_page NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023';END IF;
 SELECT md5(revision::text||':'||z||':'||d) INTO token FROM crystrack_bills.states WHERE user_id=u;
 IF p_page>0 AND p_revision IS NULL OR (p_revision IS NOT NULL AND p_revision<>token) THEN RAISE EXCEPTION 'Bill plans changed' USING ERRCODE='PT409';END IF;
 IF p_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.wealth_recurring_bills WHERE id=p_id AND user_id=u) THEN RAISE EXCEPTION 'Not available' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'title',b.title,'category',b.category,'merchant',b.merchant,'amount',b.amount::text,'frequency',b.frequency,'firstDue',b.first_due,'endDate',b.end_date,'status',b.status,'reminderEnabled',b.reminder_enabled,'revision',b.revision,
 'next', (SELECT crystrack_bills.occ_json(o,z,d) FROM public.wealth_bill_occurrences o WHERE o.bill_id=b.id AND o.status='pending' ORDER BY due_day,id LIMIT 1),
 'paidCount',(SELECT count(*) FROM public.wealth_bill_occurrences p JOIN public.money_entries e ON e.id=p.entry_id AND e.user_id=p.user_id AND e.sep28_bill_id=p.bill_id AND e.bill_occurrence_id=p.id AND e.amount=p.actual_amount AND e.date=p.paid_at AND e.flow_kind='expense' AND e.type='expense' WHERE p.bill_id=b.id AND p.status='paid')) ORDER BY b.id),'[]') INTO items
 FROM (SELECT * FROM public.wealth_recurring_bills WHERE user_id=u AND (p_id IS NULL OR id=p_id) ORDER BY id LIMIT 20 OFFSET CASE WHEN p_id IS NULL THEN p_page*20 ELSE 0 END) b;
 SELECT CASE WHEN p_id IS NULL THEN (SELECT count(*)>p_page*20+20 FROM public.wealth_recurring_bills WHERE user_id=u) ELSE (SELECT count(*)>p_page*20+20 FROM public.wealth_bill_occurrences WHERE bill_id=p_id AND user_id=u) END INTO more;
 SELECT coalesce(jsonb_agg(crystrack_bills.occ_json(o,z,d) ORDER BY due_day,id),'[]') INTO occ FROM (SELECT * FROM public.wealth_bill_occurrences WHERE user_id=u AND bill_id=p_id ORDER BY due_day,id LIMIT 20 OFFSET p_page*20) o;
 SELECT jsonb_build_object('seven',(coalesce(sum(o.expected_amount) FILTER(WHERE due_day BETWEEN d AND d+6),0.00))::text,'thirty',(coalesce(sum(o.expected_amount) FILTER(WHERE due_day BETWEEN d AND d+29),0.00))::text,'overdue',count(*) FILTER(WHERE due_day<d)) INTO counts
 FROM public.wealth_bill_occurrences o JOIN public.wealth_recurring_bills b ON b.id=o.bill_id WHERE o.user_id=u AND o.status='pending' AND b.status='active';
 RETURN jsonb_build_object('today',d,'timezone',z,'revision',token,'page',p_page,'hasMore',more,'items',items,'occurrences',occ,'plans',counts);
END $$;
-- Existing dispatcher only; no new cron. At-most-one external attempt per occurrence.
CREATE FUNCTION public.bill_reminder_candidates(p_user uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE z text;n timestamptz:=crystrack_bills.clock();result jsonb;
BEGIN
 PERFORM crystrack_bills.materialize(p_user);z:=crystrack_budgets.zone(p_user);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'revision',o.revision)),'[]') INTO result FROM public.wealth_bill_occurrences o JOIN public.wealth_recurring_bills b ON b.id=o.bill_id
 WHERE o.user_id=p_user AND o.status='pending' AND b.status='active' AND b.reminder_enabled AND n>=(o.due_day+time '09:00') AT TIME ZONE z AND n<(o.due_day+1+time '09:00') AT TIME ZONE z;
 RETURN result;
END $$;
CREATE FUNCTION public.bill_claim_reminder(p_id uuid,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.wealth_bill_occurrences;b public.wealth_recurring_bills;p public.user_preferences;z text;n timestamptz:=crystrack_bills.clock();minute integer;s integer:=1320;e integer:=420;channels text[];delivery uuid;payload jsonb;
BEGIN
 SELECT * INTO o FROM public.wealth_bill_occurrences WHERE id=p_id;IF o.id IS NULL THEN RETURN NULL;END IF;
 PERFORM crystrack_bills.lock_owner(o.user_id);SELECT * INTO o FROM public.wealth_bill_occurrences WHERE id=p_id FOR UPDATE;
 SELECT * INTO b FROM public.wealth_recurring_bills WHERE id=o.bill_id;z:=crystrack_budgets.zone(o.user_id);
 IF o.status<>'pending' OR o.revision<>p_revision OR b.status<>'active' OR NOT b.reminder_enabled OR n<(o.due_day+time '09:00') AT TIME ZONE z OR n>=(o.due_day+1+time '09:00') AT TIME ZONE z THEN RETURN NULL; END IF;
 SELECT * INTO p FROM public.user_preferences WHERE user_id=o.user_id;
 minute:=extract(hour FROM n AT TIME ZONE z)::integer*60+extract(minute FROM n AT TIME ZONE z)::integer;
 IF p.dnd_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN s:=split_part(p.dnd_start_time,':',1)::integer*60+split_part(p.dnd_start_time,':',2)::integer; END IF;
 IF p.dnd_end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN e:=split_part(p.dnd_end_time,':',1)::integer*60+split_part(p.dnd_end_time,':',2)::integer; END IF;
 IF coalesce(p.dnd_enabled,false) AND (s=e OR (s<e AND minute>=s AND minute<e) OR (s>e AND (minute>=s OR minute<e))) THEN RETURN NULL; END IF;
 channels:=ARRAY(SELECT DISTINCT c FROM unnest(coalesce(p.default_reminder_channels,ARRAY['push'])) c WHERE c IN('push','telegram'));
 IF cardinality(channels)=0 THEN RETURN NULL; END IF;
 payload:=jsonb_build_object('title',o.title,'body','A planned bill is due. Payment is not confirmed.','url','/finance','tag','bill:'||o.id);
 INSERT INTO public.reminder_deliveries(user_id,entity_type,entity_id,delivery_key,scheduled_for,channels,payload)
 VALUES(o.user_id,'bill',o.id,'bill:'||o.id,n,channels,payload) ON CONFLICT(delivery_key) DO NOTHING RETURNING id INTO delivery;
 IF delivery IS NULL THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('id',delivery,'userId',o.user_id,'payload',payload,'deliveryKey','bill:'||o.id,'priorSent','[]'::jsonb,'channelsToAttempt',to_jsonb(channels));
END $$;
CREATE FUNCTION public.bill_finish_delivery(p_delivery uuid,p_sent text[],p_failed text[],p_error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.reminder_deliveries;o public.wealth_bill_occurrences;b public.wealth_recurring_bills;
BEGIN
 SELECT * INTO r FROM public.reminder_deliveries WHERE id=p_delivery AND entity_type='bill';IF r.id IS NULL THEN RETURN;END IF;
 PERFORM crystrack_bills.lock_owner(r.user_id);SELECT * INTO r FROM public.reminder_deliveries WHERE id=p_delivery FOR UPDATE;
 IF r.status<>'processing' THEN RETURN; END IF;
 UPDATE public.reminder_deliveries SET sent_channels=p_sent,failed_channels=p_failed,status=CASE WHEN cardinality(p_failed)=0 THEN 'sent' WHEN cardinality(p_sent)>0 THEN 'partial' ELSE 'failed' END,last_error=p_error WHERE id=r.id;
 SELECT * INTO o FROM public.wealth_bill_occurrences WHERE id=r.entity_id;SELECT * INTO b FROM public.wealth_recurring_bills WHERE id=o.bill_id;
 IF o.status='pending' AND b.status='active' AND b.reminder_enabled AND cardinality(p_sent)>0 THEN
  INSERT INTO public.activity_events(user_id,type,entity_type,entity_id,metadata_json) VALUES(r.user_id,'reminder_sent','bill',o.id,jsonb_build_object('title',o.title,'delivery_key',r.delivery_key,'channels',p_sent));
 END IF;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crystrack_bills FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.wealth_bill_mutate(text,uuid,integer,uuid,text,jsonb),public.wealth_bill_list(uuid,integer,text),public.bill_reminder_candidates(uuid),public.bill_claim_reminder(uuid,integer),public.bill_finish_delivery(uuid,text[],text[],text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.wealth_bill_mutate(text,uuid,integer,uuid,text,jsonb),public.wealth_bill_list(uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bill_reminder_candidates(uuid),public.bill_claim_reminder(uuid,integer),public.bill_finish_delivery(uuid,text[],text[],text) TO service_role;
COMMIT;
