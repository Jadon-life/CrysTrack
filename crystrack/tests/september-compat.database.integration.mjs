import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { loadTs } from "./load-ts.mjs";
const name = `crystrack-compat-${process.pid}`,
  owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
let actor = owner;
const literal = (v) =>
  v == null
    ? "NULL"
    : "'" +
      String(typeof v === "object" ? JSON.stringify(v) : v).replaceAll(
        "'",
        "''",
      ) +
      "'";
const ident = (v) => {
  assert.match(v, /^[a-z_]+$/i);
  return '"' + v + '"';
};
function docker(args, input) {
  const r = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    timeout: 30000,
  });
  if (r.error) throw r.error;
  return r;
}
function sql(query, user = actor) {
  const prefix = user
    ? `SET ROLE authenticated;SET request.jwt.claim.sub=${literal(user)};`
    : "";
  const r = docker(
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
      "--set",
      "VERBOSITY=verbose",
      "-Atq",
    ],
    prefix + query,
  );
  return {
    data:
      r.status === 0 && r.stdout.trim()
        ? JSON.parse(r.stdout.trim().split("\n").at(-1))
        : null,
    error: r.status
      ? {
          code: /ERROR:\s+(\w{5}):/.exec(r.stderr)?.[1] || "UNKNOWN",
          message: r.stderr,
        }
      : null,
  };
}
function ok(query, user = actor) {
  const r = sql(query, user);
  assert.equal(r.error, null, JSON.stringify(r.error));
  return r.data;
}
class Query {
  constructor(table) {
    this.table = table;
    this.conditions = [];
    this.fields = "*";
    this.sort = [];
  }
  select(fields = "*") {
    this.fields = fields;
    return this;
  }
  eq(k, v) {
    this.conditions.push(`${ident(k)}=${literal(v)}`);
    return this;
  }
  is(k, v) {
    assert.equal(v, null);
    this.conditions.push(`${ident(k)} IS NULL`);
    return this;
  }
  order(k, { ascending = true } = {}) {
    this.sort.push(`${ident(k)} ${ascending ? "ASC" : "DESC"}`);
    return this;
  }
  contains(key, values) {
    this.conditions.push(
      `${ident(key)} @> ARRAY[${values.map(literal).join(",")}]::uuid[]`,
    );
    return this;
  }
  limit(count) {
    this.rowLimit = count;
    this.offset = 0;
    return this;
  }
  range(start, end) {
    this.offset = start;
    this.rowLimit = end - start + 1;
    return this;
  }
  insert(payload) {
    this.payload = payload;
    return this;
  }
  upsert(payload) {
    this.payload = payload;
    this.ignore = true;
    return this.execute(true);
  }
  single() {
    return this.execute(true);
  }
  maybeSingle() {
    return this.execute(true);
  }
  then(resolve, reject) {
    return this.execute(false).then(resolve, reject);
  }
  async execute(single) {
    const table = ident(this.table);
    let query;
    if (this.payload) {
      const keys = Object.keys(this.payload);
      query = `INSERT INTO ${table}(${keys.map(ident).join(",")}) VALUES(${keys.map((k) => literal(this.payload[k])).join(",")})${this.ignore ? " ON CONFLICT(id) DO NOTHING" : ""} RETURNING *`;
    } else
      query = `SELECT ${
        this.fields === "*"
          ? "*"
          : this.fields
              .split(",")
              .map((s) => ident(s.trim()))
              .join(",")
      } FROM ${table}${this.conditions.length ? " WHERE " + this.conditions.join(" AND ") : ""}${this.sort.length ? " ORDER BY " + this.sort.join(",") : ""}${this.rowLimit ? " LIMIT " + this.rowLimit + " OFFSET " + this.offset : ""}`;
    return sql(
      `WITH result AS (${query}) SELECT ${single ? "(SELECT row_to_json(result) FROM result LIMIT 1)" : "coalesce(jsonb_agg(to_jsonb(result)),'[]'::jsonb)"} FROM result;`,
    );
  }
}
const db = {
  auth: {
    getUser: async () => ({ data: { user: actor ? { id: actor } : null } }),
  },
  from: (t) => new Query(t),
  rpc: async (fn, p) => {
    const args = Object.entries(p)
      .map(([key, v]) => `${ident(key)}=>${literal(v)}`)
      .join(",");
    return sql(
      fn === "september_finance_transaction"
        ? `SELECT september_finance_transaction(${args});`
        : `SELECT row_to_json(result) FROM ${ident(fn)}(${args}) result;`,
    );
  },
};
const mocks = { "@/lib/supabase/server": { createClient: async () => db } };
const create = loadTs("src/app/api/finance/entries/route.ts", mocks).POST;
const mutate = loadTs("src/app/api/finance/entries/[id]/route.ts", mocks);
const read = loadTs("src/app/api/wealth/route.ts", mocks).GET;
const targetPOST = loadTs("src/app/api/finance/targets/route.ts", mocks).POST;
const request = (body) =>
  new Request("http://localhost/api/finance/entries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
async function post(body, status = 201) {
  const r = await create(request(body));
  const data = await r.json();
  assert.equal(r.status, status, JSON.stringify(data));
  return data;
}
async function change(entry, action, payload = {}, status = 200) {
  const r = await mutate[action === "delete" ? "DELETE" : "PATCH"](
    request({
      expectedRevision: entry.revision,
      ...(action === "delete" ? {} : { action }),
      ...payload,
    }),
    { params: Promise.resolve({ id: entry.id }) },
  );
  const data = await r.json();
  assert.equal(r.status, status, JSON.stringify(data));
  return data;
}
let cash, bank, target, legacy;
before(async () => {
  process.env.SEPTEMBER_COMPAT_DATABASE_VERIFIED = "true";
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
  for (let i = 0; i < 60; i++) {
    if (docker(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]).status === 0) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  assert.ok(ready);
  ok(
    `CREATE ROLE authenticated NOLOGIN;CREATE ROLE anon NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE TABLE auth.users(id uuid PRIMARY KEY);GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;`,
    null,
  );
  for (const f of readdirSync("src/db/migrations")
    .filter((f) => /^000[0-3]_/.test(f))
    .sort())
    ok(readFileSync("src/db/migrations/" + f, "utf8"), null);
  ok(
    `CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array($1,'/') $$;`,
    null,
  );
  for (const f of readdirSync("src/db/migrations")
    .filter((f) => /^000[45]_/.test(f))
    .sort())
    ok(readFileSync("src/db/migrations/" + f, "utf8"), null);
  ok(
    `INSERT INTO auth.users VALUES('${owner}'),('${other}');GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;INSERT INTO profiles(user_id,timezone,current_timezone) VALUES('${owner}','Africa/Lagos','Africa/Lagos'),('${other}','UTC','UTC');`,
    null,
  );
  legacy = ok(
    `WITH e AS(INSERT INTO money_entries(user_id,type,flow_kind,amount,source) VALUES('${owner}','income','income',1000.01,'Historical record') RETURNING *)SELECT row_to_json(e) FROM e;`,
  );
  for (const f of readdirSync("tests/fixtures/compat-schema")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    ok(readFileSync("tests/fixtures/compat-schema/" + f, "utf8"), null);
  ok(
    readFileSync("src/db/migrations/0012_september_compatibility.sql", "utf8"),
    null,
  );
  cash = ok(
    `SELECT row_to_json(a) FROM wealth_accounts a WHERE user_id='${owner}' ORDER BY created_at,id LIMIT 1;`,
  );
  bank = ok(
    `WITH a AS(INSERT INTO wealth_accounts(user_id,name,kind) VALUES('${owner}','Bank','bank') RETURNING *)SELECT row_to_json(a) FROM a;`,
  );
  target = ok(
    `WITH t AS(INSERT INTO finance_targets(user_id,title,target_amount) VALUES('${owner}','Laptop',10000) RETURNING *)SELECT row_to_json(t) FROM t;`,
  );
});
after(() => {
  docker(["rm", "--force", name]);
  delete process.env.SEPTEMBER_COMPAT_DATABASE_VERIFIED;
});
test("actual POST credits one savings contribution once and emits one activity", async () => {
  const e = await post({
    flowKind: "saving",
    amount: "100.10",
    targetId: target.id,
    accountId: cash.id,
  });
  assert.equal(
    ok(
      `SELECT to_json(current_amount::text) FROM finance_targets WHERE id=${literal(target.id)};`,
    ),
    "100.10",
  );
  assert.equal(
    ok(
      `SELECT to_json(count(*)) FROM activity_events WHERE entity_id=${literal(e.id)};`,
    ),
    1,
  );
  assert.equal(
    ok(
      `SELECT to_json(count(*)) FROM money_entries WHERE id=${literal(e.id)};`,
    ),
    1,
  );
  const release = await post({
    flowKind: "savings_release",
    amount: "30.05",
    targetId: target.id,
    accountId: cash.id,
  });
  assert.equal(
    ok(
      `SELECT to_json(current_amount::text) FROM finance_targets WHERE id=${literal(target.id)};`,
    ),
    "70.05",
  );
  await post(
    { flowKind: "savings_release", amount: "999", targetId: target.id },
    400,
  );
  assert.equal(
    ok(
      `SELECT to_json(current_amount::text) FROM finance_targets WHERE id=${literal(target.id)};`,
    ),
    "70.05",
  );
  assert.ok(release.id);
});
test("unlinked savings and releases use exact amounts and reject negative saved balance", async () => {
  await post({ flowKind: "saving", amount: "0.10" });
  await post({ flowKind: "saving", amount: "0.20" });
  await post({ flowKind: "savings_release", amount: "0.30" });
  await post({ flowKind: "expense", amount: "-0.01" }, 400);
  await post({ flowKind: "saving", amount: "0.001" }, 400);
  await post({ flowKind: "savings_release", amount: "99999" }, 400);
});
test("transfers require two owned distinct accounts and do not affect global spending totals", async () => {
  const before = await (await read()).json();
  await post({
    flowKind: "transfer",
    amount: "1.01",
    accountId: cash.id,
    destinationAccountId: bank.id,
  });
  const after = await (await read()).json();
  assert.equal(
    after.summary.exact.availableBalance,
    before.summary.exact.availableBalance,
  );
  assert.equal(
    after.summary.exact.monthExpenses,
    before.summary.exact.monthExpenses,
  );
  for (const body of [
    { flowKind: "transfer", amount: "1" },
    {
      flowKind: "transfer",
      amount: "1",
      accountId: cash.id,
      destinationAccountId: cash.id,
    },
    {
      flowKind: "transfer",
      amount: "1",
      accountId: cash.id,
      destinationAccountId: randomUUID(),
    },
  ])
    await post(
      body,
      body.destinationAccountId && body.destinationAccountId !== body.accountId
        ? 403
        : 400,
    );
});
test("revisions, soft delete and restoration change target totals once, reject stale edits", async () => {
  let e = await post({
    flowKind: "saving",
    amount: "10.00",
    category: "Savings",
    targetId: target.id,
  });
  const starting = ok(
    `SELECT to_json(current_amount::text) FROM finance_targets WHERE id=${literal(target.id)};`,
  );
  const stale = e;
  e = await change(e, "save", { amount: "12.34" });
  await change(stale, "save", { amount: "1.00" }, 409);
  e = await change(e, "save", {note:"A helpful note"});
  assert.equal(e.category,"Savings","partial edits preserve unspecified category");
  e = await change(e, "delete");
  assert.ok(e.deleted_at);
  let snapshot = await (await read()).json();
  assert.ok(!snapshot.entries.some((row) => row.id === e.id));
  e = await change(e, "restore");
  assert.equal(e.deleted_at, null);
  const end = ok(
    `SELECT to_json(current_amount::text) FROM finance_targets WHERE id=${literal(target.id)};`,
  );
  const { toKobo } = loadTs("src/lib/money.ts");
  assert.equal(toKobo(end) - toKobo(starting), BigInt(234));
  assert.notEqual(
    sql(`DELETE FROM money_entries WHERE id=${literal(e.id)};`).error,
    null,
  );
});
test("failed target release rolls back every ledger/target/event side effect", async () => {
  const count = ok("SELECT to_json(count(*)) FROM money_entries;"),
    balance = ok(
      `SELECT to_json(current_amount::text) FROM finance_targets WHERE id=${literal(target.id)};`,
    );
  await post(
    { flowKind: "savings_release", amount: "9000", targetId: target.id },
    400,
  );
  assert.equal(ok("SELECT to_json(count(*)) FROM money_entries;"), count);
  assert.equal(
    ok(
      `SELECT to_json(current_amount::text) FROM finance_targets WHERE id=${literal(target.id)};`,
    ),
    balance,
  );
});
test("user ownership and RLS isolate all financial rows and mutations", async () => {
  const foreign = ok(
    `WITH a AS(INSERT INTO wealth_accounts(user_id,name,kind)VALUES('${other}','Other','bank') RETURNING *)SELECT row_to_json(a) FROM a;`,
    other,
  );
  await post(
    {
      flowKind: "transfer",
      amount: "1",
      accountId: cash.id,
      destinationAccountId: foreign.id,
    },
    403,
  );
  actor = other;
  assert.equal(
    ok(`SELECT to_json(count(*)) FROM money_entries WHERE user_id='${owner}';`),
    0,
  );
  await post({ flowKind: "saving", amount: "1", targetId: target.id }, 403);
  const r = await mutate.DELETE(request({ expectedRevision: 1 }), {
    params: Promise.resolve({ id: legacy.id }),
  });
  assert.equal(r.status, 404);
  actor = owner;
});
test("read totals include historical/account balances, exclude tombstones, preserve old rows", async () => {
  const before = await (await read()).json();
  let e = await post({ flowKind: "expense", amount: "0.10" });
  await post({ flowKind: "expense", amount: "0.20" });
  const middle = await (await read()).json();
  const { signedKobo } = loadTs("src/lib/money.ts");
  assert.equal(
    signedKobo(before.summary.exact.availableBalance) -
      signedKobo(middle.summary.exact.availableBalance),
    BigInt(30),
  );
  await change(e, "delete");
  const after = await (await read()).json();
  assert.equal(
    signedKobo(before.summary.exact.availableBalance) -
      signedKobo(after.summary.exact.availableBalance),
    BigInt(20),
  );
  const old = ok(
    `SELECT row_to_json(e) FROM money_entries e WHERE id=${literal(legacy.id)};`,
  );
  assert.equal(old.amount, 1000.01);
  assert.equal(old.source, legacy.source);
  assert.equal(old.date, legacy.date);
  assert.equal(old.deleted_at, null);
});
test("target creation, fractional validation and unknown-field rejection use secure API", async () => {
  const r = await targetPOST(
    request({
      title: "Precise target",
      targetAmount: "0.30",
      deadline: null,
      description: "",
    }),
  );
  assert.equal(r.status, 201);
  assert.equal((await r.json()).target_amount, 0.3);
  await post({ flowKind: "expense", amount: "1", savings_bps: 10000 }, 400);
  await post({ flowKind: "saving", amount: "1", type: "expense" }, 400);
});
test("unverified previews reject writes before touching financial records", async () => {
  delete process.env.SEPTEMBER_COMPAT_DATABASE_VERIFIED;
  await post({ flowKind: "income", amount: "1" }, 503);
  process.env.SEPTEMBER_COMPAT_DATABASE_VERIFIED = "true";
});
test("Spend & Save, target locks and derived ledger rows preserve atomic effects", async () => {
  ok(
    `INSERT INTO wealth_settings(user_id,spend_save_bps,target_id)VALUES('${owner}',1000,${literal(target.id)});`,
  );
  const balance = () =>
    ok(
      `SELECT to_json(current_amount::text) FROM finance_targets WHERE id=${literal(target.id)};`,
    );
  const { toKobo } = loadTs("src/lib/money.ts");
  const start = toKobo(balance());
  let e = await post({
    flowKind: "expense",
    amount: "10.00",
    accountId: cash.id,
  });
  assert.equal(toKobo(balance()) - start, BigInt(100));
  assert.equal(
    ok(
      `SELECT to_json(count(*))FROM money_entries WHERE parent_entry_id=${literal(e.id)};`,
    ),
    1,
  );
  e = await change(e, "save", { amount: "20.00" });
  assert.equal(toKobo(balance()) - start, BigInt(200));
  e = await change(e, "delete");
  assert.equal(toKobo(balance()), start);
  e = await change(e, "restore");
  assert.equal(toKobo(balance()) - start, BigInt(200));
  const locked = ok(
    `WITH t AS(INSERT INTO finance_targets(user_id,title,target_amount,locked_until)VALUES('${owner}','Protected',100,current_date+7)RETURNING*)SELECT row_to_json(t)FROM t;`,
  );
  await post({ flowKind: "saving", amount: "1", targetId: locked.id });
  await post(
    { flowKind: "savings_release", amount: "0.50", targetId: locked.id },
    400,
  );
});
test("multi-row failure rolls back ledger, targets, events and allocations together", () => {
  const count = ok("SELECT to_json(count(*))FROM money_entries;"),
    events = ok("SELECT to_json(count(*))FROM activity_events;");
  const rows = [
    {
      flowKind: "income",
      amount: "5.00",
      accountId: cash.id,
      importKey: "rollback-first",
    },
    {
      flowKind: "expense",
      amount: "-1.00",
      accountId: cash.id,
      importKey: "rollback-bad",
    },
  ];
  assert.ok(sql(`SELECT to_json(wealth_import(${literal(rows)}));`).error);
  assert.equal(ok("SELECT to_json(count(*))FROM money_entries;"), count);
  assert.equal(ok("SELECT to_json(count(*))FROM activity_events;"), events);
});
test("assignment completion delegates its event to 0007 and is repeat-safe at the database boundary", async () => {
  const a = ok(
    `WITH a AS(INSERT INTO assignments(user_id,title,deadline)VALUES('${owner}','Compatibility coursework',now()+interval '1 day')RETURNING*)SELECT row_to_json(a)FROM a;`,
  );
  const complete = loadTs(
    "src/app/api/assignments/[id]/complete/route.ts",
    mocks,
  ).PATCH;
  const r = await complete(request({}), {
    params: Promise.resolve({ id: a.id }),
  });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, "completed");
  const again = await complete(request({}), {
    params: Promise.resolve({ id: a.id }),
  });
  assert.equal(again.status, 404);
  assert.equal(
    ok(
      `SELECT to_json(count(*))FROM activity_events WHERE entity_id=${literal(a.id)} AND type='assignment_completed';`,
    ),
    1,
  );
});

test("goal check-in relies on 0006 progress sync exactly once and rejects duplicate occurrences", async () => {
  const priorKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "";
  try {
    const goal = ok(
      `WITH g AS(INSERT INTO goals(user_id,title,deadline,measurable,progress_mode,starting_value,target_value,progress_value,checkin_config)VALUES('${owner}','Compatibility goal',now()+interval '1 day',true,'percentage',0,20,0,'{"frequency":"daily","days":[],"time":"00:00","channels":[]}')RETURNING*)SELECT row_to_json(g)FROM g;`,
    );
    const checkin = loadTs(
      "src/app/api/goals/[id]/checkins/route.ts",
      mocks,
    ).POST;
    const context = { params: Promise.resolve({ id: goal.id }) };
    const response = await checkin(
      request({ progressValue: "3", responseText: "A steady step." }),
      context,
    );
    const result = await response.json();
    assert.equal(response.status, 201, JSON.stringify(result));
    assert.equal(
      ok(
        `SELECT to_json(progress_value::text)FROM goals WHERE id=${literal(goal.id)};`,
      ),
      "3.00",
    );
    assert.equal(
      ok(`SELECT to_json(revision)FROM goals WHERE id=${literal(goal.id)};`),
      1,
    );
    const duplicate = await checkin(request({ progressValue: "4" }), context);
    assert.equal(duplicate.status, 409);
    assert.equal(
      ok(
        `SELECT to_json(count(*))FROM activity_events WHERE entity_id=${literal(goal.id)} AND type='goal_checkin';`,
      ),
      1,
    );
  } finally {
    if (priorKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = priorKey;
  }
});

test("legacy finance endpoint maps snake-case safely and emits no extra target/event effects", async () => {
  const legacyPOST = loadTs("src/app/api/finance/route.ts", mocks).POST;
  const before = ok(
    `SELECT to_json(current_amount::text)FROM finance_targets WHERE id=${literal(target.id)};`,
  );
  const response = await legacyPOST(
    request({ type: "saving", amount: "0.01", target_id: target.id }),
  );
  const e = await response.json();
  assert.equal(response.status, 201, JSON.stringify(e));
  const { toKobo } = loadTs("src/lib/money.ts");
  assert.equal(
    toKobo(
      ok(
        `SELECT to_json(current_amount::text)FROM finance_targets WHERE id=${literal(target.id)};`,
      ),
    ) - toKobo(before),
    BigInt(1),
  );
  assert.equal(
    ok(
      `SELECT to_json(count(*))FROM activity_events WHERE entity_id=${literal(e.id)};`,
    ),
    1,
  );
});

test("account overdrafts, income deletion and failed derived allocations roll back atomically", async () => {
  const account = ok(
    `WITH a AS(INSERT INTO wealth_accounts(user_id,name,kind)VALUES('${owner}','Balance guard','bank')RETURNING*)SELECT row_to_json(a)FROM a;`,
  );
  ok(`UPDATE wealth_settings SET spend_save_bps=0 WHERE user_id='${owner}';`);
  const income = await post({
    flowKind: "income",
    amount: "1.00",
    accountId: account.id,
  });
  await post({ flowKind: "expense", amount: "1.00", accountId: account.id });
  const rows = ok("SELECT to_json(count(*))FROM money_entries;"),
    events = ok("SELECT to_json(count(*))FROM activity_events;");
  await post(
    {
      flowKind: "transfer",
      amount: "0.01",
      accountId: account.id,
      destinationAccountId: cash.id,
    },
    400,
  );
  await change(income, "delete", {}, 400);
  assert.equal(ok("SELECT to_json(count(*))FROM money_entries;"), rows);
  assert.equal(ok("SELECT to_json(count(*))FROM activity_events;"), events);
  assert.equal(
    ok(
      `SELECT to_json(deleted_at) FROM money_entries WHERE id=${literal(income.id)};`,
    ),
    null,
  );
  await post({ flowKind: "income", amount: "1.00", accountId: account.id });
  ok(
    `UPDATE wealth_settings SET spend_save_bps=1000 WHERE user_id='${owner}';`,
  );
  const targetBalance = ok(
      `SELECT to_json(current_amount::text)FROM finance_targets WHERE id=${literal(target.id)};`,
    ),
    count = ok("SELECT to_json(count(*))FROM money_entries;");
  await post(
    { flowKind: "expense", amount: "1.00", accountId: account.id },
    400,
  );
  assert.equal(ok("SELECT to_json(count(*))FROM money_entries;"), count);
  assert.equal(
    ok(
      `SELECT to_json(current_amount::text)FROM finance_targets WHERE id=${literal(target.id)};`,
    ),
    targetBalance,
  );
  assert.equal(
    ok(
      `SELECT to_json(balance::text)FROM september_account_balances() WHERE id=${literal(account.id)};`,
    ),
    "1.00",
  );
});

test("retries of one contribution return the same ledger row without duplicate financial/event effects", async () => {
  const requestId = randomUUID(),
    payload = {
      flowKind: "saving",
      amount: "0.01",
      targetId: target.id,
      requestId,
    };
  const first = await post(payload),
    again = await post(payload);
  assert.equal(first.id, again.id);
  assert.equal(
    ok(
      `SELECT to_json(count(*))FROM money_entries WHERE import_key=${literal("september:" + requestId)};`,
    ),
    1,
  );
  assert.equal(
    ok(
      `SELECT to_json(count(*))FROM activity_events WHERE entity_id=${literal(first.id)};`,
    ),
    1,
  );
  await post({ ...payload, amount: "0.02" }, 409);
});

test("concurrent account spends serialize: only one can consume the final balance", async () => {
  const a = ok(
    `WITH a AS(INSERT INTO wealth_accounts(user_id,name,kind)VALUES('${owner}','Concurrency','bank')RETURNING*)SELECT row_to_json(a)FROM a;`,
  );
  ok(`UPDATE wealth_settings SET spend_save_bps=0 WHERE user_id='${owner}';`);
  await post({ flowKind: "income", amount: "1.00", accountId: a.id });
  async function spend() {
    return new Promise((resolve, reject) => {
      const child = spawn("docker", [
        "exec",
        "-i",
        name,
        "psql",
        "-U",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-Atq",
      ]);
      let error = "";
      child.stderr.on("data", (chunk) => (error += chunk));
      child.stdout.resume();
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, error }));
      child.stdin.end(
        `SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';SELECT september_finance_transaction('entry',${literal({ id: null, payload: { flowKind: "expense", amount: "0.75", accountId: a.id } })});`,
      );
    });
  }
  const results = await Promise.all([spend(), spend()]);
  assert.equal(results.filter((r) => r.code === 0).length, 1);
  assert.equal(results.filter((r) => r.code !== 0).length, 1);
  assert.equal(
    ok(
      `SELECT to_json(balance::text)FROM september_account_balances() WHERE id=${literal(a.id)};`,
    ),
    "0.25",
  );
  assert.equal(
    ok(
      `SELECT to_json(count(*))FROM money_entries WHERE account_id=${literal(a.id)} AND flow_kind='expense';`,
    ),
    1,
  );
});

