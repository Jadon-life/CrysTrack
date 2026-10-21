/** Synthetic local Docker target only. No caller-supplied connection settings. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { localSql, readLocalKeys, assertTarget, ROOT } from '../scripts/local-supabase.mjs';
import { localEnvironment, DOCKER_SOCKET, PROJECT } from '../scripts/local-supabase-policy.mjs';
const q = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const role = (u, sql) =>
  `BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${sql};COMMIT;`;
const owner = (u, sql) => localSql(role(u, sql));
const json = (u, expr) =>
  JSON.parse(
    owner(u, 'SELECT ' + expr)
      .split('\n')
      .at(-1),
  );
const scalar = (sql) => localSql(sql).split('\n').at(-1);
const clock = (instant) =>
  localSql(
    `CREATE OR REPLACE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT ${q(instant)}::timestamptz $$`,
  );
after(() =>
  localSql(
    "CREATE OR REPLACE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT clock_timestamp() $$",
  ),
);
const context = (u) => json(u, 'daily_context()');
const read = (u, { from = null, after = null, limit = 25, filter = 'all', revision = null } = {}) =>
  json(
    u,
    `daily_read_week(${from ? q(from) : 'NULL'},${after ? q(after) : 'NULL'},${limit},${q(filter)},${revision ? q(revision) : 'NULL'})`,
  );
function fixture({ zone = 'Africa/Lagos', instant = '2026-09-20T12:00:00Z', routines = 1 } = {}) {
  clock(instant);
  const u = randomUUID();
  localSql(
    `INSERT INTO auth.users(id,email) VALUES('${u}','${u}@example.invalid');INSERT INTO profiles(user_id,timezone) VALUES('${u}',${q(zone)});`,
  );
  context(u);
  json(u, 'sep28_crystal_state()');
  const ids = [];
  for (let i = 0; i < routines; i++) {
    const id = randomUUID();
    ids.push(id);
    owner(
      u,
      `INSERT INTO recurring_tasks(id,user_id,title) VALUES('${id}','${u}','Synthetic routine ${i}');INSERT INTO task_schedules(task_id,weekday) SELECT '${id}',generate_series(0,6)`,
    );
  }
  return { u, ids };
}
const outcome = (u, id, status, revision = 1, requestId = randomUUID(), day = context(u).day) =>
  json(u, `daily_set_outcome('${day}','${id}',${q(status)},${revision},'${requestId}')`);
const cell = (view, id, day) => view.rows.find((r) => r.id === id).cells.find((c) => c.day === day);
const concurrent = (sql) => {
  assertTarget();
  return new Promise((resolve) => {
    const child = spawn(
      'docker',
      [
        '--host',
        DOCKER_SOCKET,
        'exec',
        '-i',
        'supabase_db_' + PROJECT,
        'psql',
        '-h',
        '127.0.0.1',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-Atq',
      ],
      { cwd: ROOT, env: localEnvironment(process.env), stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.resume();
    child.on('exit', (code) => resolve({ code, out }));
    child.stdin.end(sql);
  });
};
test('owner-bound week reads deny anonymous/service/private access and cannot expose foreign routines', () => {
  const {
      u,
      ids: [id],
    } = fixture(),
    { u: other } = fixture();
  clock('2026-09-21T12:00:00Z');
  context(u);
  context(other);
  assert.ok(read(u).rows.some((r) => r.id === id));
  assert.ok(read(other).rows.every((r) => r.id !== id));
  for (const roleName of ['anon', 'service_role'])
    assert.throws(() => localSql(`BEGIN;SET LOCAL ROLE ${roleName};SELECT daily_read_week();COMMIT;`));
  assert.throws(() => owner(u, `SELECT crystrack_daily.week_zone('${other}','2026-09-21')`));
  for (const input of [
    { from: '2026-09-21' },
    { from: '2020-01-05' },
    { from: '2030-01-06' },
    { limit: 51 },
    { limit: 0 },
    { filter: 'other' },
    { after: id },
  ])
    assert.throws(() => read(u, input));
});
test('past completed/skipped/missed come from complete durable evidence; installation and partial remain unverified', () => {
  const {
    u,
    ids: [a, b, c],
  } = fixture({ routines: 3 });
  clock('2026-09-21T12:00:00Z');
  context(u);
  outcome(u, a, 'completed');
  outcome(u, b, 'skipped');
  clock('2026-09-22T12:00:00Z');
  context(u);
  let view = read(u);
  assert.equal(cell(view, a, '2026-09-21').state, 'completed');
  assert.equal(cell(view, b, '2026-09-21').state, 'skipped');
  assert.equal(cell(view, c, '2026-09-21').state, 'missed');
  assert.equal(view.days[0].count, null);
  assert.ok(view.rows.every((r) => r.cells[0].state === 'unverified'));
  outcome(u, a, 'completed');
  localSql(`UPDATE daily_records SET evidence='incomplete' WHERE user_id='${u}' AND day_key='2026-09-22'`);
  clock('2026-09-23T12:00:00Z');
  context(u);
  view = read(u);
  assert.ok(view.rows.every((r) => r.cells[2].state === 'unverified'));
  assert.equal(view.days[2].count, null);
});
test('missing history is explicit and verified empty is neutral even with no routine rows', () => {
  const { u } = fixture({ routines: 0 });
  clock('2026-09-22T12:00:00Z');
  context(u);
  const view = read(u);
  assert.deepEqual(view.rows, []);
  assert.equal(view.days[1].evidence, 'verified');
  assert.equal(view.days[1].count, 0);
  const previous = read(u, { from: '2026-09-13' });
  assert.ok(previous.days.every((d) => d.evidence === 'missing' && d.count === null));
});
test('future eligibility uses effective versions, weekday and inclusive start/exclusive end; metadata does not rewrite history', () => {
  const {
    u,
    ids: [id],
  } = fixture();
  clock('2026-09-21T12:00:00Z');
  context(u);
  outcome(u, id, 'completed');
  clock('2026-09-22T12:00:00Z');
  context(u);
  const before = read(u);
  owner(
    u,
    `UPDATE recurring_tasks SET title='New planned name' WHERE id='${id}';UPDATE task_schedules SET start_date='2026-09-24T23:00:00Z',end_date='2026-09-25T23:00:00Z' WHERE task_id='${id}'`,
  );
  const view = read(u);
  assert.equal(cell(view, id, '2026-09-21').title, 'Synthetic routine 0');
  assert.equal(cell(view, id, '2026-09-22').title, 'Synthetic routine 0');
  assert.equal(cell(view, id, '2026-09-23').state, 'not_scheduled');
  assert.equal(cell(view, id, '2026-09-25').state, 'planned');
  assert.equal(cell(view, id, '2026-09-25').title, 'New planned name');
  assert.equal(cell(view, id, '2026-09-26').state, 'not_scheduled');
  assert.notEqual(view.revision, before.revision);
  assert.equal(
    scalar(`SELECT count(*) FROM daily_records WHERE user_id='${u}' AND day_key>'2026-09-22'`),
    '0',
  );
});
test('hard-deleted routine retains verified names/outcomes and today membership but has no future plan', () => {
  const {
    u,
    ids: [id],
  } = fixture();
  clock('2026-09-21T12:00:00Z');
  context(u);
  outcome(u, id, 'completed');
  clock('2026-09-22T12:00:00Z');
  context(u);
  owner(u, `DELETE FROM recurring_tasks WHERE id='${id}'`);
  let view = read(u);
  assert.equal(view.rows[0].active, false);
  assert.equal(view.rows[0].nameSource, 'recorded');
  assert.equal(cell(view, id, '2026-09-21').state, 'completed');
  assert.equal(cell(view, id, '2026-09-22').editable, true);
  assert.equal(cell(view, id, '2026-09-23').state, 'not_scheduled');
  assert.equal(read(u, { filter: 'active' }).rows.length, 0);
  assert.equal(read(u, { filter: 'history' }).rows.length, 1);
  outcome(u, id, 'completed');
  view = read(u);
  assert.equal(cell(view, id, '2026-09-22').state, 'completed');
});
test('1,001 children are complete globally while routine rows are keyset-paged and never duplicated/truncated', () => {
  const { u } = fixture({ routines: 0 });
  localSql(
    `INSERT INTO routine_schedule_versions(user_id,routine_key,version,effective_from,enabled,title,schedule,created_at) SELECT '${u}',gen_random_uuid(),1,'2026-09-21',true,'Large synthetic history','[{"weekday":1}]',crystrack_daily.clock() FROM generate_series(1,1001)`,
  );
  clock('2026-09-21T12:00:00Z');
  context(u);
  let view = read(u, { limit: 50 });
  const revision = view.revision;
  assert.equal(view.days[1].evidence, 'verified');
  assert.equal(view.days[1].count, 1001);
  const ids = [];
  for (;;) {
    ids.push(...view.rows.map((r) => r.id));
    assert.ok(view.rows.length <= 50);
    if (!view.nextCursor) break;
    view = read(u, { limit: 50, after: view.nextCursor, revision });
  }
  assert.equal(ids.length, 1001);
  assert.equal(new Set(ids).size, 1001);
  const future = read(u, { from: '2026-09-27' });
  assert.equal(future.rows[0].cells[1].state, 'planned');
  assert.equal(
    scalar(`SELECT count(*) FROM daily_records WHERE user_id='${u}' AND day_key>'2026-09-21'`),
    '0',
  );
});
test('pagination detects outcome and schedule changes; event deletion is not outcome evidence; undo revokes the source', () => {
  const {
    u,
    ids: [id],
  } = fixture({ routines: 2 });
  clock('2026-09-21T12:00:00Z');
  context(u);
  const first = read(u, { limit: 1 });
  outcome(u, id, 'completed');
  assert.throws(() => read(u, { after: first.nextCursor, revision: first.revision }));
  let view = read(u);
  assert.equal(cell(view, id, '2026-09-21').state, 'completed');
  const token = view.revision;
  owner(u, `DELETE FROM activity_events WHERE user_id='${u}' AND entity_id='${id}'`);
  assert.equal(cell(read(u), id, '2026-09-21').state, 'completed');
  owner(u, `UPDATE recurring_tasks SET title='New future metadata' WHERE id='${id}'`);
  assert.throws(() => read(u, { revision: token }));
  outcome(u, id, 'pending', 2);
  view = read(u);
  assert.equal(cell(view, id, '2026-09-21').state, 'pending');
  assert.equal(json(u, 'sep28_crystal_state()').total, '0');
});
test('concurrent desired outcomes conflict safely, repeat requests replay, grid reflects authoritative revision', async () => {
  const {
    u,
    ids: [id],
  } = fixture();
  clock('2026-09-21T12:00:00Z');
  context(u);
  const key = randomUUID();
  const sql = (status) =>
    role(
      u,
      `SELECT daily_set_outcome('2026-09-21','${id}','${status}',1,'${status === 'completed' ? key : randomUUID()}')`,
    );
  const result = await Promise.all([concurrent(sql('completed')), concurrent(sql('skipped'))]);
  assert.equal(result.filter((r) => r.code === 0).length, 1);
  const view = read(u);
  const current = cell(view, id, '2026-09-21');
  assert.equal(current.revision, 2);
  assert.ok(['completed', 'skipped'].includes(current.state));
  if (current.state === 'completed') {
    outcome(u, id, 'completed', 1, key);
    assert.equal(cell(read(u), id, '2026-09-21').revision, 2);
    assert.equal(json(u, 'sep28_crystal_state()').total, '5');
  } else assert.equal(json(u, 'sep28_crystal_state()').total, '0');
  assert.equal(
    scalar(`SELECT count(*) FROM activity_events WHERE user_id='${u}' AND entity_type='task'`),
    '1',
  );
});
test('saved-zone weeks cross leap/year boundaries and DST without confusing server UTC today', () => {
  const { u } = fixture({ zone: 'America/New_York', instant: '2026-03-07T12:00:00Z' });
  clock('2026-03-09T00:30:00Z');
  let view = read(u);
  assert.equal(view.context.day, '2026-03-08');
  assert.equal(view.from, '2026-03-08');
  assert.equal(view.to, '2026-03-14');
  assert.equal(
    scalar(
      `SELECT extract(epoch FROM(closes_at-opens_at))/3600 FROM daily_records WHERE user_id='${u}' AND day_key='2026-03-08'`,
    ),
    '23.0000000000000000',
  );
  const leap = fixture({ instant: '2028-02-28T12:00:00Z' });
  clock('2028-02-29T12:00:00Z');
  view = read(leap.u);
  assert.equal(view.from, '2028-02-27');
  assert.equal(view.days[2].day, '2028-02-29');
  assert.equal(view.to, '2028-03-04');
  const year = fixture({ instant: '2027-01-01T12:00:00Z', routines: 0 });
  assert.equal(read(year.u).from, '2026-12-27');
});
test('pending/applied timezone date gaps stay unverified and historical column zones are preserved', () => {
  const {
    u,
    ids: [id],
  } = fixture({ zone: 'Pacific/Honolulu', instant: '2026-09-20T12:00:00Z' });
  clock('2026-09-21T12:00:00Z');
  context(u);
  outcome(u, id, 'completed');
  const transition = json(u, "daily_request_timezone('Pacific/Kiritimati',1)");
  let view = read(u);
  assert.equal(view.days[2].evidence, 'unavailable');
  assert.equal(cell(view, id, '2026-09-22').state, 'unverified');
  assert.equal(view.days[3].timezone, 'Pacific/Kiritimati');
  clock(transition.effective_at);
  view = read(u);
  assert.equal(view.context.day, '2026-09-23');
  assert.equal(view.days[2].evidence, 'missing');
  assert.equal(view.days[2].count, null);
  assert.equal(view.days[1].timezone, 'Pacific/Honolulu');
  assert.equal(cell(view, id, '2026-09-21').state, 'completed');
});
test('real local Auth/PostgREST validates owner read ACL; grid reads do not change finance or invent task/day shards', async () => {
  const keys = readLocalKeys(),
    admin = createClient(keys.NEXT_PUBLIC_SUPABASE_URL, keys.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    client = createClient(keys.NEXT_PUBLIC_SUPABASE_URL, keys.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const email = `week-http-${randomUUID()}@example.invalid`,
    password = randomUUID() + 'Aa1!';
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(error, null);
  const u = data.user.id;
  clock('2026-09-21T12:00:00Z');
  localSql(`INSERT INTO profiles(user_id,timezone) VALUES('${u}','Africa/Lagos')`);
  context(u);
  json(u, 'sep28_crystal_state()');
  const money = scalar("SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id)::text,'[]') FROM money_entries m");
  assert.equal((await client.auth.signInWithPassword({ email, password })).error, null);
  const result = await client.rpc('daily_read_week');
  assert.equal(result.error, null);
  assert.equal(result.data.context.timezone, 'Africa/Lagos');
  assert.deepEqual(result.data.rows, []);
  assert.equal(json(u, 'sep28_crystal_state()').total, '0');
  assert.equal(
    scalar("SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id)::text,'[]') FROM money_entries m"),
    money,
  );
  await client.auth.signOut();
  assert.ok((await client.rpc('daily_read_week')).error);
});
