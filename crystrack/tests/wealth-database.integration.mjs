// Explicit local-only suite: node --test tests/goals-database.integration.mjs
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
const name = `crystrack-wealth-test-${process.pid}`;
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
  const installer='docs/sql/wealth-0009/';
  for(const file of readdirSync(installer).filter(f=>/^0[1-8]-.*\.sql$/.test(f)).sort())sql(readFileSync(installer+file,'utf8'),null);
  const verified=sql(readFileSync(installer+'09-verify.sql','utf8'),null);
  assert.equal(verified.stdout.trim().split('\n').length,13);
  assert.ok(verified.stdout.trim().split('\n').every(line=>line.endsWith('|t')),verified.stdout);
  const migration = readFileSync(
    "src/db/migrations/0009_wealth_suite.sql",
    "utf8",
  );
  sql(migration, null);
  sql(migration, null);
});
after(() => docker(["rm", "--force", name]));

function entry(
  payload,
  id = null,
  revision = null,
  action = "save",
  user = owner,
  fail = false,
) {
  return sql(
    `SELECT row_to_json(e) FROM wealth_write_entry(${id ? `'${id}'` : "NULL"},'${JSON.stringify(payload).replaceAll("'", "''")}',${revision ?? "NULL"},'${action}') e;`,
    user,
    fail,
  );
}
let cash, bank, expense;
test("accounts, exact 0.10 + 0.20 arithmetic and non-spending transfers", () => {
  cash = value(
    sql(
      `INSERT INTO wealth_accounts(user_id,name,kind) VALUES('${owner}','Cash','cash') RETURNING row_to_json(wealth_accounts);`,
    ),
  );
  bank = value(
    sql(
      `INSERT INTO wealth_accounts(user_id,name,kind) VALUES('${owner}','Bank','bank') RETURNING row_to_json(wealth_accounts);`,
    ),
  );
  entry({ flowKind: "income", amount: "0.10", accountId: cash.id });
  entry({ flowKind: "income", amount: "0.20", accountId: cash.id });
  entry({
    flowKind: "transfer",
    amount: "0.10",
    accountId: cash.id,
    destinationAccountId: bank.id,
  });
  assert.equal(
    value(
      sql(
        `SELECT to_json(sum(CASE flow_kind WHEN 'income' THEN amount ELSE 0 END)::text) FROM money_entries;`,
      ),
    ),
    "0.30",
  );
  assert.notEqual(
    entry(
      {
        flowKind: "transfer",
        amount: "1",
        accountId: cash.id,
        destinationAccountId: cash.id,
      },
      null,
      null,
      "save",
      owner,
      true,
    ).status,
    0,
  );
});
test("Spend & Save edits, removal and undo are atomic and revision checked", () => {
  sql(
    `INSERT INTO wealth_settings(user_id,spend_save_bps) VALUES('${owner}',1000);`,
  );
  expense = value(
    entry({
      flowKind: "expense",
      amount: "100.15",
      accountId: cash.id,
      category: "Food",
    }),
  );
  assert.equal(
    value(
      sql(
        `SELECT to_json(amount::text) FROM money_entries WHERE parent_entry_id='${expense.id}';`,
      ),
    ),
    "10.02",
  );
  expense = value(entry({ amount: "200.25" }, expense.id, expense.revision));
  assert.equal(
    value(
      sql(
        `SELECT to_json(amount::text) FROM money_entries WHERE parent_entry_id='${expense.id}';`,
      ),
    ),
    "20.03",
  );
  assert.notEqual(
    entry({ amount: "1" }, expense.id, 1, "save", owner, true).status,
    0,
  );
  expense = value(entry({}, expense.id, expense.revision, "delete"));
  assert.equal(
    value(
      sql(
        `SELECT to_json(count(*)) FROM money_entries WHERE parent_entry_id='${expense.id}' AND deleted_at IS NULL;`,
      ),
    ),
    0,
  );
  expense = value(entry({}, expense.id, expense.revision, "restore"));
  assert.equal(
    value(
      sql(
        `SELECT to_json(count(*)) FROM money_entries WHERE parent_entry_id='${expense.id}' AND deleted_at IS NULL;`,
      ),
    ),
    1,
  );
});
test("locked target rejects release, deletion, reduced contribution and settings ownership attacks", () => {
  const target = value(
    sql(
      `INSERT INTO finance_targets(user_id,title,target_amount,locked_until) VALUES('${owner}','Laptop',1000,current_date+30) RETURNING row_to_json(finance_targets);`,
    ),
  );
  const saved = value(
    entry({
      flowKind: "saving",
      amount: "50",
      targetId: target.id,
      accountId: cash.id,
    }),
  );
  assert.equal(
    value(
      sql(
        `SELECT to_json(current_amount::text) FROM finance_targets WHERE id='${target.id}';`,
      ),
    ),
    "50.00",
  );
  for (const [p, id, r, a] of [
    [
      {
        flowKind: "savings_release",
        amount: "1",
        targetId: target.id,
        accountId: cash.id,
      },
      null,
      null,
      "save",
    ],
    [{}, saved.id, saved.revision, "delete"],
    [{ amount: "40" }, saved.id, saved.revision, "save"],
  ])
    assert.notEqual(entry(p, id, r, a, owner, true).status, 0);
  assert.notEqual(
    sql(`DELETE FROM finance_targets WHERE id='${target.id}';`, owner, true)
      .status,
    0,
  );
  assert.notEqual(
    sql(
      `INSERT INTO wealth_settings(user_id,target_id) VALUES('${other}','${target.id}');`,
      other,
      true,
    ).status,
    0,
  );
  assert.notEqual(
    entry(
      { flowKind: "savings_release", amount: "30", accountId: cash.id },
      null,
      null,
      "save",
      owner,
      true,
    ).status,
    0,
    "General savings cannot spend target funds",
  );
});
test("RLS and foreign account/target identifiers cannot cross owners", () => {
  assert.equal(
    value(sql(`SELECT to_json(count(*)) FROM money_entries;`, other)),
    0,
  );
  assert.notEqual(
    entry(
      { flowKind: "expense", amount: "1", accountId: cash.id },
      null,
      null,
      "save",
      other,
      true,
    ).status,
    0,
  );
  assert.notEqual(
    entry({ amount: "1" }, expense.id, expense.revision, "save", other, true)
      .status,
    0,
  );
  assert.notEqual(
    sql(
      `SELECT wealth_write_entry(NULL,'{"flowKind":"income","amount":"1"}');`,
      "",
      true,
    ).status,
    0,
  );
  assert.notEqual(
    sql(`DELETE FROM money_entries WHERE id='${expense.id}';`, owner, true)
      .status,
    0,
  );
});
test("budget reallocation preserves total caps and cannot strip recorded spending", () => {
  const a = value(
    sql(
      `INSERT INTO wealth_budget_caps(user_id,month,category,cap) VALUES('${owner}',date_trunc('month',now()),'Food',300) RETURNING row_to_json(wealth_budget_caps);`,
    ),
  );
  const b = value(
    sql(
      `INSERT INTO wealth_budget_caps(user_id,month,category,cap) VALUES('${owner}',date_trunc('month',now()),'Travel',100) RETURNING row_to_json(wealth_budget_caps);`,
    ),
  );
  sql(`SELECT wealth_reallocate('${a.id}','${b.id}',50);`);
  assert.equal(
    value(sql(`SELECT to_json(sum(cap)::text) FROM wealth_budget_caps;`)),
    "400.00",
  );
  assert.notEqual(
    sql(`SELECT wealth_reallocate('${a.id}','${b.id}',100);`, owner, true)
      .status,
    0,
  );
});
test("statement bulk import is transactional and idempotent per account", () => {
  const rows = [
      {
        flowKind: "income",
        amount: "12.34",
        date: "2026-10-01T12:00:00Z",
        source: "Salary",
        accountId: bank.id,
        importKey: "stable-key",
      },
    ],
    raw = JSON.stringify(rows);
  assert.equal(value(sql(`SELECT to_json(wealth_import('${raw}'));`)), 1);
  assert.equal(value(sql(`SELECT to_json(wealth_import('${raw}'));`)), 0);
  const invalid = JSON.stringify([
    { ...rows[0], importKey: "rollback" },
    { ...rows[0], amount: "-1", importKey: "invalid" },
  ]);
  assert.notEqual(
    sql(`SELECT wealth_import('${invalid}');`, owner, true).status,
    0,
  );
  assert.equal(
    value(
      sql(
        `SELECT to_json(count(*)) FROM money_entries WHERE import_key='rollback';`,
      ),
    ),
    0,
  );
});
test("bill payment advances reminder atomically and removing/undoing restores it", () => {
  const bill = value(
    sql(
      `INSERT INTO wealth_bills(user_id,title,amount,next_due,frequency) VALUES('${owner}','Data',10,current_date,'monthly') RETURNING row_to_json(wealth_bills);`,
    ),
  );
  let paid = value(
    sql(
      `SELECT row_to_json(e) FROM wealth_pay_bill('${bill.id}','${cash.id}') e;`,
    ),
  );
  assert.notEqual(
    sql(`SELECT wealth_pay_bill('${bill.id}','${cash.id}');`, owner, true)
      .status,
    0,
  );
  paid = value(entry({}, paid.id, paid.revision, "delete"));
  assert.equal(
    value(
      sql(
        `SELECT to_json(last_paid_on) FROM wealth_bills WHERE id='${bill.id}';`,
      ),
    ),
    null,
  );
  paid = value(entry({}, paid.id, paid.revision, "restore"));
  assert.ok(
    value(
      sql(
        `SELECT to_json(last_paid_on) FROM wealth_bills WHERE id='${bill.id}';`,
      ),
    ),
  );
});
test("circle logs validate member, turn and exact contribution", () => {
  const circle = value(
    sql(
      `INSERT INTO wealth_circles(user_id,title,contribution,starts_on,interval_days,members) VALUES('${owner}','Ajo',100,current_date,7,'["Ada","Tobi"]') RETURNING row_to_json(wealth_circles);`,
    ),
  );
  sql(
    `INSERT INTO wealth_circle_contributions(user_id,circle_id,member_index,round,amount,paid_on) VALUES('${owner}','${circle.id}',0,1,100,current_date);`,
  );
  for (const [m, r, a] of [
    [2, 1, 100],
    [0, 3, 100],
    [1, 1, 99],
  ])
    assert.notEqual(
      sql(
        `INSERT INTO wealth_circle_contributions(user_id,circle_id,member_index,round,amount,paid_on) VALUES('${owner}','${circle.id}',${m},${r},${a},current_date);`,
        owner,
        true,
      ).status,
      0,
    );
});

test('later expense edits can revive a derived allocation while expired parent undo stays blocked',()=>{
 let parent=value(entry({flowKind:'expense',amount:'20',accountId:cash.id}));
 parent=value(entry({flowKind:'income'},parent.id,parent.revision));
 sql(`SET session_replication_role=replica;UPDATE money_entries SET deleted_at=now()-interval '11 minutes' WHERE parent_entry_id='${parent.id}';SET session_replication_role=origin;`,null);
 parent=value(entry({flowKind:'expense'},parent.id,parent.revision));
 assert.equal(value(sql(`SELECT to_json(count(*)) FROM money_entries WHERE parent_entry_id='${parent.id}' AND deleted_at IS NULL;`)),1);
 parent=value(entry({},parent.id,parent.revision,'delete'));
 sql(`SET session_replication_role=replica;UPDATE money_entries SET deleted_at=now()-interval '11 minutes' WHERE id='${parent.id}';SET session_replication_role=origin;`,null);
 assert.notEqual(entry({},parent.id,parent.revision,'restore',owner,true).status,0);
});
