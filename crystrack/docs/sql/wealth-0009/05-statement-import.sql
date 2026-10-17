-- Wealth 0009 installer: step 5 of 8. Run this entire file.
BEGIN;
SET LOCAL search_path = public;
-- BEGIN MIGRATION SECTION
CREATE OR REPLACE FUNCTION wealth_import(p_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE row jsonb; count integer:=0;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
 IF jsonb_array_length(p_rows)>500 THEN RAISE EXCEPTION 'Import limit' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,7));
 FOR row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF NOT EXISTS(SELECT 1 FROM money_entries WHERE user_id=auth.uid() AND account_id=(row->>'accountId')::uuid AND import_key=row->>'importKey') THEN
   PERFORM wealth_write_entry(NULL,row); count:=count+1;
  END IF;
 END LOOP;
 RETURN count;
END $$;
-- END MIGRATION SECTION
COMMIT;
SELECT '05-statement-import complete' AS installation_step;
