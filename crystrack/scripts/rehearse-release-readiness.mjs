/** Issue #18: catalog-only verification of the fixed, disposable local Supabase stack. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget, localSql } from './local-supabase.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const confirmation = '--synthetic-local-only=ISSUE18-NO-HOSTED';
export const candidates = [
  '0013_daily_records.sql', '0014_daily_http_conflicts.sql',
  '0015_sep28_crystal_shards.sql', '0016_assignment_lifecycle.sql',
  '0017_task_week_grid.sql', '0018_wealth_monthly_budgets.sql',
  '0019_wealth_recurring_bills.sql', '0020_wealth_csv_statements.sql',
  '0021_wealth_overview_read.sql', '0022_ai_privacy_consent.sql',
  '0023_offline_outcome_guard.sql', '0024_private_account_export.sql',
];
const legacy = ['0000_initial.sql', '0001_product_integrity.sql',
  '0002_adaptive_experience.sql', '0003_wealth_intelligence.sql',
  '0004_profile_avatar_storage.sql', '0005_intelligence_layer.sql'];

const userTables = [
  'daily_tracking_states', 'daily_timezone_transitions', 'routine_schedule_versions',
  'daily_records', 'daily_routine_records', 'daily_mutation_requests', 'daily_notes',
  'sep28_crystal_preferences', 'sep28_crystal_awards', 'sep28_crystal_events',
  'sep28_crystal_moments', 'wealth_monthly_budgets', 'wealth_recurring_bills',
  'wealth_bill_occurrences', 'wealth_csv_batches', 'wealth_csv_rows',
  'ai_privacy_preferences',
];
const privateTables = [
  'crystrack_assignments.identities', 'crystrack_budgets.requests',
  'crystrack_bills.states', 'crystrack_bills.requests',
  'crystrack_bills.entry_permits', 'crystrack_csv.permits',
  'crystrack_ai.mutations', 'crystrack_ai.requests',
];
const authenticatedFunctions = [
  'public.daily_set_outcome(date,uuid,text,integer,uuid)',
  'public.daily_read_week(date,uuid,integer,text,text)',
  'public.sep28_crystal_state()',
  'public.assignment_mutate(text,uuid,integer,jsonb)',
  'public.wealth_budget_mutate(text,date,text,text,integer,uuid,text)',
  'public.wealth_bill_mutate(text,uuid,integer,uuid,text,jsonb)',
  'public.wealth_csv_import(uuid,text,text,text,jsonb,text,boolean)',
  'public.wealth_csv_export(date,date,boolean)',
  'public.wealth_overview_read()',
  'public.ai_privacy_mutate(text,integer,uuid,boolean,boolean,text,boolean,uuid)',
  'public.daily_replay_offline_outcome(jsonb)',
  'public.daily_resolve_offline_outcome(jsonb)',
  'public.account_export_snapshot_v1(text[],boolean,integer)',
  'public.account_export_ai_v1(integer)',
];
const backendFunctions = [
  'public.recover_daily_records(uuid,integer)',
  'public.assignment_claim_reminder(uuid,integer,integer)',
  'public.assignment_finish_delivery(uuid,text[],text[],text)',
  'public.bill_reminder_candidates(uuid)',
  'public.bill_claim_reminder(uuid,integer)',
  'public.bill_finish_delivery(uuid,text[],text[],text)',
  'public.ai_request_begin(uuid,integer,text)',
  'public.ai_request_check(uuid,uuid,integer,text)',
  'public.ai_request_finish(uuid,uuid,integer,text,jsonb)',
];
const protectedTriggers = [
  ['task_occurrences', 'daily_occurrence_guard'],
  ['daily_records', 'sep28_crystal_daily_close'],
  ['daily_routine_records', 'sep28_crystal_daily_tick'],
  ['assignments', 'assignment_reconcile'],
  ['money_entries', 'sep28_crystal_source'],
  ['money_entries', 'bill_payment_source_guard'],
  ['money_entries', 'csv_payment_source_guard'],
  ['goal_checkins', 'ai_goal_analysis_integrity'],
];

function literal(value) { return `'${value.replaceAll("'", "''")}'`; }
function readJson(sql) { return JSON.parse(localSql(sql)); }

export function expectedLedger() {
  return [...legacy, ...candidates].map(name => ({
    name,
    hash: createHash('sha256').update(fs.readFileSync(path.join(root, 'src/db/migrations', name))).digest('hex'),
  }));
}

export function auditLocalRelease() {
  assertTarget(); // fixed Docker project/loopback; rejects linked remote project state
  assert.equal(localSql('SELECT current_database()'), 'postgres');
  const ledger = readJson("SELECT coalesce(json_agg(json_build_object('name',name,'hash',hash) ORDER BY name),'[]'::json) FROM crystrack_local_control.applied");
  assert.deepEqual(ledger, expectedLedger(), 'local migration ordering or hashes differ');
  assert.equal(localSql('SELECT count(*) FROM crystrack_local_control.pending'), '0');

  for (const name of userTables) {
    assert.equal(localSql(`SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.${name}')`), 't', `RLS: ${name}`);
    assert.equal(localSql(`SELECT has_table_privilege('anon',to_regclass('public.${name}'),'SELECT')`), 'f', `anon: ${name}`);
  }
  for (const name of privateTables) {
    assert.equal(localSql(`SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('${name}')`), 't', `RLS: ${name}`);
    assert.equal(localSql(`SELECT has_table_privilege('authenticated',to_regclass('${name}'),'SELECT')`), 'f', `private: ${name}`);
  }
  for (const [signature, actor] of [
    ...authenticatedFunctions.map(name => [name, 'authenticated']),
    ...backendFunctions.map(name => [name, 'service_role']),
  ]) {
    assert.equal(localSql(`SELECT to_regprocedure(${literal(signature)}) IS NOT NULL`), 't', `missing: ${signature}`);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const expected = role === actor ? 't' : 'f';
      assert.equal(localSql(`SELECT has_function_privilege(${literal(role)},${literal(signature)},'EXECUTE')`), expected, `${role}: ${signature}`);
    }
  }
  for (const [table, trigger] of protectedTriggers) {
    assert.equal(localSql(`SELECT count(*) FROM pg_trigger WHERE tgrelid='public.${table}'::regclass AND tgname=${literal(trigger)} AND tgenabled<>'D'`), '1', `${table}.${trigger}`);
  }
  assert.equal(localSql("SELECT has_table_privilege('authenticated','public.task_occurrences','INSERT')"), 'f');
  assert.equal(localSql("SELECT has_table_privilege('authenticated','public.ai_messages','INSERT')"), 'f');
  assert.equal(localSql("SELECT count(*) FROM pg_trigger WHERE tgrelid='public.money_entries'::regclass AND tgname IN ('bill_payment_source_guard','csv_payment_source_guard') AND tgenabled<>'D'"), '2');

  return {
    target: 'fixed-loopback-crystrack-local-free',
    engine: localSql('SHOW server_version'),
    orderedCandidates: ledger.slice(legacy.length),
    rlsTables: userTables.length + privateTables.length,
    functionGrants: authenticatedFunctions.length + backendFunctions.length,
    protectedTriggers: protectedTriggers.length,
    hostedCompatibility: 'UNKNOWN',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== confirmation) throw new Error('Explicit fixed local synthetic confirmation required');
    console.log(JSON.stringify(auditLocalRelease(), null, 2));
  } catch (error) {
    console.error('Issue #18 local release audit stopped:', error.message);
    process.exitCode = 1;
  }
}
