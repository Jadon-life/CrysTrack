import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';
const native = createRequire(import.meta.url),
  cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(
    (name) =>
      name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : native(name),
    mod,
    mod.exports,
  );
  return mod.exports;
}

import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { localSql, readLocalKeys, assertTarget } from '../scripts/local-supabase.mjs';
import { DOCKER_SOCKET, PROJECT, localEnvironment } from '../scripts/local-supabase-policy.mjs';
const { buildWealthReport: build } = load('src/lib/wealth-report.ts');
const q = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const scalar = (s) => localSql(s).split('\n').at(-1);
const owner = (u, s) =>
  localSql(
    `BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${s};COMMIT;`,
  );
const json = (u, s) =>
  JSON.parse(
    owner(u, 'SELECT ' + s)
      .split('\n')
      .at(-1),
  );
const clock = (n) => {
  for (const schema of ['crystrack_overview','crystrack_bills'])
    localSql(`CREATE OR REPLACE FUNCTION ${schema}.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$SELECT ${q(n)}::timestamptz$$`);
};
after(() => {
  for (const schema of ['crystrack_overview','crystrack_bills'])
    localSql(`CREATE OR REPLACE FUNCTION ${schema}.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$SELECT clock_timestamp()$$`);
});
const fixture = (zone = 'Africa/Lagos') => {
  clock('2026-10-20T12:00Z');
  const u = randomUUID();
  localSql(
    `INSERT INTO auth.users(id,email) VALUES('${u}','${u}@example.invalid');INSERT INTO profiles(user_id,timezone,scheduling_timezone) VALUES('${u}',${q(zone)},${q(zone)})`,
  );
  return u;
};
const read = (u) => build(json(u, 'wealth_overview_read()'), u);
const add = (u, amount = '1.00', date = '2026-10-02T12:00Z', kind = 'income', extra = '') =>
  owner(
    u,
    `INSERT INTO money_entries(user_id,type,flow_kind,amount,date,category) VALUES('${u}','${kind === 'savings_release' ? 'transfer' : ['borrow', 'receivable_repayment'].includes(kind) ? 'income' : ['lend', 'liability_repayment'].includes(kind) ? 'expense' : kind}','${kind}',${amount},${q(date)},'Food')${extra}`,
  );
const fail = (f) => assert.throws(f, /psql|docker/);
const snapshot = (u) =>
  scalar(
    `SELECT jsonb_build_object('entries',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM money_entries t WHERE user_id='${u}'),'debts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM wealth_debts t WHERE user_id='${u}'),'expected',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM wealth_expected_flows t WHERE user_id='${u}'),'targets',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM finance_targets t WHERE user_id='${u}'),'awards',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM sep28_crystal_awards t WHERE user_id='${u}'))::text`,
  );
