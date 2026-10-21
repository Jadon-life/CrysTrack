-- Read-only, nonidentifying managed PG17 compatibility preflight.
-- DO NOT PASTE THE SEPTEMBER MIGRATIONS INTO THE LIVE DB WHILE ANY blocker is true.
-- This file intentionally never mutates a table, grant, trigger, job, role or user row.
WITH
  base AS (
    SELECT current_setting('server_version_num')::integer AS server_version,
      to_regclass('public.daily_records') IS NOT NULL AS installed_daily,
      (SELECT count(*) FROM pg_catalog.pg_event_trigger) AS managed_hooks,
      (SELECT count(*) FROM public.recurring_tasks) AS tasks,
      (SELECT count(*) FROM public.task_occurrences) AS occurrences,
      (SELECT count(*) FROM public.assignments) AS assignments,
      (SELECT count(*) FROM public.wealth_bills) AS legacy_bills,
      (SELECT count(*) FROM public.money_entries) AS money_entries,
      (SELECT count(*) FROM storage.objects) AS storage_objects
  ),
  revision AS (
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='assignments' AND column_name='revision'
    ) AS revision_exists,
    (SELECT count(*) FROM public.assignments WHERE revision <= 0) AS nonpositive_versions
  ),
  provenance AS (
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='money_entries' AND column_name='bill_id'
    ) AS legacy_bill_column,
    EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid='public.money_entries'::regclass AND c.contype='f'
      AND pg_get_constraintdef(c.oid) LIKE '%(bill_id) REFERENCES wealth_bills(id)%'
    ) AS legacy_bill_fk,
    (SELECT count(*) FROM public.money_entries WHERE bill_id IS NOT NULL) AS existing_bill_entries
  ),
  jobs AS (
    SELECT count(*) FILTER (WHERE active) AS active_dispatchers FROM cron.job
  )
SELECT
  current_database() = 'postgres' AND server_version >= 170000 AS pg17_postgres_database,
  installed_daily AS september_schema_already_started,
  revision_exists AS conflicting_assignment_revision_column,
  nonpositive_versions AS existing_nonpositive_assignment_versions,
  legacy_bill_column AS conflicting_legacy_bill_id_column,
  legacy_bill_fk AS existing_bill_id_points_to_old_bills,
  existing_bill_entries AS legacy_bill_entry_count,
  managed_hooks AS event_trigger_count,
  active_dispatchers AS active_cron_jobs,
  tasks, occurrences, assignments, legacy_bills, money_entries, storage_objects,
  NOT installed_daily AND NOT revision_exists AND NOT legacy_bill_column AND active_dispatchers = 0
    AS unchanged_migrations_are_candidate_compatible
FROM base CROSS JOIN revision CROSS JOIN provenance CROSS JOIN jobs;
