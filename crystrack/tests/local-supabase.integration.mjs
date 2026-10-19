/** Real LOCAL Supabase Auth/REST/Storage/PostgreSQL tests. Never reads a remote URL. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { localSql, readLocalKeys } from '../scripts/local-supabase.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const keys = readLocalKeys(); // Verifies Docker target and fixed loopback URL first.
const roleSql = (uid, sql) => localSql(`BEGIN; SET LOCAL ROLE authenticated;
 SET LOCAL request.jwt.claims='{"sub":"${uid}","role":"authenticated"}'; ${sql}; COMMIT;`);
const count = (sql) => Number(localSql(sql).split('\n').at(-1));
const fails = (fn) => assert.throws(fn, /psql|docker/);

test('six historical files, daily records and crystal migration applied once with matching local hashes', () => {
  const inventory=localSql('SELECT name,hash FROM crystrack_local_control.applied ORDER BY name').split('\n');
  assert.equal(inventory.length,9);
  for(const row of inventory) {
    const [name,hash]=row.split('|');
    assert.equal(hash,createHash('sha256').update(fs.readFileSync('src/db/migrations/'+name)).digest('hex'));
  }
  assert.equal(count("SELECT count(*) FROM pg_policies WHERE schemaname='public'" ) > 10, true);
  assert.equal(count("SELECT count(*) FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname='task_status' AND e.enumlabel='skipped'"), 1);
});

test('synthetic routines include completed/skipped/pending and owner RLS isolates rows', () => {
  const statuses = roleSql(A, "SELECT string_agg(status::text,',' ORDER BY status::text) FROM task_occurrences");
  assert.match(statuses, /completed,pending,skipped/);
  assert.equal(Number(roleSql(A, 'SELECT count(*) FROM recurring_tasks').split('\n').at(-1)), 3);
  assert.equal(Number(roleSql(B, 'SELECT count(*) FROM recurring_tasks').split('\n').at(-1)), 1);
  fails(() => roleSql(A, `INSERT INTO recurring_tasks(user_id,title) VALUES('${B}','Forbidden synthetic row')`));
  assert.equal(count(`SELECT count(*) FROM recurring_tasks WHERE title='Forbidden synthetic row'`), 0);
});

test('anonymous role cannot see seeded owner records', () => {
  assert.equal(Number(localSql('BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM recurring_tasks; COMMIT;').split('\n').at(-1)), 0);
  fails(() => localSql('BEGIN; SET LOCAL ROLE anon; SELECT * FROM crystrack_daily_draft.days; COMMIT;'));
});

test('real local Auth and REST support synthetic signup and reject cross-owner writes', async () => {
  const client = createClient(keys.NEXT_PUBLIC_SUPABASE_URL, keys.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.auth.signUp({ email: `local-${randomUUID()}@example.invalid`, password: randomUUID() + 'aA1!' });
  assert.equal(error, null);
  assert.ok(data.session && data.user);
  const own = await client.from('recurring_tasks').insert({ user_id: data.user.id, title: 'Synthetic HTTP routine' }).select();
  assert.equal(own.error, null);
  assert.equal(own.data.length, 1);
  const foreign = await client.from('recurring_tasks').insert({ user_id: B, title: 'Forbidden HTTP routine' });
  assert.ok(foreign.error);
  const invisible = await client.from('recurring_tasks').select('id').eq('user_id', A);
  assert.equal(invisible.error, null);
  assert.deepEqual(invisible.data, []);
  // Real local private bucket + policies, with an entirely synthetic 1-pixel PNG.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64');
  const uploaded = await client.storage.from('profile-avatars').upload(`${data.user.id}/synthetic.png`, png, { contentType: 'image/png' });
  assert.equal(uploaded.error, null);
  const forbidden = await client.storage.from('profile-avatars').upload(`${B}/synthetic.png`, png, { contentType: 'image/png' });
  assert.ok(forbidden.error);
  assert.equal((await client.auth.signOut()).error, null);
});

function insertDay(date, expected, evidence = 'incomplete') {
  localSql(`INSERT INTO crystrack_daily_draft.days(user_id,day_key,timezone,evidence,expected_count,closes_at)
    VALUES('${A}','${date}','Africa/Lagos','${evidence}',${expected},('${date}'::date+1)::timestamp AT TIME ZONE 'Africa/Lagos')`);
}

test('draft refuses verified partial snapshots and rolls back the whole assembly', () => {
  localSql("DELETE FROM crystrack_daily_draft.days WHERE user_id='" + A + "' AND day_key='2026-10-10'");
  fails(() => insertDay('2026-10-10', 2, 'verified'));
  assert.equal(count("SELECT count(*) FROM crystrack_daily_draft.days WHERE day_key='2026-10-10'"), 0);
});

test('draft verifies an explicitly empty day but leaves unverified history incomplete', () => {
  localSql(`DELETE FROM crystrack_daily_draft.days WHERE user_id='${A}' AND day_key IN ('2026-10-11','2026-10-12')`);
  insertDay('2026-10-11', 0, 'verified');
  insertDay('2026-10-12', 0);
  assert.equal(localSql("SELECT evidence FROM crystrack_daily_draft.days WHERE day_key='2026-10-11'"), 'verified');
  assert.equal(localSql("SELECT evidence FROM crystrack_daily_draft.days WHERE day_key='2026-10-12'"), 'incomplete');
  assert.equal(count("SELECT count(*) FROM crystrack_daily_draft.days WHERE day_key='2026-10-13'"), 0);
});

test('draft retains eligibility after real routine deletion; closure freezes facts', () => {
  // Unique synthetic dates make the test repeatable without deleting closed facts.
  const key = randomUUID();
  const owner = randomUUID();
  localSql(`INSERT INTO auth.users(id,email) VALUES('${owner}','${owner}@example.invalid');
    INSERT INTO recurring_tasks(id,user_id,title) VALUES('${key}','${owner}','Delete this synthetic definition');
    BEGIN;
    INSERT INTO crystrack_daily_draft.days(user_id,day_key,timezone,evidence,expected_count,closes_at)
     VALUES('${owner}','2026-10-16','Africa/Lagos','verified',1,'2026-10-16T23:00:00Z');
    INSERT INTO crystrack_daily_draft.routines(user_id,day_key,routine_key,schedule_version,status,completed_at)
     VALUES('${owner}','2026-10-16','${key}',1,'completed','2026-10-16T10:00:00Z');
    COMMIT;
    DELETE FROM recurring_tasks WHERE id='${key}';`);
  assert.equal(count(`SELECT count(*) FROM crystrack_daily_draft.routines WHERE routine_key='${key}'`), 1);
  fails(() => localSql(`UPDATE crystrack_daily_draft.days SET expected_count=0 WHERE user_id='${owner}'`));
  localSql(`UPDATE crystrack_daily_draft.days SET close_status='closed',closed_at='2026-10-16T23:00:00Z' WHERE user_id='${owner}'`);
  fails(() => localSql(`UPDATE crystrack_daily_draft.routines SET status='pending',completed_at=NULL WHERE routine_key='${key}'`));
  fails(() => localSql(`DELETE FROM crystrack_daily_draft.routines WHERE routine_key='${key}'`));
});

test('draft notes enforce ownership, one note per user/day, size and snapshot write denial', () => {
  roleSql(A, `INSERT INTO crystrack_daily_draft.notes(user_id,day_key,body) VALUES('${A}','2026-10-18','Synthetic note')
    ON CONFLICT(user_id,day_key) DO UPDATE SET body=excluded.body`);
  assert.match(roleSql(A, 'SELECT body FROM crystrack_daily_draft.notes'), /Synthetic note/);
  assert.equal(Number(roleSql(B, 'SELECT count(*) FROM crystrack_daily_draft.notes').split('\n').at(-1)), 0);
  fails(() => roleSql(B, `INSERT INTO crystrack_daily_draft.notes(user_id,day_key,body) VALUES('${A}','2026-10-19','No')`));
  fails(() => roleSql(A, `INSERT INTO crystrack_daily_draft.notes(user_id,day_key,body) VALUES('${A}','2026-10-18','Duplicate')`));
  fails(() => roleSql(A, `UPDATE crystrack_daily_draft.notes SET body=repeat('a',4001)`));
  fails(() => roleSql(A, `UPDATE crystrack_daily_draft.days SET evidence='verified'`));
});

test('SQL midnight constraints cover 23/25-hour DST days and reject wrong boundaries', () => {
  const hours = localSql("SELECT extract(epoch FROM (('2026-03-09'::timestamp AT TIME ZONE 'America/New_York')-('2026-03-08'::timestamp AT TIME ZONE 'America/New_York')))/3600");
  assert.equal(Number(hours), 23);
  assert.equal(Number(localSql("SELECT extract(epoch FROM (('2026-11-02'::timestamp AT TIME ZONE 'America/New_York')-('2026-11-01'::timestamp AT TIME ZONE 'America/New_York')))/3600")), 25);
  fails(() => localSql(`INSERT INTO crystrack_daily_draft.days(user_id,day_key,timezone,expected_count,closes_at)
    VALUES('${A}','2026-03-08','America/New_York',0,'2026-03-09T05:00:00Z')`));
});

test('stored draft snapshots feed Piece 2A without inventing unknown historical days', async () => {
  const source = fs.readFileSync('src/lib/daily-streak.ts', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  const { calculateDailyStreak } = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(compiled.outputText));
  const rows = JSON.parse(localSql(`SELECT json_agg(json_build_object('date',day_key,'evidence',evidence,
    'scheduledRoutineIds',ARRAY[]::text[],'outcomes',ARRAY[]::text[]) ORDER BY day_key)
    FROM crystrack_daily_draft.days WHERE user_id='${A}' AND day_key BETWEEN '2026-10-11' AND '2026-10-12'`));
  const result = calculateDailyStreak({ timezone: 'Africa/Lagos', now: new Date('2026-10-14T10:00:00Z'),
    coverageStart: '2026-10-11', historyFromBeginning: false, snapshots: rows });
  assert.equal(result.current.value, null);
  assert.deepEqual(result.coverage.unknownDates, ['2026-10-12','2026-10-13']);
  assert.equal(result.best.status, 'partial');
});

test('no financial fixture records were created', () => {
  for (const table of ['money_entries','finance_targets','wealth_debts','wealth_expected_flows']) {
    assert.equal(count('SELECT count(*) FROM ' + table), 0);
  }
});
