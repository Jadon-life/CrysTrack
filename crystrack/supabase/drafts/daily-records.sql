-- LOCAL CONTRACT EXPERIMENT ONLY, not an application/Supabase migration.
-- No remote migration number reserved. No changes to public tables or existing policies.
CREATE SCHEMA IF NOT EXISTS crystrack_daily_draft;
REVOKE ALL ON SCHEMA crystrack_daily_draft FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA crystrack_daily_draft TO authenticated;

CREATE TABLE IF NOT EXISTS crystrack_daily_draft.days (
 user_id uuid NOT NULL REFERENCES auth.users(id),
 day_key date NOT NULL,
 timezone text NOT NULL,
 policy_version integer NOT NULL DEFAULT 1 CHECK(policy_version=1),
 evidence text NOT NULL DEFAULT 'incomplete' CHECK(evidence IN ('verified','incomplete')),
 expected_count integer NOT NULL CHECK(expected_count>=0),
 close_status text NOT NULL DEFAULT 'open' CHECK(close_status IN ('open','closed')),
 closes_at timestamptz NOT NULL,
 closed_at timestamptz,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 PRIMARY KEY(user_id,day_key),
 CHECK((close_status='closed')=(closed_at IS NOT NULL)),
 CHECK(closed_at IS NULL OR closed_at>=closes_at),
 CHECK(closes_at=((day_key+1)::timestamp AT TIME ZONE timezone))
);
CREATE INDEX IF NOT EXISTS draft_pending_close ON crystrack_daily_draft.days(closes_at) WHERE close_status='open';

CREATE TABLE IF NOT EXISTS crystrack_daily_draft.routines (
 user_id uuid NOT NULL,
 day_key date NOT NULL,
 routine_key uuid NOT NULL, -- Durable identity deliberately has NO FK to recurring_tasks.
 schedule_version bigint NOT NULL CHECK(schedule_version>0),
 status text NOT NULL CHECK(status IN ('pending','completed','skipped','missed')),
 completed_at timestamptz,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 PRIMARY KEY(user_id,day_key,routine_key),
 FOREIGN KEY(user_id,day_key) REFERENCES crystrack_daily_draft.days(user_id,day_key),
 CHECK((status='completed')=(completed_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS crystrack_daily_draft.notes (
 user_id uuid NOT NULL REFERENCES auth.users(id),
 day_key date NOT NULL,
 body text NOT NULL CHECK(length(body)<=4000),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,day_key)
);

-- Snapshot assembly must be a single transaction. Even privileged callers cannot
-- label a truncated child set verified. This does not certify source provenance.
CREATE OR REPLACE FUNCTION crystrack_daily_draft.check_completeness() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,crystrack_daily_draft AS $$
DECLARE uid uuid; key date; d crystrack_daily_draft.days;
BEGIN
 IF TG_OP='DELETE' THEN uid:=OLD.user_id; key:=OLD.day_key;
 ELSE uid:=NEW.user_id; key:=NEW.day_key; END IF;
 SELECT * INTO d FROM crystrack_daily_draft.days WHERE user_id=uid AND day_key=key;
 IF FOUND AND d.evidence='verified' AND d.expected_count<>(SELECT count(*) FROM crystrack_daily_draft.routines WHERE user_id=uid AND day_key=key) THEN
  RAISE EXCEPTION 'Incomplete snapshot' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS draft_day_completeness ON crystrack_daily_draft.days;
CREATE CONSTRAINT TRIGGER draft_day_completeness AFTER INSERT OR UPDATE ON crystrack_daily_draft.days
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION crystrack_daily_draft.check_completeness();
DROP TRIGGER IF EXISTS draft_routine_completeness ON crystrack_daily_draft.routines;
CREATE CONSTRAINT TRIGGER draft_routine_completeness AFTER INSERT OR UPDATE OR DELETE ON crystrack_daily_draft.routines
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION crystrack_daily_draft.check_completeness();

CREATE OR REPLACE FUNCTION crystrack_daily_draft.freeze_closed() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,crystrack_daily_draft AS $$
BEGIN
 IF TG_TABLE_NAME='days' THEN
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.close_status='closed' THEN RAISE EXCEPTION 'Closed day is immutable'; END IF;
  IF TG_OP='UPDATE' AND (NEW.user_id,NEW.day_key) IS DISTINCT FROM (OLD.user_id,OLD.day_key) THEN RAISE EXCEPTION 'Immutable day identity'; END IF;
  IF TG_OP='UPDATE' AND OLD.evidence='verified' AND
    (NEW.expected_count,NEW.timezone,NEW.closes_at) IS DISTINCT FROM (OLD.expected_count,OLD.timezone,OLD.closes_at) THEN
    RAISE EXCEPTION 'Eligibility and timezone are frozen';
  END IF;
 ELSE
  IF TG_OP='UPDATE' AND (NEW.user_id,NEW.day_key,NEW.routine_key,NEW.schedule_version) IS DISTINCT FROM
    (OLD.user_id,OLD.day_key,OLD.routine_key,OLD.schedule_version) THEN RAISE EXCEPTION 'Immutable eligibility identity'; END IF;
  IF EXISTS(SELECT 1 FROM crystrack_daily_draft.days WHERE user_id=OLD.user_id AND day_key=OLD.day_key AND close_status='closed')
   OR EXISTS(SELECT 1 FROM crystrack_daily_draft.days WHERE user_id=NEW.user_id AND day_key=NEW.day_key AND close_status='closed') THEN
   RAISE EXCEPTION 'Closed day is immutable';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS draft_freeze_day ON crystrack_daily_draft.days;
CREATE TRIGGER draft_freeze_day BEFORE UPDATE OR DELETE ON crystrack_daily_draft.days
FOR EACH ROW EXECUTE FUNCTION crystrack_daily_draft.freeze_closed();
DROP TRIGGER IF EXISTS draft_freeze_routine ON crystrack_daily_draft.routines;
CREATE TRIGGER draft_freeze_routine BEFORE INSERT OR UPDATE OR DELETE ON crystrack_daily_draft.routines
FOR EACH ROW EXECUTE FUNCTION crystrack_daily_draft.freeze_closed();

ALTER TABLE crystrack_daily_draft.days ENABLE ROW LEVEL SECURITY;
ALTER TABLE crystrack_daily_draft.routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE crystrack_daily_draft.notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS draft_owner_days ON crystrack_daily_draft.days;
CREATE POLICY draft_owner_days ON crystrack_daily_draft.days FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS draft_owner_routines ON crystrack_daily_draft.routines;
CREATE POLICY draft_owner_routines ON crystrack_daily_draft.routines FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS draft_owner_notes ON crystrack_daily_draft.notes;
CREATE POLICY draft_owner_notes ON crystrack_daily_draft.notes FOR ALL TO authenticated
USING(user_id=(SELECT auth.uid())) WITH CHECK(user_id=(SELECT auth.uid()));
REVOKE ALL ON ALL TABLES IN SCHEMA crystrack_daily_draft FROM PUBLIC,anon,authenticated;
GRANT SELECT ON crystrack_daily_draft.days,crystrack_daily_draft.routines TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON crystrack_daily_draft.notes TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crystrack_daily_draft FROM PUBLIC,anon,authenticated;