test("debt and expected-money adapters use the balance-checked transaction and preserve decimal contracts", async () => {
  const debtApi = loadTs("src/app/api/wealth/debts/route.ts", mocks);
  const created = await debtApi.POST(
    request({
      kind: "liability",
      counterparty: "Isolated lender",
      amount: "10.01",
      dueDate: null,
      note: "",
    }),
  );
  const debt = await created.json();
  assert.equal(created.status, 201, JSON.stringify(debt));
  const repaid = await debtApi.PATCH(
    request({ debtId: debt.id, amount: "0.01" }),
  );
  const repayment = await repaid.json();
  assert.equal(repaid.status, 200, JSON.stringify(repayment));
  assert.equal(
    ok(
      `SELECT to_json(outstanding_amount::text)FROM wealth_debts WHERE id=${literal(debt.id)};`,
    ),
    "10.00",
  );
  const tooMuch = await debtApi.PATCH(
    request({ debtId: debt.id, amount: "11.00" }),
  );
  assert.equal(tooMuch.status, 400);
  const expected = loadTs("src/app/api/wealth/expected/route.ts", mocks);
  const forecast = await expected.POST(
    request({
      title: "Isolated expected income",
      direction: "income",
      amountMin: "1.00",
      amountMax: "2.00",
      frequency: "one_off",
      expectedOn: null,
      category: "Work",
      timingHint: "",
      note: "",
    }),
  );
  const flow = await forecast.json();
  assert.equal(forecast.status, 201, JSON.stringify(flow));
  const confirmed = await expected.PATCH(
    request({ action: "confirm", flowId: flow.id, actualAmount: "1.23" }),
  );
  assert.equal(confirmed.status, 200, JSON.stringify(await confirmed.json()));
  assert.equal(
    ok(
      `SELECT to_json(count(*))FROM money_entries WHERE expected_flow_id=${literal(flow.id)};`,
    ),
    1,
  );
  assert.equal(
    ok(
      `SELECT to_json(sum(amount)::text)FROM money_entries WHERE expected_flow_id=${literal(flow.id)};`,
    ),
    "1.23",
  );
});

