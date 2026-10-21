import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { assertTarget, ROOT } from './local-supabase.mjs';
import { DATABASE, identity, sql } from './task-release-barrier.mjs';
import { DOCKER_SOCKET, PROJECT, localEnvironment } from './local-supabase-policy.mjs';

// Synthetic ONLY: no caller-chosen database, Docker host, URL, workdir or credentials.
// Called solely from the disposable task-barrier integration test, not a production tool.
export const CONFIRM_RESTORE = '--synthetic-local-only=ISSUE18-RESTORE-NO-HOSTED';
const DB_CONTAINER = 'supabase_db_' + PROJECT;
const RESTORED = 'crystrack_issue18_restored';
const BROKEN = 'crystrack_issue18_bad_restore';
const MARKER = 'ISSUE18-SYNTHETIC-RESTORE-' + randomUUID();
const MAX_BYTES = 64 * 1024 * 1024;
const ALLOWED_DATABASES = new Set([DATABASE, 'postgres', RESTORED, BROKEN]);

function runDocker(argv, input = null, { allowFailure = false } = {}) {
  assertTarget();
  const result = spawnSync('docker', ['--host', DOCKER_SOCKET, 'exec', '-i', DB_CONTAINER, ...argv], {
    cwd: ROOT, env: localEnvironment(process.env), input, encoding: null,
    maxBuffer: MAX_BYTES, timeout: 120_000, windowsHide: true,
  });
  if (result.error || (!allowFailure && result.status !== 0)) {
    // Never print stdout/stderr, SQL data, Pg settings, environment, or dump bytes.
    throw new Error('Synthetic local PostgreSQL command failed (' + argv[0] + '; status ' + (result.status ?? 'spawn') + ').');
  }
  return result;
}
function dbSql(database, statement) {
  assert(ALLOWED_DATABASES.has(database), 'Only fixed disposable local database names are allowed');
  return runDocker(['psql', '-h', '127.0.0.1', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-Atq'],
    Buffer.from(statement)).stdout.toString('utf8').trim();
}
function comment(db) {
  return dbSql('postgres', "SELECT coalesce(shobj_description(oid,'pg_database'),'') FROM pg_database WHERE datname='" + db + "'");
}
function createMarkedDatabase(db) {
  assert([RESTORED, BROKEN].includes(db));
  // CREATE DATABASE must fail if the target already exists. Never overwrite it.
  dbSql('postgres', 'CREATE DATABASE ' + db + ' TEMPLATE template0');
  dbSql('postgres', "COMMENT ON DATABASE " + db + " IS '" + MARKER + "'");
  assert.equal(comment(db), MARKER, 'Missing owned restore marker');
}
function dropMarkedDatabase(db) {
  if (comment(db) !== MARKER) throw new Error('Refusing to delete an unowned restore database');
  dbSql('postgres', 'DROP DATABASE ' + db + ' WITH (FORCE)');
}
function localArchive(database) {
  assert.equal(database, DATABASE);
  const result = runDocker(['pg_dump', '-h', '127.0.0.1', '-U', 'postgres', '-d', database,
    '--format=custom', '--serializable-deferrable']);
  assert.ok(result.stdout.byteLength > 256 && result.stdout.byteLength < MAX_BYTES, 'Invalid synthetic dump size');
  assert.equal(result.stdout.subarray(0, 5).toString('ascii'), 'PGDMP');
  return result.stdout;
}
function restoreArchive(database, bytes, allowFailure = false) {
  assert([RESTORED, BROKEN].includes(database));
  assert.equal(comment(database), MARKER, 'Restore destination ownership changed');
  return runDocker(['pg_restore', '-h', '127.0.0.1', '-U', 'postgres', '-d', database,
    '--no-owner', '--single-transaction', '--exit-on-error'], bytes, { allowFailure });
}
const summarySql = `SELECT jsonb_build_object(
 'routineRows', (SELECT count(*) FROM public.recurring_tasks),
 'occurrenceRows', (SELECT count(*) FROM public.task_occurrences),
 'moneyRows', (SELECT count(*) FROM public.money_entries),
 'moneyTotalNGN', (SELECT coalesce(sum(amount),0)::text FROM public.money_entries),
 'crystalPreferences', (SELECT count(*) FROM public.sep28_crystal_preferences),
 'crystalAwards', (SELECT count(*) FROM public.sep28_crystal_awards),
 'crystalEvents', (SELECT count(*) FROM public.sep28_crystal_events),
 'aiPrivacyRows', (SELECT count(*) FROM public.ai_privacy_preferences),
 'protectedRls', (SELECT count(*) FROM pg_class WHERE oid IN (
  'public.recurring_tasks'::regclass, 'public.money_entries'::regclass,
  'public.sep28_crystal_awards'::regclass, 'public.ai_privacy_preferences'::regclass
 ) AND relrowsecurity),
 'protectedTriggers', (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'D'
  AND tgrelid IN ('public.money_entries'::regclass,'public.daily_records'::regclass)),
 'rpcFingerprint', (SELECT md5(string_agg(p.proname||':'||p.prosecdef::text||':'||p.prosrc,'|' ORDER BY p.proname))
  FROM pg_proc p WHERE p.oid IN ('public.daily_set_outcome(date,uuid,text,integer,uuid)'::regprocedure,
   'public.wealth_overview_read()'::regprocedure,'public.ai_privacy_state()'::regprocedure,
   'public.account_export_snapshot_v1(text[],boolean,integer)'::regprocedure)),
 'grants', jsonb_build_array(
  has_function_privilege('authenticated','public.daily_set_outcome(date,uuid,text,integer,uuid)','EXECUTE'),
  has_function_privilege('anon','public.daily_set_outcome(date,uuid,text,integer,uuid)','EXECUTE'),
  has_function_privilege('authenticated','public.account_export_snapshot_v1(text[],boolean,integer)','EXECUTE'),
  has_table_privilege('authenticated','public.task_occurrences','INSERT'))
)::text`;
function actorSql(uid) {
  return `BEGIN;
 SET LOCAL ROLE authenticated;
 SET LOCAL request.jwt.claims='{"sub":"${uid}","role":"authenticated"}';
 SELECT jsonb_build_object('routines',(SELECT count(*) FROM public.recurring_tasks),
 'money',(SELECT count(*) FROM public.money_entries),
 'crystal',(SELECT count(*) FROM public.sep28_crystal_preferences),
 'aiPrivacy',(SELECT count(*) FROM public.ai_privacy_preferences))::text;
 ROLLBACK;`;
}
export function rehearseSyntheticRestore(confirmation) {
  if (confirmation !== CONFIRM_RESTORE) throw new Error('Explicit local-only synthetic restore confirmation required');
  identity();
  assert.equal(sql('SELECT active FROM crystrack_release_gate.state'), 't', 'Task rehearsal barrier must remain active');
  assert.equal(sql("SELECT to_regprocedure('public.account_export_snapshot_v1(text[],boolean,integer)') IS NOT NULL"), 't', 'Candidate 0024 required');
  assert.equal(sql("SELECT count(*) FROM auth.users WHERE email IS NULL OR email NOT LIKE '%example.invalid'"), '0', 'Source contains non-synthetic identities');
  const user = sql("SELECT id::text FROM auth.users WHERE email='synthetic@example.invalid'");
  assert.match(user, /^[a-f0-9-]{36}$/);
  const foreign = randomUUID();
  const moneyId = randomUUID();
  const key = 'issue18:restore:' + randomUUID();
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crystrack-issue18-synthetic-'));
  fs.chmodSync(backupDir, 0o700);
  const archivePath = path.join(backupDir, 'synthetic.pgcustom');
  let sampleCreated = false, goodCreated = false, badCreated = false;
  try {
    // A bounded and genuinely nonempty source, fabricated in the isolated rehearsal DB.
    // The task barrier deliberately does not block finance or consent writes.
    sql(`BEGIN; INSERT INTO public.sep28_crystal_preferences(user_id,activated_at,enabled_since)
      VALUES('${user}',now(),now()) ON CONFLICT (user_id) DO NOTHING;
      INSERT INTO public.sep28_crystal_awards(user_id,kind,source_key,eligible,allowed_source,balance,revision)
      VALUES('${user}','goal','${key}',true,true,25,1);
      INSERT INTO public.sep28_crystal_events(user_id,kind,source_key,revision,delta,created_at)
      VALUES('${user}','goal','${key}',1,25,now());
      INSERT INTO public.ai_privacy_preferences(user_id,enabled,wealth_enabled,revision)
      VALUES('${user}',false,false,0) ON CONFLICT(user_id) DO NOTHING;
      INSERT INTO public.money_entries(id,user_id,type,flow_kind,amount,date,source)
      VALUES('${moneyId}','${user}','expense','expense',9.87,'2026-09-21T10:00:00Z','SYNTHETIC restoration fixture'); COMMIT;`);
    sampleCreated = true;
    const before = JSON.parse(dbSql(DATABASE, summarySql));
    assert.ok(before.routineRows > 0 && before.occurrenceRows > 0 && before.moneyRows > 0);
    assert.ok(before.crystalPreferences > 0 && before.crystalAwards > 0 && before.crystalEvents > 0);
    assert.ok(before.aiPrivacyRows > 0 && before.protectedRls === 4 && before.protectedTriggers >= 3);
    assert.equal(before.moneyTotalNGN, '9.87');
    const ownerBefore = JSON.parse(dbSql(DATABASE, actorSql(user)));
    const foreignBefore = JSON.parse(dbSql(DATABASE, actorSql(foreign)));
    assert.ok(ownerBefore.routines > 0 && ownerBefore.money > 0 && ownerBefore.crystal > 0 && ownerBefore.aiPrivacy > 0);
    assert.deepEqual(foreignBefore, {routines:0,money:0,crystal:0,aiPrivacy:0});
    const bytes = localArchive(DATABASE);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    fs.writeFileSync(archivePath, bytes, {mode:0o600,flag:'wx'});
    const readBack = fs.readFileSync(archivePath);
    assert.equal(createHash('sha256').update(readBack).digest('hex'), checksum);
    // A missing archive must fail before creating even a temporary destination.
    assert.throws(() => fs.readFileSync(path.join(backupDir,'missing.pgcustom')), {code:'ENOENT'});
    const started = performance.now();
    createMarkedDatabase(RESTORED); goodCreated = true;
    restoreArchive(RESTORED, readBack);
    const restored = JSON.parse(dbSql(RESTORED, summarySql));
    assert.deepEqual(restored, before, 'Restored logical schema, records and protections do not match');
    assert.deepEqual(JSON.parse(dbSql(RESTORED, actorSql(user))), ownerBefore);
    assert.deepEqual(JSON.parse(dbSql(RESTORED, actorSql(foreign))), foreignBefore);
    assert.equal(dbSql(RESTORED,"SELECT value FROM crystrack_sandbox_identity.marker"),'ISSUE19-SYNTHETIC-ONLY');
    const restoredMs = Math.round(performance.now()-started);
    // Actual damaged archive restore, not just a bad-checksum comparison.
    createMarkedDatabase(BROKEN); badCreated = true;
    const corrupt = restoreArchive(BROKEN,readBack.subarray(0,Math.min(128,readBack.length)),true);
    assert.notEqual(corrupt.status,0,'Truncated custom archive must not restore');
    assert.equal(dbSql(BROKEN,"SELECT to_regclass('public.money_entries') IS NULL"),'t');
    return {kind:'synthetic-local-only',databaseEngine:dbSql(DATABASE,'SHOW server_version'),
      archiveSha256:checksum,archiveBytes:readBack.length,restoreDurationMs:restoredMs,
      verifiedTables:['recurring_tasks','task_occurrences','money_entries','sep28_crystal_preferences',
        'sep28_crystal_awards','sep28_crystal_events','ai_privacy_preferences'],
      ownerRlsChecked:true,foreignOwnerDenied:true,rlsGrantTriggerRpcCompared:true,
      missingBackupRejected:true,corruptRestoreRejected:true,hostedRecoveryVerified:false};
  } finally {
    if (badCreated) dropMarkedDatabase(BROKEN);
    if (goodCreated) dropMarkedDatabase(RESTORED);
    if (sampleCreated) sql(`BEGIN; DELETE FROM public.money_entries WHERE id='${moneyId}';
      DELETE FROM public.sep28_crystal_awards WHERE user_id='${user}' AND kind='goal' AND source_key='${key}';
      DELETE FROM public.sep28_crystal_preferences WHERE user_id='${user}';
      DELETE FROM public.ai_privacy_preferences WHERE user_id='${user}'; COMMIT;`);
    fs.rmSync(backupDir,{recursive:true,force:true});
  }
}
if (process.argv[1]?.endsWith('/issue18-synthetic-backup-restore.mjs')) {
  console.error('Use the dedicated guarded Issue #19 rehearsal integration test; no standalone backup endpoint.');
  process.exitCode = 1;
}
