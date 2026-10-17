// Explicit local-only suite: node --test tests/goals-database.integration.mjs
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const name = `crystrack-goals-test-${process.pid}`;
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
    `SELECT row_to_json(g) FROM save_goal_alignment(${id ? `'${id}'` : 'NULL'},${revision ?? 'NULL'},'${escaped}'::jsonb) g;`,
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
  sql(readFileSync('tests/helpers/goals-db-bootstrap.sql', 'utf8'), null);
  const migration = readFileSync(
    'src/db/migrations/0006_goal_alignment.sql',
    'utf8',
  );
  sql(migration, null);
  sql(migration, null);
});
after(() => docker(['rm', '--force', name]));
test('atomic creation, partial edits, and optimistic conflicts', () => {
  const created = value(
    save(null, null, {
      title: 'Read',
      progress_source: 'milestones',
      milestones: [
        {
          id: '30000000-0000-4000-8000-000000000001',
          title: 'First chapter',
          dueDate: '2026-10-20',
          completedAt: null,
        },
      ],
    }),
  );
  const updated = value(
    save(created.id, created.revision, { why_matters: 'For curiosity' }),
  );
  assert.equal(updated.title, 'Read');
  assert.equal(updated.why_matters, 'For curiosity');
  assert.equal(updated.revision, created.revision + 1);
  assert.notEqual(
    save(created.id, created.revision, { title: 'Stale' }, owner, true).status,
    0,
  );
  assert.equal(
    value(save(updated.id, updated.revision, { title: 'Fresh' })).title,
    'Fresh',
  );
});
test('RLS and link ownership reject foreign goals, routines, and Wealth targets', () => {
  const goal = value(save(null, null, { title: 'Mine', progress_mode: 'ai' }));
  assert.notEqual(
    save(goal.id, goal.revision, { title: 'Intrusion' }, other, true).status,
    0,
  );
  assert.notEqual(
    save(
      goal.id,
      goal.revision,
      { task_ids: ['10000000-0000-4000-8000-000000000002'] },
      owner,
      true,
    ).status,
    0,
  );
  assert.notEqual(
    save(
      goal.id,
      goal.revision,
      { finance_target_id: '20000000-0000-4000-8000-000000000002' },
      owner,
      true,
    ).status,
    0,
  );
  assert.equal(
    sql(`SELECT count(*) FROM goals WHERE id='${goal.id}';`, other)
      .stdout.trim()
      .split('\n')
      .at(-1),
    '0',
  );
  assert.notEqual(
    sql(
      `UPDATE goals SET user_id='${other}' WHERE id='${goal.id}';`,
      owner,
      true,
    ).status,
    0,
  );
  const linked = value(
    save(goal.id, goal.revision, {
      task_ids: ['10000000-0000-4000-8000-000000000001'],
      finance_target_id: '20000000-0000-4000-8000-000000000001',
    }),
  );
  assert.equal(linked.task_ids.length, 1);
});
test('invalid create rolls back without an orphan goal', () => {
  const count = () =>
    sql('SELECT count(*) FROM goals;').stdout.trim().split('\n').at(-1);
  const before = count();
  assert.notEqual(
    save(
      null,
      null,
      { title: 'Invalid', progress_source: 'tasks', task_ids: [] },
      owner,
      true,
    ).status,
    0,
  );
  assert.equal(count(), before);
});
test('lifecycle changes require reflections and block inactive check-ins', () => {
  const goal = value(
    save(null, null, { title: 'Reflect', progress_mode: 'ai' }),
  );
  assert.notEqual(
    save(goal.id, goal.revision, { status: 'paused' }, owner, true).status,
    0,
  );
  const paused = value(
    save(goal.id, goal.revision, {
      status: 'paused',
      reflection: 'More room to rest',
    }),
  );
  assert.notEqual(
    sql(
      `INSERT INTO goal_checkins(goal_id,user_id) VALUES('${goal.id}','${owner}');`,
      owner,
      true,
    ).status,
    0,
  );
  const active = value(save(goal.id, paused.revision, { status: 'active' }));
  const achieved = value(
    save(goal.id, active.revision, {
      status: 'achieved',
      reflection: 'Small steps helped',
    }),
  );
  assert.ok(achieved.completed_at);
});
test('check-in progress updates atomically and revision invalidates stale edits', () => {
  const goal = value(
    save(null, null, {
      title: 'Measured',
      progress_mode: 'percentage',
      starting_value: 0,
      target_value: 10,
      progress_value: 0,
    }),
  );
  sql(
    `INSERT INTO goal_checkins(goal_id,user_id,progress_value,progress_percent) VALUES('${goal.id}','${owner}',4,40);`,
  );
  const current = JSON.parse(
    sql(`SELECT row_to_json(g) FROM goals g WHERE id='${goal.id}';`)
      .stdout.trim()
      .split('\n')
      .at(-1),
  );
  assert.equal(Number(current.progress_value), 4);
  assert.equal(current.revision, goal.revision + 1);
  assert.notEqual(
    save(goal.id, goal.revision, { title: 'Stale' }, owner, true).status,
    0,
  );
});
test('anonymous RPC access is denied', () => {
  const result = sql(
    "SET ROLE anon;SELECT save_goal_alignment(NULL,NULL,'{}'::jsonb);",
    null,
    true,
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /permission denied/);
});

