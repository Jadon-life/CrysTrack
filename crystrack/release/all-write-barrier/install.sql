-- ISSUE #55: disposable-local PostgreSQL ALL APPLICATION TABLE writer fence.
-- NOT a hosted migration or deployable managed-Supabase maintenance script.
-- The driver fixes Docker/database identity and only installs with an explicit flag.
DO $pre$ BEGIN
 IF current_database() <> 'crystrack_release_rehearsal'
    OR session_user <> 'postgres'
    OR (SELECT value FROM crystrack_sandbox_identity.marker) <> 'ISSUE19-SYNTHETIC-ONLY'
 THEN RAISE EXCEPTION 'Not the fixed local synthetic rehearsal database'; END IF;
 IF EXISTS(SELECT 1 FROM pg_event_trigger) THEN
  RAISE EXCEPTION 'Unknown event hooks: stop rather than altering managed triggers';
 END IF;
END $pre$;

CREATE SCHEMA crystrack_release_complete;
REVOKE ALL ON SCHEMA crystrack_release_complete FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE crystrack_release_complete.state (
 singleton boolean PRIMARY KEY CHECK(singleton),
 active boolean NOT NULL
);
INSERT INTO crystrack_release_complete.state VALUES (true,false);
REVOKE ALL ON ALL TABLES IN SCHEMA crystrack_release_complete FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION crystrack_release_complete.deny() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 RAISE EXCEPTION 'Application writes paused for synthetic release rehearsal' USING ERRCODE='PT503';
END $fn$;

-- Applies to *every* currently materialized public application table and
-- private crystrack_* application ledger/receipt table, including those added
-- by 0013..0024. It deliberately excludes auth/storage (external identity and
-- binary services), the sandbox marker, and this private control schema.
CREATE FUNCTION crystrack_release_complete.attach() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE r record; BEGIN
 FOR r IN
  SELECT n.nspname AS schema_name,c.relname AS table_name,c.oid AS table_oid
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='r' AND
   (n.nspname='public' OR n.nspname LIKE 'crystrack_%')
   AND n.nspname NOT IN ('crystrack_sandbox_identity','crystrack_release_complete','crystrack_release_gate')
  ORDER BY n.nspname,c.relname
 LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=r.table_oid AND tgname='crys_complete_stop') THEN
   EXECUTE format('LOCK TABLE %I.%I IN ACCESS EXCLUSIVE MODE',r.schema_name,r.table_name);
   EXECUTE format('CREATE TRIGGER crys_complete_stop BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION crystrack_release_complete.deny()',r.schema_name,r.table_name);
   EXECUTE format('ALTER TABLE %I.%I ENABLE ALWAYS TRIGGER crys_complete_stop',r.schema_name,r.table_name);
  END IF;
 END LOOP;
END $fn$;

-- Only the reviewed migration sequence is rehearsed here. CREATE TABLE fires
-- after catalog creation but before transaction commit, so a failure rolls
-- the new relation back. Never assume this local hook can coexist with managed
-- PG17 event triggers without an independent hosted preflight.
CREATE FUNCTION crystrack_release_complete.on_new_table() RETURNS event_trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN PERFORM crystrack_release_complete.attach(); END $fn$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crystrack_release_complete FROM PUBLIC,anon,authenticated,service_role;
