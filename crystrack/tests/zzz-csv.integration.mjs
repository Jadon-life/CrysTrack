/** Immutable synthetic CSV facts survive until guarded local reset. Never hosted. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { localSql, readLocalKeys, assertTarget } from '../scripts/local-supabase.mjs';
import { DOCKER_SOCKET, PROJECT, localEnvironment } from '../scripts/local-supabase-policy.mjs';
const q = (s) => "'" + String(s).replaceAll("'", "''") + "'",
  scalar = (s) => localSql(s).split('\n').at(-1);
const role = (u, s) =>
  `BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${s};COMMIT;`;
const owner = (u, s) => localSql(role(u, s));
const json = (u, s) =>
  JSON.parse(
    owner(u, 'SELECT ' + s)
      .split('\n')
      .at(-1),
  );
const clock = (n) =>
  localSql(
    `CREATE OR REPLACE FUNCTION crystrack_csv.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$SELECT ${q(n)}::timestamptz$$`,
  );
after(() =>
  localSql(
    "CREATE OR REPLACE FUNCTION crystrack_csv.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$SELECT clock_timestamp()$$",
  ),
);
after(() =>
  localSql(
    "CREATE OR REPLACE FUNCTION crystrack_bills.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT clock_timestamp() $$",
  ),
);
function fixture(zone = 'Africa/Lagos') {
  clock('2026-10-19T12:00Z');
  const u = randomUUID();
  localSql(
    `INSERT INTO auth.users(id,email) VALUES('${u}','${u}@example.invalid');INSERT INTO profiles(user_id,timezone,scheduling_timezone) VALUES('${u}',${q(zone)},${q(zone)})`,
  );
  json(u, 'sep28_crystal_state()');
  return u;
}
const row = (extra = {}) => ({
  row: 1,
  date: '2026-10-01',
  description: 'Synthetic lunch',
  amount: '2500.25',
  type: 'expense',
  currency: 'NGN',
  category: 'Food',
  reference: null,
  account: null,
  keepDuplicate: false,
  ...extra,
});
const fields = (rows = [row()], extra = {}) => ({
  source: 'synthetic-current',
  fileHash: 'a'.repeat(64),
  timezone: 'Africa/Lagos',
  rows,
  ...extra,
});
const reviewExpr = (v) =>
  `wealth_csv_review(${q(v.source)},${q(v.fileHash)},${q(v.timezone)},${q(JSON.stringify(v.rows))}::jsonb)`;
const review = (u, v) => json(u, reviewExpr(v));
const importExpr = (v, id, token, confirmed = true) =>
  `wealth_csv_import('${id}',${q(v.source)},${q(v.fileHash)},${q(v.timezone)},${q(JSON.stringify(v.rows))}::jsonb,${q(token)},${confirmed})`;
const save = (u, v, id = randomUUID(), token = review(u, v).token) =>
  json(u, importExpr(v, id, token));
const fails = (f) => assert.throws(f, /psql|docker/);
const count = (t, u) => scalar(`SELECT count(*) FROM ${t} WHERE user_id='${u}'`);
function concurrent(u, s) {
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
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.resume();
    p.on('exit', (code) => resolve({ code, out }));
    p.stdin.end(role(u, 'SELECT ' + s));
  });
}
test('CSV review is zero record writes; owner RLS, anon, private grants and forged fields deny access', () => {
  const a = fixture(),
    b = fixture(),
    v = fields();
  const before = count('money_entries', a);
  review(a, v);
  assert.equal(count('money_entries', a), before);
  assert.equal(count('wealth_csv_batches', a), '0');
  assert.equal(count('activity_events', a), '0');
  const receipt = save(a, v);
  assert.equal(owner(b, 'SELECT count(*) FROM wealth_csv_batches').split('\n').at(-1), '0');
  assert.equal(json(b, `coalesce(wealth_csv_receipt('${receipt.batchId}'),'null'::jsonb)`), null);
  fails(() => localSql('BEGIN;SET LOCAL ROLE anon;SELECT wealth_csv_context();COMMIT;'));
  fails(() => owner(a, 'SELECT * FROM crystrack_csv.permits'));
  fails(() => owner(a, 'DELETE FROM wealth_csv_rows'));
  fails(() => owner(a, 'UPDATE wealth_csv_batches SET row_count=1'));
  fails(() => save(b, fields([row({ user_id: a })])));
  assert.equal(
    scalar(
      "SELECT has_function_privilege('service_role','wealth_csv_import(uuid,text,text,text,jsonb,text,boolean)','EXECUTE')",
    ),
    'f',
  );
});
test('exact atomic import writes one batch, all real entries, one generic activity and zero shards', () => {
  const u = fixture(),
    v = fields([
      row(),
      row({ row: 2, type: 'income', amount: '5000.01', description: 'Synthetic credit' }),
      row({ row: 3, date: '2026-09-30', amount: '0.01', description: 'Synthetic previous month' }),
    ]);
  const r = save(u, v);
  assert.equal(r.count, 3);
  assert.equal(r.expense, '2500.26');
  assert.equal(r.income, '5000.01');
  assert.equal(count('money_entries', u), '3');
  assert.equal(count('activity_events', u), '1');
  assert.equal(count('sep28_crystal_events', u), '0');
  assert.equal(scalar(`SELECT count(*) FROM crystrack_csv.permits WHERE user_id='${u}'`), '0');
  const budget = json(u, 'wealth_budget_month()').items.find((c) => c.category === 'Food');
  assert.equal(budget.spent, '2500.25');
  const september = json(u, "wealth_budget_month('2026-09-01')").items.find(
    (c) => c.category === 'Food',
  );
  assert.equal(september.spent, '0.01');
  const event = JSON.parse(
    scalar(`SELECT metadata_json FROM activity_events WHERE user_id='${u}'`),
  );
  assert.equal(event.count, 3);
  assert.ok(!JSON.stringify(event).includes('Synthetic lunch'));
});
test('lost response and competing exact batches replay once; different batches cannot duplicate file rows or references', async () => {
  const u = fixture(),
    v = fields([row({ reference: 'BANK-001' })]),
    token = review(u, v).token,
    id = randomUUID(),
    expr = importExpr(v, id, token);
  const result = await Promise.all([concurrent(u, expr), concurrent(u, expr)]);
  assert.ok(result.every((r) => r.code === 0));
  assert.equal(count('money_entries', u), '1');
  assert.deepEqual(save(u, v, id, token), json(u, `wealth_csv_receipt('${id}')`));
  fails(() =>
    save(
      u,
      fields([row({ reference: 'BANK-001', description: 'Changed description' })], {
        fileHash: 'b'.repeat(64),
      }),
    ),
  );
  fails(() => save(u, v));
  fails(() => save(u, fields([row({ amount: '1.01' })]), id, token));
  const b = fields([row({ row: 2, reference: 'other-ref', description: 'Second' })]);
  const t = review(u, b).token;
  const race = await Promise.all([
    concurrent(u, importExpr(b, randomUUID(), t)),
    concurrent(u, importExpr(b, randomUUID(), t)),
  ]);
  assert.equal(race.filter((r) => r.code === 0).length, 1);
  assert.equal(count('money_entries', u), '2');
});
test('fuzzy matches warn, legit identical rows survive explicit acknowledgement, reference scope/case and selected exclusions hold', () => {
  const u = fixture(),
    v = fields([row(), row({ row: 2 })]);
  let p = review(u, v);
  assert.equal(p.rows[0].possible, 1);
  assert.equal(p.rows[0].duplicate, false);
  fails(() => save(u, v));
  v.rows = v.rows.map((r) => ({ ...r, keepDuplicate: true }));
  save(u, v);
  assert.equal(count('money_entries', u), '2');
  const partial = fields([row({ row: 3, description: 'Third', reference: 'Case-Ref' })]);
  save(u, partial);
  assert.equal(
    review(u, fields([row({ reference: 'case-ref' })], { fileHash: 'c'.repeat(64) })).rows[0]
      .duplicate,
    true,
  );
  const other = fields([row({ reference: 'Case-Ref', description: 'Different account' })], {
    source: 'synthetic-other',
    fileHash: 'd'.repeat(64),
  });
  save(u, other);
  assert.equal(count('money_entries', u), '4');
});
test('any invalid selected row or reconciliation failure rolls back batch, rows, permits, expense and receipt', () => {
  const u = fixture();
  fails(() => save(u, fields([row(), row({ row: 2, amount: '1.001' })])));
  assert.equal(count('money_entries', u), '0');
  localSql(
    `CREATE FUNCTION crystrack_csv.synthetic_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.user_id='${u}' THEN RAISE EXCEPTION 'Synthetic CSV failure';END IF;RETURN NEW;END$$;CREATE TRIGGER synthetic_csv_fail BEFORE INSERT ON activity_events FOR EACH ROW EXECUTE FUNCTION crystrack_csv.synthetic_fail()`,
  );
  try {
    fails(() => save(u, fields()));
    assert.equal(count('money_entries', u), '0');
    assert.equal(count('wealth_csv_rows', u), '0');
    assert.equal(count('wealth_csv_batches', u), '0');
    assert.equal(count('sep28_crystal_events', u), '0');
    assert.equal(scalar(`SELECT count(*) FROM crystrack_csv.permits WHERE user_id='${u}'`), '0');
  } finally {
    localSql(
      'DROP TRIGGER synthetic_csv_fail ON activity_events;DROP FUNCTION crystrack_csv.synthetic_fail()',
    );
  }
  save(u, fields());
  assert.equal(count('money_entries', u), '1');
});
test('immutable import provenance prevents clearing, deletion, mutation, source reversal and forged manual awards', () => {
  const u = fixture();
  save(u, fields());
  const e = JSON.parse(scalar(`SELECT row_to_json(t) FROM money_entries t WHERE user_id='${u}'`));
  for (const sql of [
    `UPDATE money_entries SET import_batch_id=NULL,import_row_id=NULL WHERE id='${e.id}'`,
    `UPDATE money_entries SET amount=1 WHERE id='${e.id}'`,
    `UPDATE money_entries SET type='income',flow_kind='income' WHERE id='${e.id}'`,
    `DELETE FROM money_entries WHERE id='${e.id}'`,
    `INSERT INTO money_entries(user_id,type,flow_kind,amount,import_batch_id,import_row_id) VALUES('${u}','expense','expense',1,'${e.import_batch_id}','${e.import_row_id}')`,
  ])
    fails(() => owner(u, sql));
  assert.equal(count('sep28_crystal_events', u), '0');
  owner(
    u,
    `INSERT INTO money_entries(user_id,type,flow_kind,amount) VALUES('${u}','expense','expense',1.01)`,
  );
  assert.equal(json(u, 'sep28_crystal_state()').total, '5');
});
test('stale proof after manual finance insert, changed timezone/day and duplicate references cannot commit', () => {
  const u = fixture(),
    v = fields(),
    p = review(u, v);
  owner(
    u,
    `INSERT INTO money_entries(user_id,type,flow_kind,amount,date,source,category) VALUES('${u}','expense','expense',2500.25,'2026-10-01T00:00:00+01','Synthetic lunch','Food')`,
  );
  fails(() => save(u, v, randomUUID(), p.token));
  assert.equal(count('wealth_csv_batches', u), '0');
  localSql(`UPDATE profiles SET scheduling_timezone='America/New_York' WHERE user_id='${u}'`);
  fails(() => review(u, v));
  const midnight = fixture(),
    unchanged = fields(),
    oldToken = review(midnight, unchanged).token;
  clock('2026-10-20T12:00Z');
  fails(() => save(midnight, unchanged, randomUUID(), oldToken));
  assert.equal(count('money_entries', midnight), '0');
  const a = fixture(),
    b = fields([row({ reference: 'same' }), row({ row: 2, reference: 'SAME' })]);
  assert.ok(review(a, b).rows.every((r) => r.duplicate));
  fails(() => save(a, b));
});
test('saved-zone dates, explicit offset micros, leap/DST, nonexistent days and future/FX/precision invalidity', () => {
  const u = fixture('America/New_York'),
    v = fields([row({ date: '2026-03-08' })], { timezone: 'America/New_York' });
  save(u, v);
  assert.equal(
    scalar(`SELECT date FROM money_entries WHERE user_id='${u}'`),
    '2026-03-08 05:00:00+00',
  );
  const t = fields(
    [row({ row: 2, date: '2026-10-01T00:00:00.123456+01:00', description: 'Microseconds' })],
    { timezone: 'America/New_York' },
  );
  save(u, t);
  assert.equal(
    scalar(`SELECT date FROM money_entries WHERE user_id='${u}' AND source='Microseconds'`),
    '2026-09-30 23:00:00.123456+00',
  );
  for (const extra of [
    { date: '2026-10-20' },
    { date: '2026-02-29' },
    { date: '2026-10-19T13:00:00Z' },
    { date: '01/02/2026' },
    { currency: 'USD' },
    { amount: '-0.00' },
    { amount: 'NaN' },
    { amount: '1e3' },
    { amount: '10000000000' },
    { amount: 1 },
    { type: 'saving' },
    { shards: 5 },
  ])
    fails(() => review(u, fields([row(extra)], { timezone: 'America/New_York' })));
  assert.equal(
    scalar("SELECT crystrack_csv.instant('2028-02-29','Africa/Lagos','2029-01-01')"),
    '2028-02-28 23:00:00+00',
  );
  fails(() => localSql("SELECT crystrack_csv.instant('2011-12-30','Pacific/Apia','2026-10-19')"));
});
test('CSV import never mutates savings, debt, expected flow, paid bills or existing sources; bill matching is warning only', () => {
  const u = fixture(),
    bill = randomUUID();
  localSql(
    "CREATE OR REPLACE FUNCTION crystrack_bills.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$SELECT crystrack_csv.clock()$$",
  );
  json(
    u,
    `wealth_bill_mutate('create','${bill}',0,'${randomUUID()}','Africa/Lagos','{"title":"Synthetic bill","category":"Food","merchant":null,"amount":"2500.25","frequency":"monthly","firstDue":"2026-10-01","endDate":null,"reminderEnabled":false}')`,
  );
  const o = json(u, `wealth_bill_list('${bill}')`).occurrences[0];
  json(
    u,
    `wealth_bill_mutate('pay','${bill}',1,'${randomUUID()}','Africa/Lagos',${q(JSON.stringify({ occurrenceId: o.id, occurrenceRevision: o.revision, actualAmount: '2500.25' }))}::jsonb)`,
  );
  owner(
    u,
    `INSERT INTO finance_targets(user_id,title,target_amount,current_amount) VALUES('${u}','Synthetic target',1000,10);INSERT INTO wealth_expected_flows(user_id,direction,title,amount_min) VALUES('${u}','income','Synthetic expected',100);INSERT INTO wealth_debts(user_id,kind,counterparty,original_amount,outstanding_amount) VALUES('${u}','liability','Synthetic',100,80)`,
  );
  const snapshot = () =>
    scalar(
      `SELECT jsonb_build_object('bills',(SELECT jsonb_agg(to_jsonb(t)) FROM wealth_recurring_bills t WHERE user_id='${u}'),'due',(SELECT jsonb_agg(to_jsonb(t)) FROM wealth_bill_occurrences t WHERE user_id='${u}'),'targets',(SELECT jsonb_agg(to_jsonb(t)) FROM finance_targets t WHERE user_id='${u}'),'expected',(SELECT jsonb_agg(to_jsonb(t)) FROM wealth_expected_flows t WHERE user_id='${u}'),'debt',(SELECT jsonb_agg(to_jsonb(t)) FROM wealth_debts t WHERE user_id='${u}'),'old',(SELECT jsonb_agg(to_jsonb(t)) FROM money_entries t WHERE user_id='${u}' AND import_batch_id IS NULL))::text`,
    );
  const before = snapshot();
  save(u, fields());
  assert.equal(snapshot(), before);
  assert.equal(count('sep28_crystal_events', u), '0');
  const payment = JSON.parse(
    scalar(
      `SELECT row_to_json(t) FROM money_entries t WHERE user_id='${u}' AND bill_id IS NOT NULL`,
    ),
  );
  const p = review(
    u,
    fields([row({ date: payment.date.replace(' ', 'T'), description: 'Synthetic bill' })], {
      fileHash: 'e'.repeat(64),
    }),
  );
  assert.equal(p.rows[0].billMatch, true);
});
test('complete owner export exceeds 2,000 rows, preserves exact strings/all flow kinds and fails hard limits', () => {
  const u = fixture(),
    b = fixture();
  localSql(
    `INSERT INTO money_entries(user_id,type,flow_kind,amount,date,source) SELECT '${u}','income','income',0.01,'2026-10-01T12:00Z','Synthetic export' FROM generate_series(1,2001)`,
  );
  const rows = json(u, "wealth_csv_export('2026-10-01','2026-10-31',false)");
  assert.equal(rows.length, 2001);
  assert.ok(rows.every((r) => r.amount === '0.01' && !('note' in r)));
  assert.equal(new Set(rows.map((r) => r.id)).size, 2001);
  assert.deepEqual(json(b, "wealth_csv_export('2026-10-01','2026-10-31',true)"), []);
  owner(
    u,
    `INSERT INTO money_entries(user_id,type,flow_kind,amount,date,note) VALUES('${u}','saving','saving',10,'2026-10-02','=Synthetic formula'),('${u}','transfer','savings_release',1,'2026-10-02','Synthetic release')`,
  );
  const all = json(u, "wealth_csv_export('2026-10-01','2026-10-31',true)");
  assert.equal(all.length, 2003);
  assert.ok(all.some((r) => r.type === 'savings_release'));
  assert.ok(all.some((r) => r.note === '=Synthetic formula'));
  fails(() => json(u, "wealth_csv_export('2025-01-01','2026-10-31',false)"));
  localSql(
    `INSERT INTO money_entries(user_id,type,flow_kind,amount,date) SELECT '${u}','income','income',0.01,'2026-10-01' FROM generate_series(1,7998)`,
  );
  fails(() => json(u, "wealth_csv_export('2026-10-01','2026-10-31',false)"));
});
test('real local Auth/PostgREST import boundary preserves exact response and owner receipt isolation', async () => {
  const keys = readLocalKeys(),
    admin = createClient(keys.NEXT_PUBLIC_SUPABASE_URL, keys.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    password = randomUUID() + 'Aa1!';
  clock('2026-10-19T12:00Z');
  const { data, error } = await admin.auth.admin.createUser({
    email: 'csv-' + randomUUID() + '@example.invalid',
    password,
    email_confirm: true,
  });
  assert.equal(error, null);
  const u = data.user.id;
  localSql(`INSERT INTO profiles(user_id,timezone) VALUES('${u}','Africa/Lagos')`);
  const c = createClient(keys.NEXT_PUBLIC_SUPABASE_URL, keys.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  assert.equal((await c.auth.signInWithPassword({ email: data.user.email, password })).error, null);
  const v = fields(),
    p = await c.rpc('wealth_csv_review', {
      p_source: v.source,
      p_file: v.fileHash,
      p_timezone: v.timezone,
      p_rows: v.rows,
    });
  assert.equal(p.error, null);
  const id = randomUUID(),
    r = await c.rpc('wealth_csv_import', {
      p_id: id,
      p_source: v.source,
      p_file: v.fileHash,
      p_timezone: v.timezone,
      p_rows: v.rows,
      p_token: p.data.token,
      p_confirmed: true,
    });
  assert.equal(r.error, null);
  assert.equal(r.data.expense, '2500.25');
  const invalid = await fetch(keys.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/rpc/wealth_csv_context', {
    method: 'POST',
    headers: {
      apikey: keys.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      authorization: 'Bearer invalid',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(invalid.status, 401);
});

test('500 selected rows commit atomically; 501 rows, overlarge notes and unknown dates fail explicitly', () => {
  const u = fixture();
  const rows = Array.from({ length: 500 }, (_, i) =>
    row({ row: i + 1, description: 'Synthetic bounded ' + i, amount: '0.01' }),
  );
  const r = save(u, fields(rows));
  assert.equal(r.count, 500);
  assert.equal(r.expense, '5.00');
  assert.equal(count('money_entries', u), '500');
  assert.equal(count('sep28_crystal_events', u), '0');
  fails(() => review(u, fields([...rows, row({ row: 501 })])));
  const b = fixture();
  owner(
    b,
    `INSERT INTO money_entries(user_id,type,flow_kind,amount,date,note) VALUES('${b}','income','income',1,'2026-10-01',repeat('x',5000))`,
  );
  fails(() => json(b, "wealth_csv_export('2026-10-01','2026-10-31',true)"));
  assert.equal(json(b, "wealth_csv_export('2026-10-01','2026-10-31',false)").length, 1);
  owner(
    b,
    `INSERT INTO money_entries(user_id,type,flow_kind,amount,date) VALUES('${b}','income','income',1,NULL)`,
  );
  fails(() => json(b, "wealth_csv_export('2026-10-01','2026-10-31',false)"));
});
