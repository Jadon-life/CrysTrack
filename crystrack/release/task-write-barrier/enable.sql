-- Outer transaction holds the operator lock and a bounded lock timeout.
DO $$ BEGIN
 IF NOT (SELECT active FROM crystrack_release_gate.state) THEN
  CREATE EVENT TRIGGER crys_release_new_table ON ddl_command_end WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION crystrack_release_gate.new_table();
  ALTER EVENT TRIGGER crys_release_new_table ENABLE ALWAYS;
  PERFORM crystrack_release_gate.attach();
  UPDATE crystrack_release_gate.state SET active=true;
 END IF;
END $$;
