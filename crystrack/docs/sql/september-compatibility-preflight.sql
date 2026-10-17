-- Read-only metadata inspection for an explicitly selected isolated Supabase target.
-- Presence alone does not prove a migration version or financial-data correctness.
BEGIN READ ONLY;
SELECT to_regclass('supabase_migrations.schema_migrations') AS supabase_history,
       to_regclass('drizzle.__drizzle_migrations') AS drizzle_history;
SELECT c.relname AS table_name,c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('money_entries','finance_targets','wealth_accounts','wealth_settings','goals','assignments','daily_rituals','gamification_events')
ORDER BY c.relname;
SELECT table_name,column_name,data_type
FROM information_schema.columns
WHERE table_schema='public' AND
 ((table_name='money_entries' AND column_name IN ('account_id','destination_account_id','deleted_at','revision','import_key','parent_entry_id','amount'))
 OR(table_name='finance_targets' AND column_name IN ('locked_until','current_amount'))
 OR(table_name='goals' AND column_name IN ('progress_source','task_ids','revision'))
 OR(table_name='assignments' AND column_name IN ('revision','finished_late')))
ORDER BY table_name,column_name;
SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer,md5(pg_get_functiondef(p.oid)) AS definition_fingerprint
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('wealth_guard','wealth_write_entry','create_wealth_debt','repay_wealth_debt','confirm_expected_flow',
 'finish_academic_assignment','guard_goal_alignment_checkin','september_account_balances','september_finance_transaction')
ORDER BY p.proname;
COMMIT;
