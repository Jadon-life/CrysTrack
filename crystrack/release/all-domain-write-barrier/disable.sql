-- Issue #55 LOCAL-ONLY. Validate every existing protected table and hook
-- before removing ANY trigger. Caller wraps everything in one transaction.
SELECT crystrack_full_release_gate.check_active();
DROP EVENT TRIGGER crys_release_full_new_table;
DO $$
DECLARE r record;
BEGIN
 FOR r IN
  SELECT n.nspname,c.relname
  FROM pg_trigger t
  JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE t.tgname='crys_release_full_stop'
 LOOP
  EXECUTE format('DROP TRIGGER crys_release_full_stop ON %I.%I',r.nspname,r.relname);
 END LOOP;
END $$;
UPDATE crystrack_full_release_gate.state SET active=false WHERE singleton=true;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='crys_release_full_stop')
    OR EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname='crys_release_full_new_table')
 THEN RAISE EXCEPTION 'Incomplete all-domain release gate cleanup'; END IF;
END $$;
