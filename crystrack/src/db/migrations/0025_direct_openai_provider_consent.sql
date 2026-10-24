-- CrysTrack: direct OpenAI provider cutover.
-- Apply only in a coordinated release with the matching Next.js code AND a
-- server-side OPENAI_API_KEY. Never apply during a routine redeploy.
-- This invalidates prior OpenRouter-only consent and requires the owner to
-- explicitly opt in to OpenAI. User financial/task data is not modified.
BEGIN;

DO $openai_consent_cutover$
DECLARE
  target RECORD;
  original TEXT;
  changed_count INTEGER := 0;
BEGIN
  FOR target IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN (
        'account_export_ai_v1', 'ai_privacy_mutate', 'ai_privacy_state',
        'ai_request_begin', 'ai_request_check', 'ai_request_finish'
      )
  LOOP
    original := pg_get_functiondef(target.oid);
    IF position('2026-10-20-minimal-v1' in original) = 0 THEN
      RAISE EXCEPTION 'Unexpected consent source for %; migration aborted', target.proname;
    END IF;
    EXECUTE replace(
      original,
      '2026-10-20-minimal-v1',
      '2026-10-24-openai-direct-v2'
    );
    changed_count := changed_count + 1;
  END LOOP;
  IF changed_count <> 6 THEN
    RAISE EXCEPTION 'Expected six AI consent functions, found %', changed_count;
  END IF;
END
$openai_consent_cutover$;

-- The old opt-in was for OpenRouter. Never carry that consent to a new
-- external provider. Revision increment invalidates all in-flight leases.
UPDATE public.ai_privacy_preferences
   SET enabled=false,
       wealth_enabled=false,
       revision=revision+1,
       updated_at=now()
 WHERE enabled OR wealth_enabled;

COMMIT;