test('overview is owner-scoped stable read-only authority with denied anon/service/private grants', () => {
  const a = fixture(),
    b = fixture();
  add(a, '10.00');
  add(b, '99.00');
  assert.equal(read(a).summary.availableBalance, '10.00');
  assert.equal(read(b).summary.availableBalance, '99.00');
  fail(() => localSql('SET ROLE anon;SELECT wealth_overview_read()'));
  fail(() => localSql('SET ROLE service_role;SELECT wealth_overview_read()'));
  fail(() => localSql('SET ROLE authenticated;SELECT wealth_overview_read()'));
  assert.equal(
    scalar("SELECT provolatile FROM pg_proc WHERE oid='wealth_overview_read()'::regprocedure"),
    's',
  );
  assert.equal(
    scalar("SELECT has_schema_privilege('authenticated','crystrack_overview','USAGE')"),
    'f',
  );
  const before = snapshot(a);
  read(a);
  read(a);
  assert.equal(snapshot(a), before);
});
test('all 2006 older original cents survive recent-list limit and exact large aggregation', () => {
  const u = fixture();
  owner(
    u,
    `INSERT INTO money_entries(user_id,type,flow_kind,amount,date) SELECT '${u}','income','income',0.01,'2026-09-01' FROM generate_series(1,2006)`,
  );
  add(u, '0.01', '2026-10-02', 'expense');
  const r = read(u);
  assert.equal(r.summary.availableBalance, '20.05');
  assert.equal(r.summary.monthExpenses, '0.01');
  assert.equal(r.entries.length, 14);
  assert.equal(r.reporting.ledgerCount, 2007);
  assert.equal(r.cashflow.find((m) => m.key === '2026-09').income, '20.06');
  owner(
    u,
    `INSERT INTO money_entries(user_id,type,flow_kind,amount,date) SELECT '${u}','income','income',9999999999.99,'2026-09-01' FROM generate_series(1,1000)`,
  );
  assert.equal(read(u).summary.availableBalance, '10000000000010.05');
});
test('saved month/day boundaries match exact budgets for Lagos midnight and New York DST', () => {
  const u = fixture();
  add(u, '2.75', '2026-09-30T23:05Z', 'expense');
  let r = read(u);
  assert.equal(r.summary.monthExpenses, '2.75');
  assert.equal(
    json(u, "wealth_budget_month('2026-10-01')").items.find((b) => b.category === 'Food').spent,
    '2.75',
  );
  localSql(`UPDATE profiles SET scheduling_timezone='America/New_York' WHERE user_id='${u}'`);
  r = read(u);
  assert.equal(r.summary.monthExpenses, '0.00');
  assert.equal(r.summary.priorMonthExpenses, '2.75');
  assert.equal(
    json(u, "wealth_budget_month('2026-10-01')").items.find((b) => b.category === 'Food').spent,
    '0.00',
  );
  add(u, '0.25', '2026-03-08T06:59:00Z', 'expense');
  add(u, '0.50', '2026-03-08T07:01:00Z', 'expense');
  clock('2026-03-31T03:30Z');
  // Later valid October facts make a March historical-as-current read unavailable, not fabricated.
  fail(() => json(u, 'wealth_overview_read()'));
});
test('DST/leap/day rollover uses saved calendar and six complete report months', () => {
  const u = fixture('America/New_York');
  add(u, '0.75', '2024-02-29T04:30Z', 'expense');
  add(u, '0.25', '2024-03-01T04:30Z', 'expense');
  clock('2024-03-01T04:45Z');
  let r = read(u);
  assert.equal(r.reporting.today, '2024-02-29');
  assert.equal(r.summary.monthExpenses, '1.00');
  assert.equal(r.summary.projectedMonthExpenses, '1.00');
  clock('2024-03-01T05:01Z');
  r = read(u);
  assert.equal(r.reporting.month, '2024-03');
  assert.equal(r.summary.priorMonthExpenses, '1.00');
  const v = fixture('America/New_York');
  add(v, '0.10', '2026-03-08T06:59Z', 'expense');
  add(v, '0.20', '2026-03-08T07:01Z', 'expense');
  clock('2026-03-09T03:59Z');
  assert.equal(read(v).reporting.today, '2026-03-08');
  assert.equal(read(v).summary.monthExpenses, '0.30');
});
test('history mutation/deletion refreshes totals, never returns cached money', () => {
  const u = fixture();
  add(u, '5.00', '2026-09-01');
  add(u, '1.00', '2026-10-01', 'expense');
  assert.equal(read(u).summary.availableBalance, '4.00');
  owner(u, `UPDATE money_entries SET amount=7.01 WHERE user_id='${u}' AND flow_kind='income'`);
  assert.equal(read(u).summary.availableBalance, '6.01');
  owner(u, `DELETE FROM money_entries WHERE user_id='${u}' AND flow_kind='income'`);
  assert.equal(read(u).summary.availableBalance, '-1.00');
});
test('neutral transfer, savings release, debts and confirmed expected receipts retain original movements', () => {
  const u = fixture();
  for (const [k, n] of [
    ['income', '100.00'],
    ['saving', '10.25'],
    ['savings_release', '0.25'],
    ['transfer', '200.00'],
  ])
    add(u, n, '2026-10-02', k);
  owner(
    u,
    `INSERT INTO wealth_debts(user_id,kind,counterparty,original_amount,outstanding_amount,due_date) VALUES('${u}','liability','Synthetic lender',20,7.25,'2026-10-31T22:59Z'),('${u}','receivable','Synthetic friend',8,3,NULL)`,
  );
  owner(
    u,
    `INSERT INTO wealth_expected_flows(user_id,direction,title,amount_min,amount_max,frequency,last_confirmed_at) VALUES('${u}','income','Synthetic confirmed',50,60,'monthly','2026-09-30T23:30Z'),('${u}','expense','Synthetic expected',1.25,2.25,'monthly',NULL)`,
  );
  const before = snapshot(u),
    r = read(u).summary;
  assert.equal(r.availableBalance, '90.00');
  assert.equal(r.savedBalance, '10.00');
  assert.equal(r.netPosition, '95.75');
  assert.equal(r.expectedIncomeMax, '0.00');
  assert.equal(r.safeToSpend, '80.50');
  assert.equal(snapshot(u), before);
});
test('pending plans excluded, paid bill counted exactly once with protected provenance', () => {
  const u = fixture(),
    id = randomUUID(),
    bill = {
      title: 'Synthetic bill',
      category: 'Utilities',
      merchant: null,
      amount: '5.00',
      frequency: 'monthly',
      firstDue: '2026-10-19',
      endDate: null,
      reminderEnabled: false,
    };
  json(
    u,
    `wealth_bill_mutate('create','${id}',0,'${randomUUID()}','Africa/Lagos',${q(JSON.stringify(bill))}::jsonb)`,
  );
  assert.equal(read(u).summary.expectedExpenseMax, '0.00');
  const v = json(u, `wealth_bill_list('${id}',0,NULL)`),
    o =
      v.occurrences.find((o) => o.state === 'due_soon' || o.state === 'overdue') ??
      v.occurrences[0];
  const b = v.items.find((b) => b.id === id);
  json(
    u,
    `wealth_bill_mutate('pay','${id}',${b.revision},'${randomUUID()}','Africa/Lagos',${q(JSON.stringify({ occurrenceId: o.id, occurrenceRevision: o.revision, actualAmount: '4.75' }))}::jsonb)`,
  );
  const before = snapshot(u);
  assert.equal(read(u).summary.availableBalance, '-4.75');
  assert.equal(read(u).summary.monthExpenses, '4.75');
  assert.equal(read(u).summary.expectedExpenseMax, '0.00');
  assert.equal(snapshot(u), before);
});
test('2005 imported cents aggregate completely without new shards or altered CSV identities', () => {
  const u = fixture();
  const state = () => json(u, 'sep28_crystal_state()').total;
  const shards = state();
  for (let batch = 0; batch < 5; batch++) {
    const rows = Array.from({ length: 401 }, (_, i) => ({
      row: i + 1,
      date: '2026-10-01',
      description: 'Synthetic archived cents',
      amount: '0.01',
      type: 'income',
      currency: 'NGN',
      category: 'Other',
      reference: `SYN-${batch}-${i}`,
      account: null,
      keepDuplicate: true,
    }));
    const source = 'synthetic-overview',
      hash = String(batch + 1).repeat(64),
      r = json(
        u,
        `wealth_csv_review('${source}','${hash}','Africa/Lagos',${q(JSON.stringify(rows))}::jsonb)`,
      );
    json(
      u,
      `wealth_csv_import('${randomUUID()}','${source}','${hash}','Africa/Lagos',${q(JSON.stringify(rows))}::jsonb,'${r.token}',true)`,
    );
  }
  const before = snapshot(u),
    r = read(u);
  assert.equal(r.reporting.ledgerCount, 2005);
  assert.equal(r.summary.availableBalance, '20.05');
  assert.equal(state(), shards);
  assert.equal(snapshot(u), before);
  assert.equal(json(u, "wealth_csv_export('2026-10-01','2026-10-31',false)").length, 2005);
});
test('invalid date/amount/zone becomes unavailable rather than zero or stale', () => {
  const u = fixture();
  add(u);
  fail(() => owner(u, `UPDATE profiles SET scheduling_timezone='not/a-zone' WHERE user_id='${u}'`));
  assert.equal(read(u).summary.availableBalance, '1.00');
  owner(
    u,
    `INSERT INTO money_entries(user_id,type,flow_kind,amount,date) VALUES('${u}','income','income',1,NULL)`,
  );
  fail(() => json(u, 'wealth_overview_read()'));
  const v = fixture();
  owner(
    v,
    `INSERT INTO money_entries(user_id,type,flow_kind,amount,date) VALUES('${v}','income','income',0,'2026-10-01')`,
  );
  fail(() => json(v, 'wealth_overview_read()'));
});
test('foreign debt origin is either rejected by existing guards or refused by read authority', () => {
  const a = fixture(),
    b = fixture(),
    debt = randomUUID();
  owner(
    b,
    `INSERT INTO wealth_debts(id,user_id,kind,counterparty,original_amount,outstanding_amount) VALUES('${debt}','${b}','liability','Synthetic foreign',1,1)`,
  );
  try {
    owner(
      a,
      `INSERT INTO money_entries(user_id,type,flow_kind,amount,date,debt_id) VALUES('${a}','income','borrow',1,'2026-10-01','${debt}')`,
    );
  } catch {
    return;
  }
  fail(() => json(a, 'wealth_overview_read()'));
});
test('concurrent atomic source/debt transaction never creates mixed report snapshots', async () => {
  const u = fixture();
  add(u, '100.00');
  const debt = randomUUID();
  owner(
    u,
    `INSERT INTO wealth_debts(id,user_id,kind,counterparty,original_amount,outstanding_amount) VALUES('${debt}','${u}','liability','Synthetic atomic',10,10)`,
  );
  assertTarget();
  const sql = `BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${u}","role":"authenticated"}';INSERT INTO money_entries(user_id,type,flow_kind,amount,date) VALUES('${u}','income','income',10,'2026-10-01');SELECT pg_sleep(0.2);UPDATE wealth_debts SET outstanding_amount=0,status='settled' WHERE id='${debt}';COMMIT;`;
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
    { env: localEnvironment(process.env), stdio: ['pipe', 'ignore', 'ignore'] },
  );
  child.stdin.end(sql);
  const done = new Promise((r, j) => {
    child.on('exit', (code) => (code === 0 ? r() : j(Error('Synthetic atomic writer failed'))));
    child.on('error', j);
  });
  for (let i = 0; i < 4; i++) {
    const s = read(u).summary;
    assert.ok(
      (s.availableBalance === '100.00' && s.liabilities === '10.00') ||
        (s.availableBalance === '110.00' && s.liabilities === '0.00'),
    );
  }
  await done;
  assert.equal(read(u).summary.netPosition, '110.00');
});
test('real local Auth/PostgREST rejects forged JWT/owner arguments and exposes only owned snapshot', async () => {
  const keys = readLocalKeys(),
    admin = createClient(keys.NEXT_PUBLIC_SUPABASE_URL, keys.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    email = `overview-${randomUUID()}@example.invalid`,
    password = randomUUID() + 'Aa1!';
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.equal(error, null);
  const u = data.user.id;
  localSql(`INSERT INTO profiles(user_id,timezone) VALUES('${u}','Africa/Lagos')`);
  add(u, '3.25');
  const c = createClient(keys.NEXT_PUBLIC_SUPABASE_URL, keys.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  assert.equal((await c.auth.signInWithPassword({ email, password })).error, null);
  const r = await c.rpc('wealth_overview_read');
  assert.equal(r.error, null);
  assert.equal(build(r.data, u).summary.availableBalance, '3.25');
  assert.ok((await c.rpc('wealth_overview_read', { user_id: randomUUID() })).error);
  const bad = await fetch(keys.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/rpc/wealth_overview_read', {
    method: 'POST',
    headers: {
      apikey: keys.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      authorization: 'Bearer synthetic.forged.signature',
      'content-type': 'application/json',
    },
    body: '{}',
  });
  assert.notEqual(bad.status, 200);
});

test('nonfinite numeric and future actuals cannot become a zero or silently reclassified balance', () => {
  const u = fixture();
  owner(
    u,
    `INSERT INTO money_entries(user_id,type,flow_kind,amount,date) VALUES('${u}','income','income','NaN','2026-10-01')`,
  );
  fail(() => json(u, 'wealth_overview_read()'));
  const v = fixture();
  add(v, '1.00', '2026-10-20T12:00Z');
  clock('2026-10-19T12:00Z');
  fail(() => json(v, 'wealth_overview_read()'));
});
test('exceeded side-collection coverage explicitly fails the whole read instead of truncating', () => {
  const u = fixture();
  owner(
    u,
    `INSERT INTO finance_targets(user_id,title,target_amount,current_amount) SELECT '${u}','Synthetic bounded target',1,0 FROM generate_series(1,10001)`,
  );
  fail(() => json(u, 'wealth_overview_read()'));
});
