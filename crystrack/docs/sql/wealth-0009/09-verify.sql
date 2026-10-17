-- Read-only verification after all eight installer files succeed.
SELECT routine, to_regprocedure('public.' || routine) IS NOT NULL AS installed
FROM unnest(ARRAY['wealth_guard()','wealth_spend_save()','wealth_write_entry(uuid,jsonb,integer,text)','wealth_import(jsonb)','wealth_reallocate(uuid,uuid,numeric)','wealth_pay_bill(uuid,uuid)','wealth_protect_target_delete()']) AS routine;
SELECT tablename, rowsecurity AS rls_enabled FROM pg_tables
WHERE schemaname='public' AND tablename IN ('wealth_accounts','wealth_budget_caps','wealth_bills','wealth_circles','wealth_circle_contributions','wealth_settings') ORDER BY tablename;
