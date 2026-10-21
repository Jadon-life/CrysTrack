-- Driver MUST verify all active guards before removing ANY guard.
DO $$ DECLARE r record; BEGIN
 IF (SELECT active FROM crystrack_release_gate.state) THEN
  DROP EVENT TRIGGER crys_release_new_table;
  FOR r IN SELECT c.relname,t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND t.tgname IN ('crys_release_freeze','crys_release_truncate') LOOP
   EXECUTE format('DROP TRIGGER %I ON public.%I',r.tgname,r.relname);
  END LOOP;
  UPDATE crystrack_release_gate.state SET active=false;
 END IF;
END $$;
