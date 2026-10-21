-- LOCAL PROTOTYPE ONLY. Manual driver supplies a verified loopback Docker target.
-- Never include this directory in application migrations or bootstrap.
CREATE SCHEMA crystrack_release_gate;
REVOKE ALL ON SCHEMA crystrack_release_gate FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE crystrack_release_gate.state (singleton boolean PRIMARY KEY CHECK(singleton), active boolean NOT NULL);
INSERT INTO crystrack_release_gate.state VALUES(true,false);
REVOKE ALL ON ALL TABLES IN SCHEMA crystrack_release_gate FROM PUBLIC,anon,authenticated,service_role;

-- No role, JWT, user, GUC or privileged-connection bypass. Even the operator's
-- own task DML is rejected. No RETURN NULL / silently discarded events.
CREATE FUNCTION crystrack_release_gate.deny() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Task writes are temporarily paused. Please try again later.' USING ERRCODE='PT503'; END $$;
CREATE FUNCTION crystrack_release_gate.deny_task_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- Any authoritative task classification wins over a conflicting finance label.
 -- Check OLD as well as NEW so UPDATE cannot launder a task event or award.
 IF (TG_OP<>'INSERT' AND (
  to_jsonb(OLD)->>'entity_type'='task' OR to_jsonb(OLD)->>'kind'='task'
  OR (TG_TABLE_NAME='activity_events' AND to_jsonb(OLD)->>'type' IN ('task_completed','task_missed','task_skipped'))
  OR (TG_TABLE_NAME='gamification_events' AND left(to_jsonb(OLD)->>'action_key',5)='task:')))
 OR (TG_OP<>'DELETE' AND (
  to_jsonb(NEW)->>'entity_type'='task' OR to_jsonb(NEW)->>'kind'='task'
  OR (TG_TABLE_NAME='activity_events' AND to_jsonb(NEW)->>'type' IN ('task_completed','task_missed','task_skipped'))
  OR (TG_TABLE_NAME='gamification_events' AND left(to_jsonb(NEW)->>'action_key',5)='task:'))) THEN
  RAISE EXCEPTION 'Task events are temporarily paused. Please try again later.' USING ERRCODE='PT503';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE FUNCTION crystrack_release_gate.attach() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t text; row_guard boolean;
BEGIN
 FOREACH t IN ARRAY ARRAY['recurring_tasks','task_schedules','task_occurrences',
 'daily_tracking_states','daily_timezone_transitions','routine_schedule_versions','daily_records',
 'daily_routine_records','daily_mutation_requests','daily_notes','task_timeboxes','task_focus_sessions','daily_rituals','reminder_deliveries',
 'activity_events','reminders','gamification_events'] LOOP
  IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
  row_guard:=t IN ('activity_events','reminders','gamification_events');
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.'||t) AND tgname='crys_release_freeze') THEN
   EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',t);
   IF row_guard THEN
    EXECUTE format('CREATE TRIGGER crys_release_freeze BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION crystrack_release_gate.deny_task_event()',t);
    EXECUTE format('CREATE TRIGGER crys_release_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION crystrack_release_gate.deny()',t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ALWAYS TRIGGER crys_release_truncate',t);
   ELSE
    EXECUTE format('CREATE TRIGGER crys_release_freeze BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION crystrack_release_gate.deny()',t);
   END IF;
   EXECUTE format('ALTER TABLE public.%I ENABLE ALWAYS TRIGGER crys_release_freeze',t);
  END IF;
 END LOOP;
END $$;
-- An explicitly installed event hook guards new daily tables in the SAME
-- CREATE TABLE transaction, before 0013/0014 or traffic can write them.
CREATE FUNCTION crystrack_release_gate.new_table() RETURNS event_trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM crystrack_release_gate.attach(); END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crystrack_release_gate FROM PUBLIC,anon,authenticated,service_role;
