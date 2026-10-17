-- Wealth 0009 installer: step 8 of 8. Run this entire file.
BEGIN;
SET LOCAL search_path = public;
-- BEGIN MIGRATION SECTION
CREATE OR REPLACE FUNCTION wealth_protect_target_delete() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE zone text;BEGIN
 SELECT coalesce(current_timezone,timezone,'UTC') INTO zone FROM profiles WHERE user_id=auth.uid();
 IF OLD.locked_until>(now() AT TIME ZONE coalesce(zone,'UTC'))::date THEN RAISE EXCEPTION 'Protected savings target' USING ERRCODE='23514'; END IF;RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS wealth_target_delete_guard ON finance_targets;
CREATE TRIGGER wealth_target_delete_guard BEFORE DELETE ON finance_targets FOR EACH ROW EXECUTE FUNCTION wealth_protect_target_delete();
-- END MIGRATION SECTION
COMMIT;
SELECT '08-target-protection complete' AS installation_step;
