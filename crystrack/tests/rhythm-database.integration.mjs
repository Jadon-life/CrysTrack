// Explicit local-only suite: node --test tests/goals-database.integration.mjs
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const name = `crystrack-rhythm-test-${process.pid}`;
const owner = '00000000-0000-4000-8000-000000000001',
  other = '00000000-0000-4000-8000-000000000002';
function docker(args, input) {
  const result = spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 30000,
  });
  if (result.error) throw result.error;
  return result;
}
function sql(query, user = owner, fail = false) {
  const result = docker(
    [
      'exec',
      '-i',
      name,
      'psql',
      '-h',
      '127.0.0.1',
      '-U',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
    ],
    user
      ? `SET ROLE authenticated;SET request.jwt.claim.sub='${user}';${query}`
      : query,
  );
  if (!fail) assert.equal(result.status, 0, result.stderr);
  return result;
}
function value(result) {
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
}
before(async () => {
  const started = docker([
    'run',
    '--rm',
    '--detach',
    '--name',
    name,
    '--network',
    'none',
    '--tmpfs',
    '/var/lib/postgresql/data',
    '-e',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr);
  let ready = false;
  for (let i = 0; i < 50; i++) {
    if (
      docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'])
        .status === 0
    ) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(ready, 'PostgreSQL became ready');
  sql(readFileSync('tests/helpers/goals-db-bootstrap.sql', 'utf8'), null);
  sql(readFileSync('tests/helpers/rhythm-db-extra.sql', 'utf8'), null);
  const migration = readFileSync(
    'src/db/migrations/0008_daily_rhythm.sql',
    'utf8',
  );
  sql(migration, null);
  sql(migration, null);
});
after(() => docker(['rm', '--force', name]));
const task = '10000000-0000-4000-8000-000000000001',
  foreignTask = '10000000-0000-4000-8000-000000000002';
function box(id, day, start, minutes = 30, user = owner, fail = false) {
  return sql(
    `SELECT row_to_json(t) FROM save_task_timebox('${id}','${day}','${start}',${minutes}) t;`,
    user,
    fail,
  );
}
function focus(
  action,
  id,
  taskId = task,
  minutes = 1,
  user = owner,
  fail = false,
) {
  return sql(
    `SELECT row_to_json(s) FROM control_task_focus('${action}','${id}','${taskId}',${minutes}) s;`,
    user,
    fail,
  );
}
function ritual(plan, user = owner, fail = false) {
  return sql(
    `SELECT row_to_json(r) FROM save_daily_ritual('${JSON.stringify(plan).replaceAll("'", "''")}'::jsonb) r;`,
    user,
    fail,
  );
}
test('timeboxes enforce local dates, ownership, adjacency, and overlap constraints', () => {
  const first = value(box(task, '2026-10-17', '2026-10-17T08:00:00Z'));
  assert.equal(first.occurrence_day, '2026-10-17');
  assert.notEqual(
    box(foreignTask, '2026-10-17', '2026-10-17T09:00:00Z', 30, owner, true)
      .status,
    0,
  );
  assert.notEqual(
    box(task, '2026-10-18', '2026-10-17T08:00:00Z', 30, owner, true).status,
    0,
  );
  sql(
    `INSERT INTO recurring_tasks(id,user_id,title) VALUES('10000000-0000-4000-8000-000000000003','${owner}','Another task');`,
    null,
  );
  assert.notEqual(
    box(
      '10000000-0000-4000-8000-000000000003',
      '2026-10-17',
      '2026-10-17T08:15:00Z',
      30,
      owner,
      true,
    ).status,
    0,
  );
  assert.equal(
    value(
      box(
        '10000000-0000-4000-8000-000000000003',
        '2026-10-17',
        '2026-10-17T08:30:00Z',
      ),
    ).starts_at,
    '2026-10-17T08:30:00+00:00',
  );
  const moved = value(box(task, '2026-10-17', '2026-10-17T10:00:00Z'));
  assert.equal(moved.id, first.id);
});
test('RLS denies foreign reads and direct client writes to protected planning tables', () => {
  assert.equal(
    sql('SELECT count(*) FROM task_timeboxes;', other)
      .stdout.trim()
      .split('\n')
      .at(-1),
    '0',
  );
  assert.notEqual(
    sql(`UPDATE task_timeboxes SET user_id='${other}';`, owner, true).status,
    0,
  );
  assert.notEqual(
    focus(
      'start',
      '20000000-0000-4000-8000-000000000001',
      foreignTask,
      1,
      owner,
      true,
    ).status,
    0,
  );
});
test('focus cannot finish early; server-timed completion logs minutes exactly once', () => {
  const id = '20000000-0000-4000-8000-000000000002';
  assert.equal(value(focus('start', id)).status, 'running');
  assert.notEqual(focus('complete', id, task, 1, owner, true).status, 0);
  assert.notEqual(
    sql(
      `UPDATE task_focus_sessions SET elapsed_seconds=600 WHERE id='${id}';`,
      owner,
      true,
    ).status,
    0,
  );
  sql(
    `UPDATE task_focus_sessions SET resumed_at=clock_timestamp()-interval '61 seconds' WHERE id='${id}';`,
    null,
  );
  const finished = value(focus('complete', id));
  assert.equal(finished.status, 'completed');
  assert.equal(finished.planned_minutes, 1);
  assert.equal(
    value(focus('complete', id)).completed_at,
    finished.completed_at,
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM activity_events WHERE metadata_json->>'session_id'='${id}';`,
    )
      .stdout.trim()
      .split('\n')
      .at(-1),
    '1',
  );
});
test('pause, resume, cancel, and the single-active-session constraint survive requests', () => {
  const id = '20000000-0000-4000-8000-000000000003';
  value(focus('start', id));
  assert.equal(value(focus('pause', id)).status, 'paused');
  assert.notEqual(
    focus('start', '20000000-0000-4000-8000-000000000004', task, 1, owner, true)
      .status,
    0,
  );
  assert.equal(value(focus('resume', id)).status, 'running');
  assert.equal(value(focus('cancel', id)).status, 'cancelled');
});
test('rituals use the saved local day, validate ownership and revisions, and persist reflections', () => {
  const today = sql(
    "SELECT (clock_timestamp() AT TIME ZONE 'Africa/Lagos')::date;",
    null,
  )
    .stdout.trim()
    .split('\n')
    .at(-1);
  const next = new Date(today + 'T12:00Z');
  next.setUTCDate(next.getUTCDate() + 1);
  const base = {
    kind: 'morning',
    day: today,
    topThree: [{ type: 'task', id: task }],
    deferred: [],
    deferredTo: next.toISOString().slice(0, 10),
    capacityMinutes: 240,
    wins: '',
    reflection: '',
    nextFocus: [],
    expectedRevision: 0,
  };
  const saved = value(ritual(base));
  assert.equal(saved.capacity_minutes, 240);
  assert.equal(saved.top_three.length, 1);
  assert.notEqual(ritual(base, owner, true).status, 0);
  assert.notEqual(
    ritual(
      {
        ...base,
        expectedRevision: saved.revision,
        topThree: [{ type: 'task', id: foreignTask }],
      },
      owner,
      true,
    ).status,
    0,
  );
  const evening = value(
    ritual({
      ...base,
      kind: 'evening',
      topThree: [],
      expectedRevision: saved.revision,
      wins: 'Kept going',
      reflection: 'Small steps count.',
    }),
  );
  assert.equal(evening.reflection, 'Small steps count.');
  assert.ok(evening.morning_at);
  assert.ok(evening.evening_at);
});
test('anonymous planning and focus functions are denied', () => {
  const result = sql(
    "SET ROLE anon;SELECT remove_task_timebox('11111111-1111-4111-8111-111111111111');",
    null,
    true,
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /permission denied/);
});

test('focused-minute totals stay owner-scoped and match completed sessions',()=>{
 const total=sql(`SELECT minutes FROM task_focus_totals WHERE task_id='${task}';`).stdout.trim().split('\n').at(-1);assert.equal(total,'1');
 assert.equal(sql('SELECT count(*) FROM task_focus_totals;',other).stdout.trim().split('\n').at(-1),'0');
});
