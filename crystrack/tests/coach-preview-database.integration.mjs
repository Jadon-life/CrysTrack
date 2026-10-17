// Explicit local-only suite: node --test tests/goals-database.integration.mjs
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
const name = `crystrack-coach-preview-test-${process.pid}`;
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
    "0011_preview_coach.sql",
  ])
    sql(readFileSync("src/db/migrations/" + file, "utf8"), null);
  sql(readFileSync("src/db/migrations/0011_preview_coach.sql", "utf8"), null);
});
after(() => docker(["rm", "--force", name]));

function decide(id, tool, approve = true, user = owner, fail = false) {
  return sql(
    `SELECT public.preview_decide_coach_action('${id}','${JSON.stringify(tool).replaceAll("'", "''")}'::jsonb,${approve});`,
    user,
    fail,
  );
}
const taskReceipt = "90000000-0000-4000-8000-000000000001";
test("approved task and schedule are atomic and retry returns the same receipt", () => {
  const tool = { kind: "create_task", title: "Walk gently", weekdays: [1, 3] },
    first = value(decide(taskReceipt, tool)),
    second = value(decide(taskReceipt, tool));
  assert.equal(first.status, "approved");
  assert.equal(second.replayed, true);
  assert.equal(first.result.id, second.result.id);
  assert.equal(
    value(
      sql(
        "SELECT to_json(count(*)) FROM recurring_tasks WHERE title='Walk gently';",
      ),
    ),
    1,
  );
  assert.equal(
    value(
      sql(
        `SELECT to_json(count(*)) FROM task_schedules WHERE task_id='${first.result.id}';`,
      ),
    ),
    2,
  );
});
test("dismissal survives replay and never writes the proposed task", () => {
  const id = "90000000-0000-4000-8000-000000000002",
    tool = { kind: "create_task", title: "Dismiss me", weekdays: [2] };
  assert.equal(value(decide(id, tool, false)).status, "dismissed");
  assert.equal(value(decide(id, tool, true)).status, "dismissed");
  assert.equal(
    value(
      sql(
        "SELECT to_json(count(*)) FROM recurring_tasks WHERE title='Dismiss me';",
      ),
    ),
    0,
  );
});
test("failed actions roll back both the proposed data and the receipt", () => {
  const id = "90000000-0000-4000-8000-000000000003";
  assert.notEqual(
    decide(
      id,
      { kind: "create_task", title: "Invalid task", weekdays: [1, 8] },
      true,
      owner,
      true,
    ).status,
    0,
  );
  assert.equal(
    value(
      sql(
        "SELECT to_json(count(*)) FROM recurring_tasks WHERE title='Invalid task';",
      ),
    ),
    0,
  );
  assert.equal(
    value(
      sql(
        `SELECT to_json(count(*)) FROM preview_coach_actions WHERE id='${id}';`,
      ),
    ),
    0,
  );
});
test("receipts are owner-readable only and cannot be directly forged or modified", () => {
  assert.equal(
    value(
      sql(
        `SELECT to_json(count(*)) FROM preview_coach_actions WHERE id='${taskReceipt}';`,
        other,
      ),
    ),
    0,
  );
  assert.notEqual(
    sql(
      `UPDATE preview_coach_actions SET status='dismissed' WHERE id='${taskReceipt}';`,
      owner,
      true,
    ).status,
    0,
  );
  assert.notEqual(
    decide(
      taskReceipt,
      { kind: "create_task", title: "Walk gently", weekdays: [1, 3] },
      true,
      other,
      true,
    ).status,
    0,
  );
  assert.notEqual(
    sql(
      "SELECT preview_decide_coach_action(gen_random_uuid(),'{}',true);",
      "",
      true,
    ).status,
    0,
  );
});
test("budget reallocation uses exact decimal arithmetic and replay cannot move funds twice", () => {
  const from = "91000000-0000-4000-8000-000000000001",
    to = "91000000-0000-4000-8000-000000000002",
    id = "90000000-0000-4000-8000-000000000004";
  sql(
    `INSERT INTO wealth_budget_caps(id,user_id,month,category,cap) VALUES('${from}','${owner}',date_trunc('month',now())::date,'Food',1000),('${to}','${owner}',date_trunc('month',now())::date,'Travel',100);`,
  );
  const tool = { kind: "reallocate_budget", from, to, amount: "250.05" };
  decide(id, tool);
  decide(id, tool);
  assert.equal(
    value(
      sql(
        `SELECT to_json(cap::text) FROM wealth_budget_caps WHERE id='${from}';`,
      ),
    ),
    "749.95",
  );
  assert.equal(
    value(
      sql(
        `SELECT to_json(cap::text) FROM wealth_budget_caps WHERE id='${to}';`,
      ),
    ),
    "350.05",
  );
  assert.notEqual(
    decide("90000000-0000-4000-8000-000000000005", tool, true, other, true)
      .status,
    0,
  );
});
test("Telegram expense approval creates one owned ledger entry and retry is safe", () => {
  const id = "90000000-0000-4000-8000-000000000006",
    tool = { kind: "log_expense", amount: "2500.05", note: "Lunch" };
  const first = value(decide(id, tool));
  assert.equal(first.status, "approved");
  decide(id, tool);
  assert.equal(
    value(
      sql("SELECT to_json(count(*)) FROM money_entries WHERE note='Lunch';"),
    ),
    1,
  );
  assert.equal(
    value(
      sql(
        "SELECT to_json(amount::text) FROM money_entries WHERE note='Lunch';",
      ),
    ),
    "2500.05",
  );
  assert.equal(
    value(
      sql(
        "SELECT to_json(count(*)) FROM money_entries WHERE note='Lunch';",
        other,
      ),
    ),
    0,
  );
});
test("goal target approvals use revision checks and reject another user’s goal", () => {
  const created = value(
    sql(
      'SELECT to_jsonb(public.save_goal_alignment(NULL,NULL,\'{"title":"Learn","progress_mode":"percentage","measurable":true,"starting_value":0,"target_value":10,"progress_value":0}\'));',
    ),
  );
  const tool = {
    kind: "adjust_goal_target",
    goalId: created.id,
    expectedRevision: created.revision,
    targetValue: "20.00",
  };
  assert.equal(
    value(decide("90000000-0000-4000-8000-000000000007", tool)).status,
    "approved",
  );
  assert.notEqual(
    decide("90000000-0000-4000-8000-000000000008", tool, true, owner, true)
      .status,
    0,
  );
  assert.notEqual(
    decide("90000000-0000-4000-8000-000000000009", tool, true, other, true)
      .status,
    0,
  );
  assert.equal(
    value(
      sql(
        `SELECT to_json(target_value::text) FROM goals WHERE id='${created.id}';`,
      ),
    ),
    "20.00",
  );
});
