// Explicit local-only suite: npm run test:assignments:db
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const name = `crystrack-assignments-test-${process.pid}`;
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
function save(id, revision, plan, user = owner, fail = false) {
  const escaped = JSON.stringify(plan).replaceAll("'", "''");
  return sql(
    `SELECT row_to_json(g) FROM save_academic_assignment(${id ? `'${id}'` : 'NULL'},${revision ?? 'NULL'},'${escaped}'::jsonb) g;`,
    user,
    fail,
  );
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
  sql(readFileSync('tests/helpers/assignments-db-bootstrap.sql', 'utf8'), null);
  const migration = readFileSync(
    'src/db/migrations/0007_academic_assignments.sql',
    'utf8',
  );
  sql(migration, null);
  sql(migration, null);
});
after(() => docker(['rm', '--force', name]));
function finish(id, user = owner, fail = false) {
  return sql(
    `SELECT row_to_json(a) FROM finish_academic_assignment('${id}') a;`,
    user,
    fail,
  );
}
const plan = (title, deadline = '2099-01-01T00:00:00Z') => ({
  title,
  deadline,
});
test('migration backfills historical late completion without editing legacy migrations', () => {
  assert.equal(
    sql("SELECT finished_late FROM assignments WHERE title='Historical late';")
      .stdout.trim()
      .split('\n')
      .at(-1),
    't',
  );
});
test('overdue completion is allowed, idempotent, and records one activity event', () => {
  const created = value(
    save(null, null, plan('Past due', '2000-01-01T00:00:00Z')),
  );
  const completed = value(finish(created.id));
  assert.equal(completed.status, 'completed');
  assert.equal(completed.finished_late, true);
  assert.ok(completed.completed_at);
  const duplicate = value(finish(created.id));
  assert.equal(duplicate.completed_at, completed.completed_at);
  assert.equal(duplicate.revision, completed.revision);
  assert.equal(
    sql(`SELECT count(*) FROM activity_events WHERE entity_id='${created.id}';`)
      .stdout.trim()
      .split('\n')
      .at(-1),
    '1',
  );
});
test('on-time completion preserves the existing completed status and rejects stale edits', () => {
  const created = value(save(null, null, plan('Ahead of time')));
  const completed = value(finish(created.id));
  assert.equal(completed.finished_late, false);
  assert.equal(completed.status, 'completed');
  const conflict = save(
    created.id,
    created.revision,
    { title: 'Stale' },
    owner,
    true,
  );
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /Assignment changed/);
});
test('RLS and RPC ownership prevent cross-user reads, edits, completion, and deletion', () => {
  const created = value(save(null, null, plan('Private')));
  assert.equal(
    sql(`SELECT count(*) FROM assignments WHERE id='${created.id}';`, other)
      .stdout.trim()
      .split('\n')
      .at(-1),
    '0',
  );
  assert.notEqual(
    save(created.id, created.revision, { title: 'Intrusion' }, other, true)
      .status,
    0,
  );
  assert.notEqual(finish(created.id, other, true).status, 0);
  sql(`DELETE FROM assignments WHERE id='${created.id}';`, other);
  assert.equal(
    sql(`SELECT count(*) FROM assignments WHERE id='${created.id}';`)
      .stdout.trim()
      .split('\n')
      .at(-1),
    '1',
  );
  assert.notEqual(
    sql(
      `UPDATE assignments SET user_id='${other}' WHERE id='${created.id}';`,
      owner,
      true,
    ).status,
    0,
  );
});
test('partial editing retains metadata, supports dated work blocks, and versions subtask updates', () => {
  const step = {
    id: '10000000-0000-4000-8000-000000000001',
    title: 'Read the brief',
    completed: false,
  };
  const created = value(
    save(null, null, {
      ...plan('Lab'),
      course_code: 'phy 101',
      academic_kind: 'Lab',
      point_weight: 20.5,
      estimated_minutes: 150,
      work_start_at: '2098-12-30T12:00:00Z',
      subtasks: [step],
    }),
  );
  assert.equal(created.course_code, 'PHY 101');
  assert.equal(created.estimated_minutes, 150);
  assert.equal(Number(created.point_weight), 20.5);
  const edited = value(
    save(created.id, created.revision, {
      subtasks: [{ ...step, completed: true }],
    }),
  );
  assert.equal(edited.title, 'Lab');
  assert.equal(edited.subtasks[0].completed, true);
  assert.ok(edited.work_start_at);
  assert.notEqual(
    save(edited.id, created.revision, { title: 'Stale' }, owner, true).status,
    0,
  );
  const undone = value(save(edited.id, edited.revision, { subtasks: [step] }));
  assert.equal(undone.subtasks[0].completed, false);
});
test('invalid metadata and duplicate steps roll back the entire create', () => {
  const before = sql('SELECT count(*) FROM assignments;')
    .stdout.trim()
    .split('\n')
    .at(-1);
  for (const extra of [
    { estimated_minutes: -1 },
    { point_weight: 101 },
    { academic_kind: 'Unrecognized' },
    { subtasks: [{ id: 'invalid', title: 'Step', completed: false }] },
    { user_id: other },
    { status: 'completed' },
  ])
    assert.notEqual(
      save(null, null, { ...plan('Invalid'), ...extra }, owner, true).status,
      0,
    );
  assert.equal(
    sql('SELECT count(*) FROM assignments;').stdout.trim().split('\n').at(-1),
    before,
  );
});
test('Drop retains the assignment, blocks completion until restored, and cancels reminders', () => {
  const created = value(save(null, null, plan('Make room')));
  sql(
    `INSERT INTO reminders(user_id,entity_type,entity_id,status) VALUES('${owner}','assignment','${created.id}','pending'),('${owner}','assignment','${created.id}','snoozed'),('${owner}','assignment','${created.id}','sent');`,
  );
  const dropped = value(
    save(created.id, created.revision, { status: 'dropped' }),
  );
  assert.equal(dropped.status, 'dropped');
  assert.notEqual(finish(created.id, owner, true).status, 0);
  assert.equal(
    sql(
      `SELECT count(*) FROM reminders WHERE entity_id='${created.id}' AND status='cancelled';`,
    )
      .stdout.trim()
      .split('\n')
      .at(-1),
    '2',
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM reminders WHERE entity_id='${created.id}' AND status='sent';`,
    )
      .stdout.trim()
      .split('\n')
      .at(-1),
    '1',
  );
  const restored = value(
    save(created.id, dropped.revision, { status: 'upcoming' }),
  );
  assert.equal(restored.completed_at, null);
  assert.equal(value(finish(created.id)).status, 'completed');
});
test('completion metadata cannot be forged and anonymous RPCs are denied', () => {
  const created = value(
    save(null, null, plan('Keep history', '2000-01-01T00:00:00Z')),
  );
  const completed = value(finish(created.id));
  sql(
    `UPDATE assignments SET finished_late=false,completed_at='1900-01-01T00:00:00Z' WHERE id='${created.id}';`,
  );
  const stored = JSON.parse(
    sql(`SELECT row_to_json(a) FROM assignments a WHERE id='${created.id}';`)
      .stdout.trim()
      .split('\n')
      .at(-1),
  );
  assert.equal(stored.finished_late, true);
  assert.equal(stored.completed_at, completed.completed_at);
  const anon = sql(
    "SET ROLE anon;SELECT finish_academic_assignment('11111111-1111-4111-8111-111111111111');",
    null,
    true,
  );
  assert.notEqual(anon.status, 0);
  assert.match(anon.stderr, /permission denied/);
});

test('simultaneous completion requests store one completion event', async () => {
  const created = value(
    save(null, null, plan('Finish once', '2000-01-01T00:00:00Z')),
  );
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execute = promisify(execFile);
  const query = `SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';SELECT row_to_json(a) FROM finish_academic_assignment('${created.id}') a;`;
  const results = await Promise.all(
    [1, 2].map(() =>
      execute(
        'docker',
        [
          'exec',
          name,
          'psql',
          '-h',
          '127.0.0.1',
          '-U',
          'postgres',
          '-v',
          'ON_ERROR_STOP=1',
          '-At',
          '-c',
          query,
        ],
        { timeout: 30000 },
      ),
    ),
  );
  const records = results.map((r) =>
    JSON.parse(r.stdout.trim().split('\n').at(-1)),
  );
  assert.equal(records[0].completed_at, records[1].completed_at);
  assert.equal(records[0].revision, records[1].revision);
  assert.equal(
    sql(`SELECT count(*) FROM activity_events WHERE entity_id='${created.id}';`)
      .stdout.trim()
      .split('\n')
      .at(-1),
    '1',
  );
});
