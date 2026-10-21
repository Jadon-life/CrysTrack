-- Issue #55 LOCAL-ONLY. Caller must run in one checked marked-db transaction
-- with lock/statement timeouts and no hosted connection.
DO $$ BEGIN
 IF current_database() <> 'crystrack_release_rehearsal'
    OR (SELECT value FROM crystrack_sandbox_identity.marker) <> 'ISSUE19-SYNTHETIC-ONLY'
    OR (SELECT active FROM crystrack_full_release_gate.state) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Invalid all-domain gate enable state/target'; END IF;
END $$;
CREATE EVENT TRIGGER crys_release_full_new_table
  ON ddl_command_end WHEN TAG IN ('CREATE TABLE')
  EXECUTE FUNCTION crystrack_full_release_gate.new_table();
ALTER EVENT TRIGGER crys_release_full_new_table ENABLE ALWAYS;
SELECT crystrack_full_release_gate.attach();
UPDATE crystrack_full_release_gate.state SET active=true WHERE singleton=true;
SELECT crystrack_full_release_gate.check_active();
