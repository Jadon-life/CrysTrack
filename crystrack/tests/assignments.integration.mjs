/** Disposable synthetic Docker data ONLY. No caller target or hosted env accepted. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { localSql, assertTarget, ROOT } from '../scripts/local-supabase.mjs';
import { localEnvironment, DOCKER_SOCKET, PROJECT } from '../scripts/local-supabase-policy.mjs';
const q = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const sqlRole = (u, sql) =>
  `BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${sql};COMMIT;`;
const owner = (u, sql) => localSql(sqlRole(u, sql));
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
function fixture(zone = 'Africa/Lagos') {
  const u = randomUUID();
  localSql(
    `INSERT INTO auth.users(id,email) VALUES('${u}','${u}@example.invalid');INSERT INTO profiles(user_id,timezone,scheduling_timezone) VALUES('${u}','UTC',${q(zone)});`,
  );
  json(u, 'sep28_crystal_state()');
  return u;
}
const fields = (extra = {}) => ({
  title: 'Synthetic assignment',
  description: 'Local test only',
  deadline: '2026-09-28T10:00:00Z',
  priority: 'medium',
  category: 'MTH 101',
  reminder_config: { enabled: true, channels: ['push', 'telegram'], offsetMinutes: [1440, 120, 0] },
  timezone: 'Africa/Lagos',
  ...extra,
});
const call = (u, action, id, rev = null, f = {}) =>
  json(u, `assignment_mutate(${q(action)},'${id}',${rev ?? 'NULL'},${q(JSON.stringify(f))}::jsonb)`);
const create = (u, f = fields(), id = randomUUID()) => call(u, 'create', id, null, f);
const list = (u, filter = {}) => json(u, `assignment_list(${q(JSON.stringify(filter))})`);
const total = (u) => json(u, 'sep28_crystal_state()').total;
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
test('owner isolation, denied direct DML/private helpers/service claims and forged fields', () => {
  clock('2026-09-28T09:00:00Z');
  const u = fixture(),
    other = fixture(),
    a = create(u);
  assert.equal(list(other).items.length, 0);
  for (const action of ['edit', 'complete']) assert.throws(() => call(other, action, a.id, 1, fields()));
  assert.deepEqual(call(other, 'delete', a.id, 1), { ok: true, deletedId: a.id });
  assert.equal(list(u).items.length, 1);
  for (const sql of [
    `UPDATE assignments SET status='completed',completed_at=now() WHERE id='${a.id}'`,
    `DELETE FROM assignments WHERE id='${a.id}'`,
    `INSERT INTO assignments(user_id,title,deadline) VALUES('${u}','Bypass',now())`,
    `SELECT assignment_claim_reminder('${a.id}',1,0)`,
    `SELECT crystrack_assignments.zone('${other}')`,
  ])
    assert.throws(() => owner(u, sql));
  assert.throws(() => localSql(`BEGIN;SET LOCAL ROLE anon;SELECT assignment_list();COMMIT;`));
  for (const extra of [{ shards: 30 }, { user_id: other }, { completed_at: '2026-09-28' }])
    assert.throws(() => create(u, fields(extra)));
  assert.equal(total(u), '0');
});
test('create retry one source/plan; edit revision conflict and atomic reminder replacement', () => {
  clock('2026-09-28T09:00:00Z');
  const u = fixture(),
    id = randomUUID();
  const a = create(u, fields(), id);
  assert.deepEqual(create(u, fields(), id), a);
  assert.equal(scalar(`SELECT count(*) FROM reminders WHERE entity_id='${id}'`), '3');
  const updated = call(
    u,
    'edit',
    id,
    1,
    fields({
      deadline: '2026-09-30T12:00:00Z',
      reminder_config: { enabled: true, channels: ['telegram'], offsetMinutes: [60, 0] },
    }),
  );
  assert.equal(updated.revision, 2);
  assert.equal(updated.reminder_version, 2);
  assert.equal(scalar(`SELECT count(*) FROM reminders WHERE entity_id='${id}'`), '2');
  assert.equal(
    scalar(
      `SELECT bool_and(channels=ARRAY['telegram']::text[] AND scheduled_for IN ('2026-09-30T11:00:00Z','2026-09-30T12:00:00Z')) FROM reminders WHERE entity_id='${id}'`,
    ),
    't',
  );
  assert.throws(() => call(u, 'edit', id, 1, fields()));
  assert.throws(() => call(u, 'delete', id, 1));
  assert.throws(() => call(u, 'complete', id, 1));
  assert.throws(() => call(u, 'edit', id, 2, fields({ timezone: 'UTC' })));
  assert.equal(list(u).items[0].deadline, updated.deadline);
  const noSchedule = call(
    u,
    'edit',
    id,
    2,
    fields({
      title: 'Metadata only',
      deadline: '2026-09-30T12:00:00Z',
      reminder_config: { enabled: true, channels: ['telegram'], offsetMinutes: [60, 0] },
    }),
  );
  assert.equal(noSchedule.reminder_version, 2);
  const disabled = call(
    u,
    'edit',
    id,
    3,
    fields({ reminder_config: { enabled: false, channels: ['push'], offsetMinutes: [] } }),
  );
  assert.equal(disabled.reminder_version, 3);
  assert.equal(scalar(`SELECT count(*) FROM reminders WHERE entity_id='${id}' AND status='pending'`), '0');
});
test('late completion persists actual instant/event/+30 once; replay/delete revokes atomically', () => {
  clock('2026-09-28T10:00:01Z');
  const u = fixture(),
    a = create(u);
  const finished = call(u, 'complete', a.id, 1);
  assert.equal(finished.completed_at, '2026-09-28T10:00:01+00:00');
  assert.equal(finished.deadline, a.deadline);
  assert.equal(total(u), '30');
  assert.deepEqual(call(u, 'complete', a.id, 1), finished);
  assert.equal(total(u), '30');
  assert.equal(list(u).items.length, 0);
  const history = list(u, { state: 'completed' });
  assert.equal(history.items[0].computed_status, 'finished_late');
  assert.equal(
    scalar(`SELECT count(*) FROM activity_events WHERE entity_id='${a.id}' AND type='assignment_completed'`),
    '1',
  );
  assert.equal(scalar(`SELECT count(*) FROM reminders WHERE entity_id='${a.id}' AND status='pending'`), '0');
  assert.throws(() => call(u, 'edit', a.id, 2, fields({ deadline: '2030-01-01T00:00:00Z' })));
  assert.throws(() => call(u, 'undo', a.id, 2));
  call(u, 'delete', a.id, 2);
  assert.equal(total(u), '0');
  assert.throws(() => create(u, fields(), a.id));
  assert.deepEqual(call(u, 'delete', a.id, 2), { ok: true, deletedId: a.id });
  for (const table of ['activity_events', 'reminders', 'reminder_deliveries'])
    assert.equal(scalar(`SELECT count(*) FROM ${table} WHERE entity_id='${a.id}'`), '0');
  assert.equal(
    scalar(
      `SELECT array_agg(delta ORDER BY created_at)::text FROM sep28_crystal_events WHERE user_id='${u}'`,
    ),
    '{30,-30}',
  );
});
test('equality completes on time; saved-zone midnight/week/leap and DST classification', () => {
  clock('2026-09-28T10:00:00Z');
  const u = fixture(),
    a = create(u);
  call(u, 'complete', a.id, 1);
  assert.equal(list(u, { state: 'completed' }).items[0].computed_status, 'completed_on_time');
  clock('2026-09-28T22:30:00Z');
  create(u, fields({ title: 'Today', deadline: '2026-09-28T22:45:00Z' }));
  create(u, fields({ title: 'Tomorrow', deadline: '2026-09-28T23:30:00Z' }));
  assert.deepEqual(
    list(u, { state: 'due_today' }).items.map((a) => a.title),
    ['Today'],
  );
  assert.equal(list(u).week[0].count, 1);
  assert.equal(list(u).week[1].count, 1);
  clock('2028-02-28T23:30:00Z');
  create(u, fields({ title: 'Leap', deadline: '2028-02-29T22:00:00Z' }));
  assert.equal(list(u, { state: 'due_today' }).items[0].title, 'Leap');
  const ny = fixture('America/New_York');
  clock('2026-03-08T05:30:00Z');
  create(ny, fields({ timezone: 'America/New_York', deadline: '2026-03-09T03:30:00Z' }));
  assert.equal(list(ny).items[0].computed_status, 'due_today');
  clock('2026-11-01T05:00:00Z');
  const fold = create(ny, fields({ timezone: 'America/New_York', deadline: '2026-11-01T05:30:00Z' }));
  clock('2026-11-01T06:15:00Z');
  call(ny, 'complete', fold.id, 1);
  assert.equal(list(ny, { state: 'completed' }).items[0].computed_status, 'finished_late');
});
test('bounded stable pagination, filters, search literal characters, date range and sorting', () => {
  clock('2026-09-28T09:00:00Z');
  const u = fixture();
  for (let i = 0; i < 5; i++)
    create(
      u,
      fields({
        title: `Course ${i}`,
        deadline: `2026-09-${28 + (i % 3)}T12:00:00Z`,
        priority: i === 0 ? 'urgent' : 'medium',
        category: i % 2 ? 'PHY 101' : 'MTH 101',
      }),
    );
  const first = list(u, { limit: 2 }),
    second = list(u, { limit: 2, page: 1 }),
    third = list(u, { limit: 2, page: 2 });
  assert.equal(first.hasMore, true);
  assert.equal(third.hasMore, false);
  assert.equal(new Set([...first.items, ...second.items, ...third.items].map((a) => a.id)).size, 5);
  assert.equal(list(u, { search: 'Course', category: 'PHY', priority: 'medium' }).items.length, 2);
  assert.equal(list(u, { search: '%' }).items.length, 0);
  assert.equal(list(u, { from: '2026-09-29', to: '2026-09-29' }).items.length, 2);
  assert.deepEqual(
    list(u, { sort: 'desc' }).items.map((a) => a.deadline),
    list(u, { sort: 'asc' })
      .items.map((a) => a.deadline)
      .reverse(),
  );
  assert.throws(() => list(u, { limit: 201 }));
  assert.throws(() => list(u, { page: -1 }));
});
test('concurrent completion is one timestamp/event/award; edit vs completion conflicts without mixed outcomes', async () => {
  clock('2026-09-28T11:00:00Z');
  const u = fixture(),
    a = create(u);
  const expr = `SELECT assignment_mutate('complete','${a.id}',1,'{}')`;
  const result = await Promise.all([concurrent(sqlRole(u, expr)), concurrent(sqlRole(u, expr))]);
  assert.ok(result.every((r) => r.code === 0));
  assert.deepEqual(
    JSON.parse(result[0].out.trim().split('\n').at(-1)),
    JSON.parse(result[1].out.trim().split('\n').at(-1)),
  );
  assert.equal(total(u), '30');
  const b = create(u),
    edit = `SELECT assignment_mutate('edit','${b.id}',1,${q(JSON.stringify(fields({ title: 'Changed' })))}::jsonb)`,
    finish = `SELECT assignment_mutate('complete','${b.id}',1,'{}')`;
  const race = await Promise.all([concurrent(sqlRole(u, edit)), concurrent(sqlRole(u, finish))]);
  assert.equal(race.filter((r) => r.code === 0).length, 1);
  assert.equal(
    scalar(`SELECT count(*) FROM activity_events WHERE entity_id='${a.id}' AND type='assignment_completed'`),
    '1',
  );
});
test('service reminder claims deduplicate, reject stale schedule, and failed integrations can retry', () => {
  const u = fixture(),
    future = new Date(Date.now() + 60 * 60000).toISOString(),
    a = create(
      u,
      fields({
        deadline: future,
        reminder_config: { enabled: true, channels: ['push', 'telegram'], offsetMinutes: [60] },
      }),
    );
  const claim = () =>
    JSON.parse(
      localSql(`BEGIN;SET LOCAL ROLE service_role;SELECT assignment_claim_reminder('${a.id}',1,60);COMMIT;`)
        .split('\n')
        .at(-1) || 'null',
    );
  const first = claim();
  assert.ok(first.id);
  assert.equal(claim(), null);
  localSql(
    `BEGIN;SET LOCAL ROLE service_role;SELECT assignment_finish_delivery('${first.id}','{}',ARRAY['push','telegram'],'Not configured');COMMIT;`,
  );
  assert.equal(scalar(`SELECT status FROM reminder_deliveries WHERE id='${first.id}'`), 'failed');
  assert.equal(scalar(`SELECT count(*) FROM activity_events WHERE entity_id='${a.id}'`), '0');
  assert.equal(claim(), null);
  const b = create(
    u,
    fields({ deadline: future, reminder_config: { enabled: true, channels: ['push'], offsetMinutes: [60] } }),
  );
  localSql(
    `INSERT INTO reminder_deliveries(user_id,entity_type,entity_id,delivery_key,scheduled_for,channels,status,updated_at) VALUES('${u}','assignment','${b.id}','assignment:${b.id}:v1:offset:60',now(),ARRAY['push'],'failed',now()-interval '1 minute')`,
  );
  const retry = JSON.parse(
    localSql(`BEGIN;SET LOCAL ROLE service_role;SELECT assignment_claim_reminder('${b.id}',1,60);COMMIT;`)
      .split('\n')
      .at(-1),
  );
  assert.ok(retry.id);
  assert.equal(scalar(`SELECT attempt_count FROM reminder_deliveries WHERE id='${retry.id}'`), '2');
  const edited = call(
    u,
    'edit',
    a.id,
    1,
    fields({
      deadline: new Date(Date.now() + 3600000).toISOString(),
      reminder_config: { enabled: false, channels: ['push'], offsetMinutes: [60] },
    }),
  );
  assert.equal(edited.reminder_version, 2);
  assert.equal(claim(), null);
  call(u, 'delete', a.id, 2);
  localSql(
    `BEGIN;SET LOCAL ROLE service_role;SELECT assignment_finish_delivery('${first.id}',ARRAY['push'],'{}',NULL);COMMIT;`,
  );
  assert.equal(scalar(`SELECT count(*) FROM activity_events WHERE entity_id='${a.id}'`), '0');
});
test('assignment mutations leave finance totals and other owners unchanged', () => {
  const before = scalar(
    "SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id)::text,'[]') FROM money_entries m",
  );
  const u = fixture(),
    a = create(u);
  call(u, 'edit', a.id, 1, fields({ title: 'Revised' }));
  call(u, 'complete', a.id, 2);
  call(u, 'delete', a.id, 3);
  assert.equal(
    scalar("SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id)::text,'[]') FROM money_entries m"),
    before,
  );
});

test('activity failure rolls back completion, reminder removal and reward together', () => {
  clock('2026-09-28T11:00:00Z');
  const u = fixture(),
    a = create(u);
  assert.throws(() =>
    localSql(
      `BEGIN;CREATE FUNCTION public.assignment_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='assignment' THEN RAISE EXCEPTION 'Synthetic activity failure'; END IF; RETURN NEW; END $$;CREATE TRIGGER assignment_test_failure BEFORE INSERT ON activity_events FOR EACH ROW EXECUTE FUNCTION public.assignment_test_failure();SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${u}","role":"authenticated"}';SELECT assignment_mutate('complete','${a.id}',1,'{}');COMMIT;`,
    ),
  );
  assert.equal(list(u).items[0].status, 'upcoming');
  assert.equal(list(u).items[0].revision, 1);
  assert.equal(total(u), '0');
  assert.equal(scalar(`SELECT count(*) FROM reminders WHERE entity_id='${a.id}' AND status='pending'`), '3');
  assert.equal(scalar(`SELECT to_regprocedure('public.assignment_test_failure()') IS NULL`), 't');
});

test('legacy sent delivery keys remain deduplicated until a deliberate schedule change', () => {
  const u = fixture(),
    deadline = new Date(Date.now() + 3600000).toISOString(),
    a = create(
      u,
      fields({ deadline, reminder_config: { enabled: true, channels: ['push'], offsetMinutes: [60] } }),
    );
  localSql(
    `INSERT INTO reminder_deliveries(user_id,entity_type,entity_id,delivery_key,scheduled_for,channels,sent_channels,status) VALUES('${u}','assignment','${a.id}','assignment:${a.id}:offset:60',now(),ARRAY['push'],ARRAY['push'],'sent')`,
  );
  const claim = (v) =>
    localSql(`BEGIN;SET LOCAL ROLE service_role;SELECT assignment_claim_reminder('${a.id}',${v},60);COMMIT;`)
      .split('\n')
      .at(-1);
  assert.equal(claim(1), '');
  const edited = call(
    u,
    'edit',
    a.id,
    1,
    fields({
      title: 'Metadata only',
      deadline,
      reminder_config: { enabled: true, channels: ['push'], offsetMinutes: [60] },
    }),
  );
  assert.equal(edited.reminder_version, 1);
  assert.equal(claim(1), '');
  const changed = call(
    u,
    'edit',
    a.id,
    2,
    fields({
      deadline: new Date(Date.now() + 3599000).toISOString(),
      reminder_config: { enabled: true, channels: ['push'], offsetMinutes: [60] },
    }),
  );
  assert.equal(changed.reminder_version, 2);
  assert.ok(JSON.parse(claim(2)).id);
});
test('legacy completion missing its finish timestamp is explicitly unknown, never fabricated on time', () => {
  clock('2026-09-28T11:00:00Z');
  const u = fixture();
  localSql(
    `INSERT INTO assignments(user_id,title,deadline,status) VALUES('${u}','Legacy finish','2026-09-28T10:00:00Z','completed')`,
  );
  assert.equal(list(u, { state: 'completed' }).items[0].computed_status, 'completion_unknown');
  assert.equal(total(u), '0');
});

test('channel/offset reordering is metadata, not a new notification schedule; tombstones are private', () => {
  clock('2026-09-28T09:00:00Z');
  const u = fixture(),
    a = create(u);
  const edited = call(
    u,
    'edit',
    a.id,
    1,
    fields({
      reminder_config: { enabled: true, channels: ['telegram', 'push'], offsetMinutes: [0, 120, 1440] },
    }),
  );
  assert.equal(edited.reminder_version, 1);
  assert.throws(() => owner(u, `SELECT * FROM crystrack_assignments.identities`));
  assert.throws(() => owner(u, `DELETE FROM crystrack_assignments.identities WHERE id='${a.id}'`));
  call(u, 'delete', a.id, 2);
  assert.throws(() => create(u, fields(), a.id));
});