test('milestone changes are revision-safe and undo preserves dated steps', () => {
 const step={id:'30000000-0000-4000-8000-000000000009',title:'A step',dueDate:'2026-11-01',completedAt:null};
 const goal=value(save(null,null,{title:'Steps',progress_source:'milestones',milestones:[step]}));
 const checked=value(save(goal.id,goal.revision,{milestones:[{...step,completedAt:new Date().toISOString()}]}));
 assert.ok(checked.milestones[0].completedAt);
 const undone=value(save(goal.id,checked.revision,{milestones:[step]}));
 assert.equal(undone.milestones[0].completedAt,null);assert.equal(undone.milestones[0].dueDate,'2026-11-01');
 assert.notEqual(save(goal.id,undone.revision,{milestones:[]},owner,true).status,0);
});
test('check-in guard revalidates occurrence and saved timezone', () => {
 sql(`INSERT INTO profiles(user_id,timezone) VALUES('${owner}','Pacific/Kiritimati') ON CONFLICT(user_id) DO UPDATE SET timezone=excluded.timezone;`,null);
 const goal=value(save(null,null,{title:'Local day',progress_mode:'ai',checkin_config:{frequency:'daily',days:[],time:'20:00',channels:['push']}}));
 assert.notEqual(sql(`INSERT INTO goal_checkins(goal_id,user_id,occurrence_key) VALUES('${goal.id}','${owner}','daily:1900-01-01');`,owner,true).status,0);
 sql(`INSERT INTO goal_checkins(goal_id,user_id) VALUES('${goal.id}','${owner}');`);
 assert.equal(sql(`SELECT occurrence_key='daily:'||(now() AT TIME ZONE 'Pacific/Kiritimati')::date::text FROM goal_checkins WHERE goal_id='${goal.id}';`).stdout.trim().split('\n').at(-1),'t');
});
test('expired goals reject check-ins and deleting a goal preserves linked parents', () => {
 const goal=value(save(null,null,{title:'Linked',progress_mode:'ai',task_ids:['10000000-0000-4000-8000-000000000001'],finance_target_id:'20000000-0000-4000-8000-000000000001',deadline:'2000-01-01T00:00:00Z'}));
 assert.notEqual(sql(`INSERT INTO goal_checkins(goal_id,user_id) VALUES('${goal.id}','${owner}');`,owner,true).status,0);
 sql(`DELETE FROM goals WHERE id='${goal.id}';`);
 assert.equal(sql("SELECT count(*) FROM recurring_tasks WHERE id='10000000-0000-4000-8000-000000000001';").stdout.trim().split('\n').at(-1),'1');
 assert.equal(sql("SELECT count(*) FROM finance_targets WHERE id='20000000-0000-4000-8000-000000000001';").stdout.trim().split('\n').at(-1),'1');
});
