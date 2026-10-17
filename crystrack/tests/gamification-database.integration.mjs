// Explicit local-only suite: node --test tests/goals-database.integration.mjs
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
const name = `crystrack-gamification-test-${process.pid}`;
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
function docker(args, input) {
  const result = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    timeout: 30000,
  });
  if (result.error) throw result.error;
  return result;
}
function sql(query, user = owner, fail = false) {
  const result = docker(
    [
      "exec",
      "-i",
      name,
      "psql",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-q",
    ],
    user
      ? `SET ROLE authenticated;SET request.jwt.claim.sub='${user}';${query}`
      : query,
  );
  if (!fail) assert.equal(result.status, 0, result.stderr);
  return result;
}
function value(result) {
  return result.stdout.trim()
    ? JSON.parse(result.stdout.trim().split("\n").at(-1))
    : null;
}
before(async () => {
  const started = docker([
    "run",
    "--rm",
    "--detach",
    "--name",
    name,
    "--network",
    "none",
    "--tmpfs",
    "/var/lib/postgresql/data",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:17-alpine",
  ]);
  assert.equal(started.status, 0, started.stderr);
  let ready = false;
  for (let i = 0; i < 50; i++) {
    if (
      docker(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"])
        .status === 0
    ) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(ready, "PostgreSQL became ready");
  sql(
    `CREATE ROLE authenticated NOLOGIN;CREATE ROLE anon NOLOGIN;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE TABLE auth.users(id uuid PRIMARY KEY);GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;`,
    null,
  );
  for (const file of [
    "0000_initial.sql",
    "0001_product_integrity.sql",
    "0002_adaptive_experience.sql",
    "0003_wealth_intelligence.sql",
  ])
    sql(readFileSync("src/db/migrations/" + file, "utf8"), null);
  sql(
    `INSERT INTO auth.users VALUES('${owner}'),('${other}');GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;INSERT INTO profiles(user_id,timezone,current_timezone) VALUES('${owner}','UTC','Africa/Lagos'),('${other}','UTC','UTC');`,
    null,
  );
  sql("CREATE ROLE service_role NOLOGIN;", null);
  for (const file of [
    "0005_intelligence_layer.sql",
    "0006_goal_alignment.sql",
    "0007_academic_assignments.sql",
    "0008_daily_rhythm.sql",
    "0009_wealth_suite.sql",
    "0010_gamification.sql",
  ])
    sql(readFileSync("src/db/migrations/" + file, "utf8"), null);
  sql(readFileSync("src/db/migrations/0010_gamification.sql", "utf8"), null);
});
after(() => docker(["rm", "--force", name]));

const task = "10000000-0000-4000-8000-000000000001",
  foreignTask = "10000000-0000-4000-8000-000000000002";
let occurrence, expense, goal, checkin;
const localToday = "(clock_timestamp() AT TIME ZONE 'Africa/Lagos')::date";
function count(kind, user = owner) {
  return value(
    sql(
      `SELECT to_json(count(*)) FROM gamification_events WHERE kind='${kind}' AND active;`,
      user,
    ),
  );
}
test("task completions award once, undo revokes and re-completion retains original earning time", () => {
  sql(
    `INSERT INTO recurring_tasks(id,user_id,title,category) VALUES('${task}','${owner}','Read a little','Learning');`,
  );
  occurrence = value(
    sql(
      `INSERT INTO task_occurrences(task_id,date,status,completed_at) VALUES('${task}',${localToday}::timestamp AT TIME ZONE 'UTC','completed',clock_timestamp()) RETURNING row_to_json(task_occurrences);`,
    ),
  );
  const first = value(
    sql(`SELECT row_to_json(e) FROM gamification_events e WHERE kind='task';`),
  );
  assert.equal(count("task"), 1);
  sql(
    `UPDATE task_occurrences SET status='pending',completed_at=NULL WHERE id='${occurrence.id}';`,
  );
  assert.equal(count("task"), 0);
  sql(
    `UPDATE task_occurrences SET status='completed',completed_at=clock_timestamp() WHERE id='${occurrence.id}';`,
  );
  assert.equal(count("task"), 1);
  const again = value(
    sql(`SELECT row_to_json(e) FROM gamification_events e WHERE kind='task';`),
  );
  assert.equal(again.id, first.id);
  assert.equal(again.created_at, first.created_at);
  assert.equal(again.day, first.day);
});
test("historical/future task dates and client completed_at timestamps cannot manufacture activity days", () => {
  for (const delta of [-1, 1])
    sql(
      `INSERT INTO task_occurrences(task_id,date,status,completed_at) VALUES('${task}',(${localToday}+${delta})::timestamp AT TIME ZONE 'UTC','completed',clock_timestamp()+interval '100 days');`,
    );
  assert.equal(count("task"), 2);
  assert.equal(
    value(
      sql(
        `SELECT to_json(bool_and(day=${localToday})) FROM gamification_events;`,
      ),
    ),
    true,
  );
});
test("protected ledger rejects direct grants, edits and deletes, even for the owner", () => {
  assert.notEqual(
    sql(
      `INSERT INTO gamification_events(user_id,action_key,kind,source_id,day) VALUES('${owner}','fake','task','fake',current_date);`,
      owner,
      true,
    ).status,
    0,
  );
  assert.notEqual(
    sql(`UPDATE gamification_events SET active=true;`, owner, true).status,
    0,
  );
  assert.notEqual(
    sql(`DELETE FROM gamification_events;`, owner, true).status,
    0,
  );
  assert.notEqual(
    sql(`SELECT capture_gamification_action();`, owner, true).status,
    0,
  );
  assert.equal(
    value(sql(`SELECT to_json(count(*)) FROM gamification_events;`, other)),
    0,
  );
});
test("goals award from valid check-ins; editing a response never creates another event", () => {
  goal = value(
    sql(
      `INSERT INTO goals(user_id,title,category,target_value,starting_value,checkin_config) VALUES('${owner}','Keep learning','Learning',100,0,'{"frequency":"daily","days":[],"time":"20:00","channels":["push"]}') RETURNING row_to_json(goals);`,
    ),
  );
  checkin = value(
    sql(
      `INSERT INTO goal_checkins(user_id,goal_id,response_text) VALUES('${owner}','${goal.id}','A small step') RETURNING row_to_json(goal_checkins);`,
    ),
  );
  assert.equal(count("goal"), 1);
  sql(
    `UPDATE goal_checkins SET response_text='A clearer reflection' WHERE id='${checkin.id}';`,
  );
  assert.equal(count("goal"), 1);
  sql(`DELETE FROM goal_checkins WHERE id='${checkin.id}';`);
  assert.equal(count("goal"), 0);
});
test("expenses award from the real ledger, derived savings are excluded and removal/undo stays atomic", () => {
  sql(
    `INSERT INTO wealth_settings(user_id,spend_save_bps) VALUES('${owner}',1000);`,
  );
  expense = value(
    sql(
      `SELECT row_to_json(e) FROM wealth_write_entry(NULL,'{"flowKind":"expense","amount":"100.10","source":"Chowdeck"}') e;`,
    ),
  );
  assert.equal(count("expense"), 1);
  assert.equal(
    value(
      sql(
        `SELECT to_json(count(*)) FROM money_entries WHERE parent_entry_id='${expense.id}';`,
      ),
    ),
    1,
  );
  expense = value(
    sql(
      `SELECT row_to_json(e) FROM wealth_write_entry('${expense.id}','{}',${expense.revision},'delete') e;`,
    ),
  );
  assert.equal(count("expense"), 0);
  expense = value(
    sql(
      `SELECT row_to_json(e) FROM wealth_write_entry('${expense.id}','{}',${expense.revision},'restore') e;`,
    ),
  );
  assert.equal(count("expense"), 1);
  sql(
    `SELECT wealth_write_entry('${expense.id}','{"amount":"200.20"}',${expense.revision});`,
  );
  assert.equal(count("expense"), 1);
});
test("ritual phases have one reward each and immutable calendar identities", () => {
  const call = (kind, revision, weekly = false) =>
    sql(
      `SELECT save_daily_ritual(jsonb_build_object('kind','${kind}','day',(${localToday}${weekly ? "-extract(dow FROM " + localToday + ")::integer" : ""})::text,'expectedRevision',${revision},'topThree','[]'::jsonb,'deferred','[]'::jsonb,'nextFocus','[]'::jsonb,'capacityMinutes',480,'wins','A little progress','reflection','A useful moment'));`,
    );
  call("morning", 0);
  call("evening", 1);
  assert.equal(count("morning"), 1);
  assert.equal(count("evening"), 1);
  assert.equal(count("weekly"), 0);
  call("morning", 2);
  assert.equal(count("morning"), 1);
  const sunday = value(
    sql(`SELECT to_json(extract(dow FROM ${localToday})::integer=0);`),
  );
  call("weekly", sunday ? 3 : 0, true);
  assert.equal(count("weekly"), 1);
  const bad = sql(
    `SET request.jwt.claim.sub='${owner}';UPDATE daily_rituals SET day=day+1 WHERE user_id='${owner}';`,
    null,
    true,
  );
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /identity cannot change/);
});
test("late assignments still earn XP and cannot forge on-time classification", () => {
  const assignment = value(
    sql(
      `INSERT INTO assignments(user_id,title,deadline,status) VALUES('${owner}','MTH 101',clock_timestamp()-interval '1 day','upcoming') RETURNING row_to_json(assignments);`,
    ),
  );
  sql(`UPDATE assignments SET status='completed' WHERE id='${assignment.id}';`);
  assert.equal(count("assignment"), 1);
  assert.equal(
    value(
      sql(
        `SELECT to_json(on_time) FROM gamification_events WHERE kind='assignment';`,
      ),
    ),
    false,
  );
  sql(
    `UPDATE assignments SET title='MTH 101 lab' WHERE id='${assignment.id}';`,
  );
  assert.equal(count("assignment"), 1);
});
test("quiet preferences persist without altering earned records or granting ledger writes", () => {
  sql(
    `INSERT INTO user_preferences(user_id,hide_gamification) VALUES('${owner}',true);`,
  );
  assert.equal(
    value(
      sql(
        `SELECT to_json(hide_gamification) FROM user_preferences WHERE user_id='${owner}';`,
      ),
    ),
    true,
  );
  assert.ok(count("task") > 0);
  assert.equal(
    value(
      sql(
        `SELECT to_json(count(*)) FROM user_preferences WHERE user_id='${owner}';`,
        other,
      ),
    ),
    0,
  );
});
test("deleting and recreating the same task occurrence does not retain a phantom award", () => {
  sql(`DELETE FROM task_occurrences WHERE id='${occurrence.id}';`);
  assert.equal(count("task"), 1);
  const replacement = value(
    sql(
      `INSERT INTO task_occurrences(task_id,date,status,completed_at) VALUES('${task}',${localToday}::timestamp AT TIME ZONE 'UTC','completed',clock_timestamp()) RETURNING row_to_json(task_occurrences);`,
    ),
  );
  assert.equal(count("task"), 2);
  sql(`DELETE FROM task_occurrences WHERE id='${replacement.id}';`);
  assert.equal(count("task"), 1);
});

test("migration reapplication preserves verified rewards and keeps the ledger read-only", () => {
  const before = value(
    sql(`SELECT to_json(count(*)) FROM gamification_events;`),
  );
  sql(readFileSync("src/db/migrations/0010_gamification.sql", "utf8"), null);
  assert.equal(
    value(sql(`SELECT to_json(count(*)) FROM gamification_events;`)),
    before,
  );
  assert.notEqual(
    sql(`UPDATE gamification_events SET active=false;`, owner, true).status,
    0,
  );
});