test("compatibility functions retain invoker ownership and deny anonymous execution", () => {
  assert.equal(
    ok(
      "SELECT to_json(has_function_privilege('anon','september_finance_transaction(text,jsonb)','execute'));",
      null,
    ),
    false,
  );
  assert.equal(
    ok(
      "SELECT to_json(has_function_privilege('authenticated','september_finance_transaction(text,jsonb)','execute'));",
      null,
    ),
    true,
  );
  assert.equal(
    ok(
      "SELECT to_json(prosecdef)FROM pg_proc WHERE oid='september_finance_transaction(text,jsonb)'::regprocedure;",
      null,
    ),
    false,
  );
  assert.equal(
    ok(
      "SELECT to_json(relrowsecurity)FROM pg_class WHERE oid='money_entries'::regclass;",
      null,
    ),
    true,
  );
});

test("historical permanent task deletion refuses linked goals instead of leaving broken references", async () => {
  const task = ok(
    `WITH t AS(INSERT INTO recurring_tasks(user_id,title)VALUES('${owner}','Linked routine')RETURNING*)SELECT row_to_json(t)FROM t;`,
  );
  ok(
    `INSERT INTO goals(user_id,title,task_ids)VALUES('${owner}','Linked goal',ARRAY[${literal(task.id)}]::uuid[]);`,
  );
  const remove = loadTs("src/app/api/tasks/[taskId]/route.ts", mocks).DELETE;
  const r = await remove(request({}), {
    params: Promise.resolve({ taskId: task.id }),
  });
  assert.equal(r.status, 409);
  assert.ok((await r.json()).error.includes("Archive"));
  assert.equal(
    ok(
      `SELECT to_json(count(*))FROM recurring_tasks WHERE id=${literal(task.id)};`,
    ),
    1,
  );
});

test("additive 0012 can be reapplied without changing existing ledger or event rows", () => {
  const entries = ok("SELECT to_json(count(*))FROM money_entries;"),
    events = ok("SELECT to_json(count(*))FROM activity_events;");
  ok(
    readFileSync("src/db/migrations/0012_september_compatibility.sql", "utf8"),
    null,
  );
  assert.equal(ok("SELECT to_json(count(*))FROM money_entries;"), entries);
  assert.equal(ok("SELECT to_json(count(*))FROM activity_events;"), events);
});
