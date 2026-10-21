/** Guarded disposable local Supabase only; never reads hosted bindings or records. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { localSql, readLocalKeys, assertTarget } from '../scripts/local-supabase.mjs';
import { localEnvironment, DOCKER_SOCKET, PROJECT } from '../scripts/local-supabase-policy.mjs';
const users = [];
const wealth = {};
new Function(
  'exports',
  ts.transpileModule(fs.readFileSync('src/lib/wealth.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
)(wealth);
function forecast(u) {
  const data = JSON.parse(
    scalar(
      `SELECT jsonb_build_object('entries',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM money_entries t WHERE user_id='${u}'),'debts',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM wealth_debts t WHERE user_id='${u}'),'flows',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM wealth_expected_flows t WHERE user_id='${u}'))::text`,
    ),
  );
  return wealth.summarizeWealth(
    data.entries,
    data.debts,
    data.flows,
    new Date('2026-10-19T12:00:00Z'),
  );
}

const q = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const role = (u, sql) =>
  `BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${sql};COMMIT;`;
const owner = (u, sql) => localSql(role(u, sql));
const scalar = (sql) => localSql(sql).split('\n').at(-1);
const json = (u, expr) =>
  JSON.parse(
    owner(u, 'SELECT ' + expr)
      .split('\n')
      .at(-1),
  );
const clock = (instant) =>
  localSql(
    `CREATE OR REPLACE FUNCTION crystrack_budgets.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT ${q(instant)}::timestamptz $$`,
  );
after(() => {
  localSql(
    "CREATE OR REPLACE FUNCTION crystrack_budgets.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT clock_timestamp() $$",
  );
  for (const u of users) {
    localSql(
      `DELETE FROM money_entries WHERE user_id='${u}';DELETE FROM finance_targets WHERE user_id='${u}';DELETE FROM wealth_debts WHERE user_id='${u}';DELETE FROM wealth_expected_flows WHERE user_id='${u}'`,
    );
  }
});
function fixture(zone = 'Africa/Lagos', instant = '2026-10-19T12:00:00Z') {
  clock(instant);
  const u = randomUUID();
  users.push(u);
  localSql(
    `INSERT INTO auth.users(id,email) VALUES('${u}','${u}@example.invalid');INSERT INTO profiles(user_id,timezone,scheduling_timezone) VALUES('${u}',${q(zone)},${q(zone)});`,
  );
  json(u, 'sep28_crystal_state()');
  json(u, 'daily_context()');
  return u;
}
const view = (u, m = null) => json(u, `wealth_budget_month(${m ? q(m) : 'NULL'})`);
const item = (u, c = 'Food', m = null) => view(u, m).items.find((b) => b.category === c);
const expr = (
  category = 'Food',
  amount = '100.00',
  rev = 0,
  request = randomUUID(),
  month = '2026-10-01',
  zone = 'Africa/Lagos',
  action = 'set',
) =>
  `wealth_budget_mutate(${q(action)},${q(month)},${q(category)},${amount === null ? 'NULL' : q(amount)},${rev},'${request}',${q(zone)})`;
const set = (u, ...args) => json(u, expr(...args));
function entry(
  u,
  kind = 'expense',
  category = 'Food',
  amount = '0.01',
  date = '2026-10-19T12:00:00Z',
  type = 'expense',
  extra = '',
) {
  const id = randomUUID();
  owner(
    u,
    `INSERT INTO money_entries(id,user_id,type,flow_kind,category,amount,date${extra ? ',expected_flow_id' : ''}) VALUES('${id}','${u}',${q(type)},${kind === null ? 'NULL' : q(kind)},${category === null ? 'NULL' : q(category)},${q(amount)},${q(date)}${extra ? ',' + q(extra) : ''})`,
  );
  return id;
}
function snapshot(u) {
  return scalar(`SELECT jsonb_build_object('money',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM money_entries t WHERE user_id='${u}'),
 'targets',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM finance_targets t WHERE user_id='${u}'),
 'debts',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM wealth_debts t WHERE user_id='${u}'),
 'expected',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM wealth_expected_flows t WHERE user_id='${u}'),
 'awards',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM sep28_crystal_awards t WHERE user_id='${u}'),
 'events',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM sep28_crystal_events t WHERE user_id='${u}'),
 'daily',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY day_key),'[]') FROM daily_records t WHERE user_id='${u}'),
 'routines',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM daily_routine_records t WHERE user_id='${u}'))::text`);
}
const fails = (f) => assert.throws(f, /psql|docker/);
test('budget RLS and ACL isolate A/B and deny anon, forged owner and direct writes', () => {
  const a = fixture(),
    b = fixture();
  const result = set(a);
  assert.equal(result.revision, 1);
  assert.equal(
    Number(owner(b, 'SELECT count(*) FROM wealth_monthly_budgets').split('\n').at(-1)),
    0,
  );
  assert.equal(item(b).limit, null);
  assert.equal(item(b).spent, '0.00');
  fails(() =>
    owner(
      b,
      `INSERT INTO wealth_monthly_budgets(user_id,month,category,limit_amount) VALUES('${a}','2026-10-01','Food',100)`,
    ),
  );
  fails(() => owner(a, `UPDATE wealth_monthly_budgets SET limit_amount=1 WHERE id='${result.id}'`));
  fails(() => owner(a, 'DELETE FROM wealth_monthly_budgets'));
  fails(() => owner(a, 'SELECT * FROM crystrack_budgets.requests'));
  fails(() => localSql('BEGIN;SET LOCAL ROLE anon;SELECT wealth_budget_month();COMMIT;'));
  fails(() => localSql('BEGIN;SET LOCAL ROLE authenticated;SELECT wealth_budget_month();COMMIT;'));
  assert.equal(
    scalar(
      "SELECT count(*) FROM pg_policies WHERE tablename='wealth_monthly_budgets' AND cmd='SELECT'",
    ),
    '1',
  );
  assert.equal(
    scalar("SELECT has_function_privilege('anon','wealth_budget_month(date)','EXECUTE')"),
    'f',
  );
});
test('exact NUMERIC aggregates cover 2,001+ entries, cents and totals beyond per-entry storage precision', () => {
  const u = fixture();
  owner(
    u,
    `INSERT INTO money_entries(user_id,type,flow_kind,category,amount,date) SELECT '${u}','expense','expense','Food',0.01,'2026-10-19T12:00Z' FROM generate_series(1,2001)`,
  );
  assert.equal(item(u).spent, '20.01');
  assert.equal(item(u).entryCount, 2001);
  entry(u, 'expense', 'Food', '9999999999.99');
  entry(u, 'expense', 'Food', '9999999999.99');
  set(u, 'Food', '9999999999.99');
  const b = item(u);
  assert.equal(b.spent, '20000000019.99');
  assert.equal(b.left, '-10000000020.00');
  assert.equal(b.percentUsed, '200.00');
});
test('expense classification excludes all money movements and pending flows; confirmed actuals counted once', () => {
  const u = fixture();
  for (const kind of [
    'income',
    'saving',
    'savings_release',
    'transfer',
    'lend',
    'borrow',
    'liability_repayment',
    'receivable_repayment',
  ])
    entry(u, kind, 'Food', '123.45');
  entry(u, 'expense', 'Food', '1.01');
  entry(u, null, 'Food', '2.02');
  const pending = randomUUID();
  localSql(
    `INSERT INTO wealth_expected_flows(id,user_id,direction,title,category,amount_min,status) VALUES('${pending}','${u}','expense','Synthetic pending','Food',900,'active')`,
  );
  entry(u, 'expense', 'Food', '3.03', '2026-10-19T12:00:00Z', 'expense', pending);
  const b = item(u);
  assert.equal(b.spent, '6.06');
  assert.equal(b.entryCount, 3);
  entry(u, 'saving', 'Savings', '80.00');
  entry(u, 'expense', 'Savings', '7.07');
  assert.equal(item(u, 'Savings').spent, '7.07');
  entry(u, 'expense', null, '1.00');
  entry(u, 'expense', '   ', '2.00');
  entry(u, 'expense', 'Unknown legacy', '3.00');
  assert.equal(item(u, 'Other').spent, '6.00');
});
test('source edits, reclassification and hard deletes refresh exact spending without copied aggregates', () => {
  const u = fixture();
  const id = entry(u, 'expense', 'Food', '10.10');
  assert.equal(item(u).spent, '10.10');
  owner(u, `UPDATE money_entries SET category='Transport',amount=12.34 WHERE id='${id}'`);
  assert.equal(item(u).spent, '0.00');
  assert.equal(item(u, 'Transport').spent, '12.34');
  owner(u, `UPDATE money_entries SET flow_kind='saving' WHERE id='${id}'`);
  assert.equal(item(u, 'Transport').spent, '0.00');
  owner(u, `UPDATE money_entries SET flow_kind='expense' WHERE id='${id}'`);
  assert.equal(item(u, 'Transport').spent, '12.34');
  owner(u, `DELETE FROM money_entries WHERE id='${id}'`);
  assert.equal(item(u, 'Transport').spent, '0.00');
});
test('saved-zone month boundaries, leap/DST dates and midnight rollover are calendar-correct', () => {
  const u = fixture('Africa/Lagos', '2028-02-29T12:00:00Z');
  entry(u, 'expense', 'Food', '1.01', '2028-01-31T23:00:00Z');
  entry(u, 'expense', 'Food', '2.02', '2028-02-29T22:59:59Z');
  entry(u, 'expense', 'Food', '9.99', '2028-02-29T23:00:00Z');
  let v = view(u);
  assert.equal(v.month, '2028-02-01');
  assert.equal(item(u).spent, '3.03');
  assert.equal(new Date(v.endsAt).toISOString(), '2028-02-29T23:00:00.000Z');
  clock('2028-02-29T23:00:00Z');
  assert.equal(view(u).month, '2028-03-01');
  assert.equal(item(u).spent, '9.99');
  const ny = fixture('America/New_York', '2026-03-19T12:00:00Z');
  v = view(ny);
  assert.equal(new Date(v.startsAt).toISOString(), '2026-03-01T05:00:00.000Z');
  assert.equal(new Date(v.endsAt).toISOString(), '2026-04-01T04:00:00.000Z');
  entry(ny, 'expense', 'Food', '2.00', '2026-03-01T04:59:59Z');
  entry(ny, 'expense', 'Food', '3.00', '2026-03-01T05:00:00Z');
  assert.equal(item(ny).spent, '3.00');
  clock('2026-11-19T12:00:00Z');
  v = view(ny);
  assert.equal(new Date(v.startsAt).toISOString(), '2026-11-01T04:00:00.000Z');
  assert.equal(new Date(v.endsAt).toISOString(), '2026-12-01T05:00:00.000Z');
});
test('past months are bounded read-only, no backfill/carryover; stale timezone/month writes conflict', () => {
  const u = fixture();
  set(u);
  clock('2026-11-01T12:00:00Z');
  assert.equal(item(u).limit, null);
  assert.equal(item(u, 'Food', '2026-10-01').limit, '100.00');
  fails(() => set(u));
  fails(() => view(u, '2026-11-02'));
  fails(() => view(u, '2025-10-01'));
  fails(() => view(u, '2026-12-01'));
  localSql(`UPDATE profiles SET scheduling_timezone='America/New_York' WHERE user_id='${u}'`);
  fails(() => set(u, 'Food', '50', 0, randomUUID(), '2026-11-01', 'Africa/Lagos'));
  assert.equal(view(u).timezone, 'America/New_York');
});
test('all CRUD is atomic, optimistic and idempotent, including removed target tombstones and delayed retries', () => {
  const u = fixture(),
    id = randomUUID();
  const expression = expr('Food', '80.01', 0, id);
  const a = json(u, expression);
  assert.deepEqual(json(u, expression), a);
  assert.equal(item(u).revision, 1);
  fails(() => set(u, 'Food', '90', 0, id));
  fails(() => set(u, 'Food', '90', 0));
  const edited = set(u, 'Food', '90.02', 1);
  assert.equal(edited.revision, 2);
  const deletion = expr('Food', null, 2, randomUUID(), '2026-10-01', 'Africa/Lagos', 'remove');
  const removed = json(u, deletion);
  assert.equal(removed.active, false);
  assert.deepEqual(json(u, deletion), removed);
  assert.equal(item(u).limit, null);
  assert.equal(item(u).revision, 3);
  assert.deepEqual(json(u, expression), a);
  assert.equal(item(u).limit, null, 'old create replay must not resurrect removed limit');
  const restored = set(u, 'Food', '12.34', 3);
  assert.equal(restored.id, a.id);
  assert.equal(item(u).revision, 4);
  clock('2026-11-01T12:00Z');
  assert.deepEqual(
    json(u, deletion),
    removed,
    'exact old receipt can be acknowledged without modifying closed month',
  );
});
test('strict amounts/categories/months reject NaN, floats, overflow, zero and malformed payloads', () => {
  const u = fixture();
  for (const value of [
    '-1',
    '0',
    '0.00',
    'NaN',
    'Infinity',
    '1e3',
    '1.001',
    '10000000000',
    ' 1',
    '01.00',
    '1,000',
  ])
    fails(() => set(u, 'Food', value));
  fails(() => set(u, 'Crypto', '100'));
  fails(() => set(u, 'Food', '100', 0, randomUUID(), '2026-10-02'));
  assert.equal(item(u).id, null);
});
function concurrent(u, sql) {
  assertTarget();
  return new Promise((resolve) => {
    const p = spawn(
      'docker',
      [
        '--host',
        DOCKER_SOCKET,
        'exec',
        '-i',
        'supabase_db_' + PROJECT,
        'psql',
        '-X',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-tA',
      ],
      { env: localEnvironment(process.env), stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let out = '',
      err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('exit', (code) => resolve({ code, out, err }));
    p.stdin.end(role(u, sql));
  });
}
test('concurrent create/edit and exact duplicate requests serialize: one revision/record, PT409 loser', async () => {
  const u = fixture();
  let result = await Promise.all([
    concurrent(u, 'SELECT ' + expr('Food', '80')),
    concurrent(u, 'SELECT ' + expr('Food', '90')),
  ]);
  assert.equal(result.filter((r) => r.code === 0).length, 1);
  assert.equal(item(u).revision, 1);
  assert.equal(scalar(`SELECT count(*) FROM wealth_monthly_budgets WHERE user_id='${u}'`), '1');
  const same = expr('Food', '95', 1, randomUUID());
  result = await Promise.all([concurrent(u, 'SELECT ' + same), concurrent(u, 'SELECT ' + same)]);
  assert.ok(result.every((r) => r.code === 0));
  assert.equal(item(u).revision, 2);
  result = await Promise.all([
    concurrent(u, 'SELECT ' + expr('Food', '100', 2)),
    concurrent(u, 'SELECT ' + expr('Food', '110', 2)),
  ]);
  assert.equal(result.filter((r) => r.code === 0).length, 1);
  assert.equal(item(u).revision, 3);
});
test('budget lifecycle/read does not touch ledger, savings, debt, forecasts inputs, daily or crystal accounting', () => {
  const u = fixture();
  entry(u, 'expense', 'Food', '9.99');
  entry(u, 'saving', 'Savings', '50');
  localSql(
    `INSERT INTO finance_targets(user_id,title,target_amount,current_amount) VALUES('${u}','Synthetic savings',1000,50);INSERT INTO wealth_debts(user_id,kind,counterparty,original_amount,outstanding_amount) VALUES('${u}','liability','Synthetic lender',200,150);INSERT INTO wealth_expected_flows(user_id,direction,title,amount_min) VALUES('${u}','income','Synthetic pay',1000)`,
  );
  const before = snapshot(u),
    priorForecast = forecast(u);
  const a = set(u);
  set(u, 'Food', '1000', a.revision);
  set(u, 'Food', null, 2, randomUUID(), '2026-10-01', 'Africa/Lagos', 'remove');
  view(u);
  assert.equal(snapshot(u), before);
  assert.deepEqual(forecast(u), priorForecast);
});
test('real local Auth/PostgREST denies malformed JWT, other-owner writes, raw DML and private reads', async () => {
  const keys = readLocalKeys(),
    admin = createClient(keys.NEXT_PUBLIC_SUPABASE_URL, keys.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  clock('2026-10-19T12:00:00Z');
  const password = randomUUID() + 'Aa1!';
  const { data, error } = await admin.auth.admin.createUser({
    email: `budgets-${randomUUID()}@example.invalid`,
    password,
    email_confirm: true,
  });
  assert.equal(error, null);
  const u = data.user.id;
  users.push(u);
  localSql(`INSERT INTO profiles(user_id,timezone) VALUES('${u}','Africa/Lagos')`);
  const auth = createClient(keys.NEXT_PUBLIC_SUPABASE_URL, keys.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  assert.equal(
    (await auth.auth.signInWithPassword({ email: data.user.email, password })).error,
    null,
  );
  const rpc = await auth.rpc('wealth_budget_month');
  assert.equal(rpc.error, null);
  assert.equal(rpc.data.currency, 'NGN');
  assert.ok(
    (
      await auth
        .from('wealth_monthly_budgets')
        .insert({ user_id: u, month: '2026-10-01', category: 'Food', limit_amount: 1 })
    ).error,
  );
  const bad = await fetch(keys.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/rpc/wealth_budget_month', {
    method: 'POST',
    headers: {
      apikey: keys.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      authorization: 'Bearer not-a-jwt',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(bad.status, 401);
  await admin.auth.admin.deleteUser(u);
  users.splice(users.indexOf(u), 1);
});

test('invalid actual expense data fails unavailable instead of being silently ignored or treated as zero', () => {
  const u = fixture();
  entry(u, 'expense', 'Food', '-1.00');
  fails(() => view(u));
  owner(u, 'DELETE FROM money_entries');
  const id = entry(u);
  owner(u, `UPDATE money_entries SET date=NULL WHERE id='${id}'`);
  fails(() => view(u));
  owner(u, 'DELETE FROM money_entries');
  assert.equal(item(u).spent, '0.00');
});

test('physical table CHECKs and unique owner/month/category constraint reject malformed direct fixture rows', () => {
  const u = fixture();
  const insert = (month, category, amount, currency = 'NGN') =>
    localSql(
      `INSERT INTO wealth_monthly_budgets(user_id,month,category,limit_amount,currency) VALUES('${u}',${q(month)},${q(category)},${q(amount)},${q(currency)})`,
    );
  fails(() => insert('2026-10-02', 'Food', '1'));
  fails(() => insert('2026-10-01', 'Crypto', '1'));
  fails(() => insert('2026-10-01', 'Food', '-1'));
  fails(() => insert('2026-10-01', 'Food', '1', 'USD'));
  insert('2026-10-01', 'Food', '1');
  fails(() => insert('2026-10-01', 'Food', '2'));
  assert.equal(item(u).limit, '1.00');
});
