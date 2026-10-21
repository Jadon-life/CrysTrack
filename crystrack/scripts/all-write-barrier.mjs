/** ISSUE #55 — synthetic PG15 only. Never a hosted release tool. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './local-supabase.mjs';
import { prepare, destroy, identity, sql, raw } from './task-release-barrier.mjs';

export const CONFIRM_ALL = '--synthetic-local-only=ISSUE55-NO-HOSTED';
export const REHEARSAL_ENV = 'ISSUE55-SYNTHETIC-ONLY';
const FOLDER = path.join(ROOT, 'release/all-write-barrier');

export function parseAllAction(argv) {
  if (argv.length !== 2 || argv[1] !== CONFIRM_ALL ||
    !['prepare', 'preflight', 'enable', 'check', 'disable', 'abort', 'destroy'].includes(argv[0])) {
    throw Error('Explicit synthetic-local-only action required, no target overrides');
  }
  return argv[0];
}

function requireLocal() {
  if (process.env.CRYSTRACK_RELEASE_REHEARSAL !== REHEARSAL_ENV) {
    throw Error('Issue 55 synthetic rehearsal environment confirmation required');
  }
}

function exists() {
  return sql("SELECT to_regnamespace('crystrack_release_complete') IS NOT NULL") === 't';
}
const PROTECTED = "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace " +
 "WHERE c.relkind='r' AND (n.nspname='public' OR n.nspname LIKE 'crystrack_%') " +
 "AND n.nspname NOT IN ('crystrack_sandbox_identity','crystrack_release_complete','crystrack_release_gate')";

function guardCount() {
  return Number(sql('SELECT count(*) ' + PROTECTED));
}
function guardedCount() {
  return Number(sql('SELECT count(*) ' + PROTECTED +
    " AND EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid " +
    "AND t.tgname='crys_complete_stop' AND t.tgenabled='A' AND t.tgtype=62 " +
    "AND NOT t.tgisinternal AND t.tgfoid='crystrack_release_complete.deny()'::regprocedure)"));
}

function assertHooks(active) {
  const hookQuery = "SELECT count(*) FROM pg_event_trigger " +
    "WHERE evtname='crys_complete_new_table' AND evtevent='ddl_command_end' " +
    "AND evtenabled='A' AND evttags=ARRAY['CREATE TABLE'] " +
    "AND evtfoid='crystrack_release_complete.on_new_table()'::regprocedure";
  const checked = raw(hookQuery,{allowFailure:true});
  if (checked.status !== 0) {
    // Only the static pg_catalog query is involved; redact all other output.
    const state = checked.stderr.match(/(?:ERROR|FATAL):?[^\n]{0,120}/)?.[0] || 'unknown SQLSTATE';
    throw Error('Synthetic event hook catalog assertion failed: ' + state);
  }
  const hook = checked.stdout.trim();
  const other = sql("SELECT count(*) FROM pg_event_trigger WHERE evtname <> 'crys_complete_new_table'");
  if (other !== '0' || hook !== (active ? '1' : '0')) {
    throw Error('Unexpected or missing event trigger — abort');
  }
}

function verify(shouldBeActive) {
  identity();
  if (!exists()) throw Error('Synthetic complete-release gate not installed');
  const active = sql('SELECT active FROM crystrack_release_complete.state WHERE singleton');
  if (active !== (shouldBeActive ? 't' : 'f')) throw Error('Release gate state drift');
  assertHooks(shouldBeActive);
  const total = guardCount();
  const covered = shouldBeActive ? guardedCount() : Number(sql(
    "SELECT count(*) FROM pg_trigger WHERE tgname='crys_complete_stop'"));
  if (shouldBeActive ? covered !== total : covered !== 0) {
    throw Error('Release guard coverage drift');
  }
  if (sql("SELECT count(*) FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role') " +
    "AND (has_schema_privilege(r.oid,'crystrack_release_complete','USAGE') " +
    "OR has_function_privilege(r.oid,'crystrack_release_complete.deny()','EXECUTE') " +
    "OR has_function_privilege(r.oid,'crystrack_release_complete.attach()','EXECUTE'))") !== '0') {
    throw Error('Release guard privilege drift');
  }
  return { active: shouldBeActive, protectedTables: total };
}

function preflight() {
  identity();
  if (sql("SELECT to_regnamespace('crystrack_release_gate') IS NOT NULL") === 't') {
    throw Error('Separate task-only prototype present; refuse overlapping gates');
  }
  if (sql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace " +
    "WHERE c.relkind IN ('p','f') AND (n.nspname='public' OR n.nspname LIKE 'crystrack_%')") !== '0') {
    throw Error('Unknown partition/foreign table; stop rather than leaving writes exposed');
  }
  if (!exists()) {
    if (sql('SELECT count(*) FROM pg_event_trigger') !== '0' ||
      sql("SELECT count(*) FROM pg_trigger WHERE tgname='crys_complete_stop'") !== '0') {
      throw Error('Unknown preexisting hooks; managed/event-trigger compatibility not proven');
    }
    return { installed: false, protectedTables: guardCount() };
  }
  return { installed: true, ...verify(sql('SELECT active FROM crystrack_release_complete.state') === 't') };
}

function transaction(body) {
  // No operator JWT, GUC or SQL passthrough. One fixed identified local DB.
  raw("BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='40s';" +
    "SELECT pg_advisory_xact_lock(190055);\n" + body + "\nCOMMIT;");
}

function enable() {
  const state = preflight();
  if (state.installed && state.active) throw Error('Full gate already active');
  const install = state.installed ? '' : fs.readFileSync(path.join(FOLDER, 'install.sql'), 'utf8');
  transaction(install +
    "CREATE EVENT TRIGGER crys_complete_new_table ON ddl_command_end " +
    "WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION crystrack_release_complete.on_new_table();" +
    "ALTER EVENT TRIGGER crys_complete_new_table ENABLE ALWAYS;" +
    "SELECT crystrack_release_complete.attach();" +
    "UPDATE crystrack_release_complete.state SET active=true WHERE singleton;");
  return verify(true);
}

function disable() {
  const state = preflight();
  if (!state.installed || !state.active) throw Error('No active full gate to disable');
  verify(true); // Prove every expected guard is intact before dropping any.
  transaction("DROP EVENT TRIGGER crys_complete_new_table;" +
    "DO $body$ DECLARE r record; BEGIN FOR r IN " +
    "SELECT n.nspname AS schema_name,c.relname AS table_name " +
    "FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid " +
    "JOIN pg_namespace n ON n.oid=c.relnamespace " +
    "WHERE t.tgname='crys_complete_stop' LOOP " +
    "EXECUTE format('DROP TRIGGER crys_complete_stop ON %I.%I',r.schema_name,r.table_name);" +
    "END LOOP; END $body$;" +
    "UPDATE crystrack_release_complete.state SET active=false WHERE singleton;");
  return verify(false);
}

export function allAction(name) {
  requireLocal();
  if (name === 'prepare') { prepare(); return { synthetic: true }; }
  identity();
  if (name === 'destroy') {
    if (exists() && sql('SELECT active FROM crystrack_release_complete.state') === 't') {
      throw Error('Refuse to destroy an active guard — disable explicitly');
    }
    destroy();
    return { destroyed: true };
  }
  if (name === 'preflight') return preflight();
  if (name === 'enable') return enable();
  if (name === 'check') return preflight();
  if (name === 'disable' || name === 'abort') return disable();
  throw Error('Unsupported action');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(allAction(parseAllAction(process.argv.slice(2))))); }
  catch (error) { console.error('Synthetic rehearsal stopped:', error.message); process.exitCode = 1; }
}
