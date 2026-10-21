-- ISSUE #55: DO NOT RUN ON HOSTED SUPABASE. Local marker-guarded prototype only.
-- This intentionally blocks ALL application public and crystrack_* private-table
-- DML during a synthetic rehearsal, not just task writes. It does not isolate
-- auth/storage/other schemas, external workers, old URLs or paid providers.
DO $$
BEGIN
 IF current_database() <> 'crystrack_release_rehearsal'
    OR session_user <> 'postgres'
    OR to_regclass('crystrack_sandbox_identity.marker') IS NULL
    OR (SELECT value FROM crystrack_sandbox_identity.marker) <> 'ISSUE19-SYNTHETIC-ONLY'
 THEN RAISE EXCEPTION 'Local marked Issue 19 sandbox required'; END IF;
 IF to_regnamespace('crystrack_full_release_gate') IS NOT NULL
 THEN RAISE EXCEPTION 'Existing all-domain release gate; refuse to replace'; END IF;
END $$;
CREATE SCHEMA crystrack_full_release_gate;
REVOKE ALL ON SCHEMA crystrack_full_release_gate FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE crystrack_full_release_gate.state (
 singleton boolean PRIMARY KEY CHECK (singleton),
 active boolean NOT NULL
);
INSERT INTO crystrack_full_release_gate.state VALUES (true,false);
ALTER TABLE crystrack_full_release_gate.state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA crystrack_full_release_gate FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION crystrack_full_release_gate.deny() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 RAISE EXCEPTION 'Application writes are paused for maintenance' USING ERRCODE='PT503';
END $$;

-- Every existing user-data table in public and every CrysTrack private app
-- schema is guarded, including task, finance, receipt, shard, AI and reminder
-- sources. New tables receive guards within the CREATE TABLE transaction.
-- Never guard the gate's own state or the sandbox identity marker.
CREATE FUNCTION crystrack_full_release_gate.attach() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r record;
BEGIN
 FOR r IN
  SELECT n.nspname AS schema_name, c.relname AS table_name, c.oid AS rel
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p')
    AND (n.nspname='public'
      OR (n.nspname LIKE 'crystrack\_%' ESCAPE '\'
        AND n.nspname NOT IN (
          'crystrack_release_gate','crystrack_full_release_gate',
          'crystrack_sandbox_identity')))
  ORDER BY n.nspname,c.relname
 LOOP
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid=r.rel AND t.tgname='crys_release_full_stop'
  ) THEN
   EXECUTE format('LOCK TABLE %I.%I IN ACCESS EXCLUSIVE MODE',r.schema_name,r.table_name);
   EXECUTE format(
     'CREATE TRIGGER crys_release_full_stop BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION crystrack_full_release_gate.deny()',
     r.schema_name,r.table_name);
   EXECUTE format('ALTER TABLE %I.%I ENABLE ALWAYS TRIGGER crys_release_full_stop',
                  r.schema_name,r.table_name);
  END IF;
 END LOOP;
END $$;

CREATE FUNCTION crystrack_full_release_gate.new_table() RETURNS event_trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM crystrack_full_release_gate.attach();
END $$;

CREATE FUNCTION crystrack_full_release_gate.check_active() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n bigint; protected bigint; r record;
BEGIN
 IF (SELECT active FROM crystrack_full_release_gate.state WHERE singleton=true) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'All-domain gate is not active'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM pg_event_trigger e
  WHERE e.evtname='crys_release_full_new_table'
    AND e.evtenabled='A'
    AND e.evtfoid='crystrack_full_release_gate.new_table()'::regprocedure
 ) THEN RAISE EXCEPTION 'All-domain DDL guard is missing'; END IF;
 FOR r IN
  SELECT c.oid AS rel, n.nspname, c.relname
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p')
    AND (n.nspname='public'
      OR (n.nspname LIKE 'crystrack\_%' ESCAPE '\'
        AND n.nspname NOT IN (
          'crystrack_release_gate','crystrack_full_release_gate',
          'crystrack_sandbox_identity')))
 LOOP
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid=r.rel AND t.tgname='crys_release_full_stop'
      AND t.tgenabled='A' AND t.tgtype=62
      AND t.tgfoid='crystrack_full_release_gate.deny()'::regprocedure
  ) THEN RAISE EXCEPTION 'All-domain table guard missing on %.%',r.nspname,r.relname; END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM pg_roles a
   WHERE a.rolname IN ('anon','authenticated','service_role')
     AND has_schema_privilege(a.oid,'crystrack_full_release_gate','USAGE'))
 THEN RAISE EXCEPTION 'All-domain private schema grant drift'; END IF;
 RETURN true;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crystrack_full_release_gate
 FROM PUBLIC, anon, authenticated, service_role;
