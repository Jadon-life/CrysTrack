/** LAST integration file: immutable synthetic payment rows deliberately survive until local reset. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { localSql, readLocalKeys, assertTarget } from '../scripts/local-supabase.mjs';
import { DOCKER_SOCKET, PROJECT, localEnvironment } from '../scripts/local-supabase-policy.mjs';
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
const clock = (n) =>
  localSql(
    `CREATE OR REPLACE FUNCTION crystrack_bills.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT ${q(n)}::timestamptz $$`,
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
    `INSERT INTO auth.users(id,email) VALUES('${u}','${u}@example.invalid');INSERT INTO profiles(user_id,timezone,scheduling_timezone) VALUES('${u}',${q(zone)},${q(zone)});`,
  );
  json(u, 'sep28_crystal_state()');
  return u;
}
const fields = (extra = {}) => ({
  title: 'Synthetic internet',
  category: 'Utilities',
  merchant: null,
  amount: '100.01',
  frequency: 'monthly',
  firstDue: '2026-10-19',
  endDate: null,
  reminderEnabled: false,
  ...extra,
});
const expression = (
  id,
  action = 'create',
  revision = 0,
  data = fields(),
  request = randomUUID(),
  zone = 'Africa/Lagos',
) =>
  `wealth_bill_mutate(${q(action)},'${id}',${revision},'${request}',${q(zone)},${q(JSON.stringify(data))}::jsonb)`;
const mutate = (u, id, ...args) => json(u, expression(id, ...args));
const list = (u, id = null, page = 0, revision = null) =>
  json(u, `wealth_bill_list(${id ? q(id) : 'NULL'},${page},${revision ? q(revision) : 'NULL'})`);
function create(u, data = fields(), zone = 'Africa/Lagos') {
  const id = randomUUID();
  mutate(u, id, 'create', 0, data, randomUUID(), zone);
  return id;
}
const payFields = (o) => ({
  occurrenceId: o.id,
  occurrenceRevision: o.revision,
  actualAmount: '120.02',
});
const fails = (f) => assert.throws(f, /psql|docker/);
const count = (table, u) => scalar(`SELECT count(*) FROM ${table} WHERE user_id='${u}'`);
test('bill/occurrence ownership, strict RLS and private source grants deny A/B, anon and direct DML', () => {
  const a = fixture(),
    b = fixture(),
    id = create(a);
  assert.equal(list(a).items.length, 1);
  assert.equal(list(b).items.length, 0);
  fails(() => list(b, id));
  fails(() => mutate(b, id, 'pause', 1, {}));
  fails(() => owner(a, `UPDATE wealth_recurring_bills SET amount=1 WHERE id='${id}'`));
  fails(() => owner(a, 'DELETE FROM wealth_bill_occurrences'));
  fails(() => owner(a, 'SELECT * FROM crystrack_bills.entry_permits'));
  fails(() => localSql('BEGIN;SET LOCAL ROLE anon;SELECT wealth_bill_list();COMMIT;'));
  fails(() => owner(a, `SELECT bill_claim_reminder('${list(a, id).occurrences[0].id}',1)`));
  assert.equal(
    scalar(
      "SELECT has_function_privilege('authenticated','bill_finish_delivery(uuid,text[],text[],text)','EXECUTE')",
    ),
    'f',
  );
});
test('calendar authority covers month-end, quarterly, leap, DST and saved-zone dates without auto expenses', () => {
  const u = fixture(),
    id = create(u, fields({ firstDue: '2026-01-31' }));
  let rows = list(u, id).occurrences;
  assert.equal(rows[1].dueDay, '2026-02-28');
  assert.equal(rows[2].dueDay, '2026-03-31');
  assert.equal(count('money_entries', u), '0');
  assert.equal(scalar("SELECT crystrack_bills.due('2028-02-29','yearly',4)"), '2032-02-29');
  assert.equal(scalar("SELECT crystrack_bills.due('2026-01-31','quarterly',1)"), '2026-04-30');
  const ny = fixture('America/New_York');
  clock('2026-03-08T04:30Z');
  const b = create(ny, fields({ firstDue: '2026-03-07', frequency: 'weekly' }), 'America/New_York');
  assert.equal(list(ny, b).today, '2026-03-07');
  clock('2026-03-08T05:00Z');
  assert.equal(list(ny, b).today, '2026-03-08');
  assert.equal(
    scalar("SELECT ('2026-03-08'::date+time '09:00') AT TIME ZONE 'America/New_York'"),
    '2026-03-08 13:00:00+00',
  );
});
test('one explicit atomic payment creates exact source, budget spend and no extra shard or forecast mirror', () => {
  const u = fixture(),
    id = create(u),
    v = list(u, id),
    o = v.occurrences[0],
    beforeAwards = count('sep28_crystal_events', u);
  const beforeExpected = count('wealth_expected_flows', u);
  mutate(u, id, 'pay', 1, payFields(o));
  const p = list(u, id).occurrences[0];
  assert.equal(p.status, 'paid');
  assert.equal(p.actual, '120.02');
  assert.ok(p.entryId);
  assert.equal(count('money_entries', u), '1');
  assert.equal(count('activity_events', u), '1');
  assert.equal(count('sep28_crystal_events', u), beforeAwards);
  assert.equal(count('wealth_expected_flows', u), beforeExpected);
  const budget = json(u, 'wealth_budget_month()').items.find((c) => c.category === 'Utilities');
  assert.equal(budget.spent, '120.02');
  assert.equal(list(u).plans.seven, '0.00');
  assert.equal(
    scalar(
      `SELECT amount::text||':'||bill_id::text||':'||bill_occurrence_id::text FROM money_entries WHERE id='${p.entryId}'`,
    ),
    '120.02:' + id + ':' + o.id,
  );
});
test('same request replay and different-request concurrent payment cannot duplicate expenses or receipts', async () => {
  const u = fixture(),
    id = create(u),
    o = list(u, id).occurrences[0],
    req = randomUUID(),
    sql = expression(id, 'pay', 1, payFields(o), req);
  const result = await Promise.all([
    concurrent(u, 'SELECT ' + sql),
    concurrent(u, 'SELECT ' + sql),
  ]);
  assert.ok(result.every((r) => r.code === 0));
  assert.equal(count('money_entries', u), '1');
  assert.equal(list(u, id).items[0].revision, 2);
  assert.deepEqual(
    json(u, sql),
    JSON.parse(
      result[0].out
        .trim()
        .split('\n')
        .filter((l) => l.startsWith('{'))
        .at(-1),
    ),
  );
  fails(() => mutate(u, id, 'pay', 1, payFields(o)));
  fails(() => mutate(u, id, 'pay', 1, { ...payFields(o), actualAmount: '99.99' }, req));
  assert.equal(count('money_entries', u), '1');
  const b = create(u, fields({ title: 'Second bill' })),
    next = list(u, b).occurrences[0];
  const race = await Promise.all([
    concurrent(u, 'SELECT ' + expression(b, 'pay', 1, payFields(next))),
    concurrent(u, 'SELECT ' + expression(b, 'pay', 1, payFields(next))),
  ]);
  assert.equal(race.filter((r) => r.code === 0).length, 1);
  assert.equal(count('money_entries', u), '2');
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
test('failed activity reconciliation rolls back payment, expense, proof, permit and receipt atomically', () => {
  const u = fixture(),
    id = create(u),
    o = list(u, id).occurrences[0];
  localSql(
    `CREATE FUNCTION crystrack_bills.synthetic_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='${u}' THEN RAISE EXCEPTION 'synthetic failure';END IF;RETURN NEW;END $$;CREATE TRIGGER synthetic_bill_fail BEFORE INSERT ON activity_events FOR EACH ROW EXECUTE FUNCTION crystrack_bills.synthetic_fail();`,
  );
  try {
    fails(() => mutate(u, id, 'pay', 1, payFields(o)));
    assert.equal(count('money_entries', u), '0');
    assert.equal(list(u, id).occurrences[0].status, 'due_soon');
    assert.equal(
      scalar(`SELECT count(*) FROM crystrack_bills.entry_permits WHERE user_id='${u}'`),
      '0',
    );
    assert.equal(scalar(`SELECT count(*) FROM crystrack_bills.requests WHERE user_id='${u}'`), '1');
  } finally {
    localSql(
      'DROP TRIGGER synthetic_bill_fail ON activity_events;DROP FUNCTION crystrack_bills.synthetic_fail()',
    );
  }
  mutate(u, id, 'pay', 1, payFields(o));
  assert.equal(count('money_entries', u), '1');
});
test('paid provenance cannot be cleared, modified, deleted or forged to earn ordinary spending shards', () => {
  const u = fixture(),
    id = create(u),
    o = list(u, id).occurrences[0];
  mutate(u, id, 'pay', 1, payFields(o));
  const p = list(u, id).occurrences[0];
  for (const sql of [
    `UPDATE money_entries SET bill_id=NULL,bill_occurrence_id=NULL WHERE id='${p.entryId}'`,
    `UPDATE money_entries SET amount=1 WHERE id='${p.entryId}'`,
    `DELETE FROM money_entries WHERE id='${p.entryId}'`,
    `INSERT INTO money_entries(user_id,type,flow_kind,amount,bill_id,bill_occurrence_id) VALUES('${u}','expense','expense',1,'${id}','${o.id}')`,
  ])
    fails(() => owner(u, sql));
  assert.equal(count('money_entries', u), '1');
  assert.equal(count('sep28_crystal_events', u), '0');
});
test('edit preserves paid/overdue history, changes only future plans, pause/resume catch missed days, cancel terminal', () => {
  const u = fixture(),
    id = create(u, fields({ firstDue: '2026-10-12', frequency: 'weekly' })),
    o = list(u, id).occurrences[0];
  mutate(u, id, 'pay', 1, payFields(o));
  const paid = JSON.stringify(list(u, id).occurrences[0]);
  mutate(
    u,
    id,
    'edit',
    2,
    fields({
      firstDue: '2026-10-12',
      frequency: 'weekly',
      title: 'Changed future',
      amount: '200.02',
    }),
  );
  let v = list(u, id);
  assert.equal(JSON.stringify(v.occurrences[0]), paid);
  assert.equal(v.occurrences[1].expected, '100.01');
  assert.equal(v.occurrences[2].expected, '200.02');
  const stale = v.occurrences[2];
  mutate(u, id, 'pause', 3, {});
  fails(() => mutate(u, id, 'pay', 4, payFields(stale)));
  mutate(u, id, 'resume', 4, {});
  assert.equal(list(u, id).items[0].status, 'active');
  mutate(u, id, 'cancel', 5, {});
  fails(() => mutate(u, id, 'resume', 6, {}));
  assert.equal(list(u, id).occurrences[0].status, 'paid');
  assert.ok(
    list(u, id)
      .occurrences.slice(1)
      .every((o) => o.status === 'canceled'),
  );
  assert.equal(count('money_entries', u), '1');
});
test('saved-zone changes revise future plans only and broken payment proof is never reported paid', () => {
  const u = fixture(),
    id = create(u, fields({ frequency: 'weekly' })),
    before = list(u, id),
    future = before.occurrences[1];
  localSql(`UPDATE profiles SET scheduling_timezone='America/New_York' WHERE user_id='${u}'`);
  const changed = list(u, id);
  assert.equal(changed.timezone, 'America/New_York');
  assert.equal(changed.occurrences[0].timezone, 'Africa/Lagos');
  assert.equal(changed.occurrences[1].timezone, 'America/New_York');
  assert.ok(changed.occurrences[1].revision > future.revision);
  fails(() => mutate(u, id, 'pay', 1, payFields(future), randomUUID(), 'America/New_York'));
  const current = changed.occurrences[0];
  mutate(u, id, 'pay', 1, payFields(current), randomUUID(), 'America/New_York');
  localSql(`UPDATE wealth_bill_occurrences SET actual_amount=120.03 WHERE id='${current.id}'`);
  let view = list(u, id);
  assert.equal(view.occurrences[0].status, 'not_confirmed');
  assert.equal(view.items[0].paidCount, 0);
  localSql(`UPDATE wealth_bill_occurrences SET actual_amount=120.02 WHERE id='${current.id}'`);
  view = list(u, id);
  assert.equal(view.occurrences[0].status, 'paid');
  assert.equal(view.items[0].paidCount, 1);
});
test('strict validation and stale zone/definition/occurrence revisions cannot write malformed money or wrong plan', () => {
  const u = fixture();
  for (const amount of ['-1', '0', 'NaN', '1.001', '10000000000'])
    fails(() => create(u, fields({ amount })));
  const id = create(u);
  fails(() => mutate(u, id, 'edit', 0, fields()));
  fails(() => mutate(u, id, 'edit', 1, fields({ firstDue: '2026-10-20', unexpected: 'owner' })));
  const o = list(u, id).occurrences[0];
  for (const occurrenceRevision of [99, null, '1', 1.5])
    fails(() => mutate(u, id, 'pay', 1, { ...payFields(o), occurrenceRevision }));
  fails(() => mutate(u, id, 'pay', 1, { ...payFields(o), actualAmount: 1 }));
  fails(() => create(u, fields({ merchant: { foreign: 'owner' } })));
  fails(() => mutate(u, id, 'pay', 1, payFields(o), randomUUID(), 'UTC'));
  assert.equal(count('money_entries', u), '0');
});
test('2,001 definitions aggregate complete future obligations, page stably and never create mirrored expected rows', () => {
  const u = fixture();
  localSql(
    `INSERT INTO wealth_recurring_bills(id,user_id,title,category,amount,frequency,first_due,end_date,created_at,updated_at) SELECT gen_random_uuid(),'${u}','Synthetic bulk','Utilities',0.01,'yearly','2026-10-20','2026-10-20',now(),now() FROM generate_series(1,2001)`,
  );
  const first = list(u);
  assert.equal(first.items.length, 20);
  assert.equal(first.plans.seven, '20.01');
  assert.equal(first.plans.thirty, '20.01');
  const second = list(u, null, 1, first.revision);
  assert.equal(second.items.length, 20);
  assert.equal(new Set([...first.items, ...second.items].map((b) => b.id)).size, 40);
  assert.equal(count('money_entries', u), '0');
  assert.equal(count('wealth_expected_flows', u), '0');
  const id = first.items[0].id;
  mutate(u, id, 'pause', 1, {});
  fails(() => list(u, null, 1, first.revision));
  assert.equal(list(u).plans.seven, '20.00');
});
test('reminder opt-in, saved-zone DND, unique claim, stale cancellation and missing delivery never duplicate', () => {
  const u = fixture(),
    id = create(u, fields({ reminderEnabled: true })),
    o = list(u, id).occurrences[0];
  clock('2026-10-19T08:00Z');
  localSql(
    `INSERT INTO user_preferences(user_id,dnd_enabled,dnd_start_time,dnd_end_time,default_reminder_channels) VALUES('${u}',true,'08:00','10:00',ARRAY['push','telegram']) ON CONFLICT(user_id) DO UPDATE SET dnd_enabled=true,dnd_start_time='08:00',dnd_end_time='10:00',default_reminder_channels=ARRAY['push','telegram']`,
  );
  const claim = () =>
    JSON.parse(scalar(`SELECT coalesce(bill_claim_reminder('${o.id}',1)::text,'null')`));
  assert.equal(claim(), null);
  localSql(`UPDATE user_preferences SET dnd_enabled=false WHERE user_id='${u}'`);
  const c = claim();
  assert.ok(c.id);
  assert.equal(claim(), null);
  localSql(
    `SELECT bill_finish_delivery('${c.id}','{}',ARRAY['push','telegram'],'Synthetic missing integrations')`,
  );
  assert.equal(claim(), null);
  assert.equal(count('reminder_deliveries', u), '1');
  mutate(u, id, 'pay', 1, payFields(o));
  assert.equal(claim(), null);
  assert.equal(
    scalar(`SELECT count(*) FROM reminders WHERE entity_type='bill' AND entity_id='${o.id}'`),
    '0',
  );
  const other = create(u, fields({ title: 'Cancel before reminder', reminderEnabled: true })),
    slot = list(u, other).occurrences[0];
  mutate(u, other, 'cancel', 1, {});
  assert.equal(scalar(`SELECT coalesce(bill_claim_reminder('${slot.id}',1)::text,'null')`), 'null');
});
test('real local PostgREST JWT boundary and authenticated create/pay transaction preserve exact response text', async () => {
  const keys = readLocalKeys(),
    admin = createClient(keys.NEXT_PUBLIC_SUPABASE_URL, keys.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  clock('2026-10-19T12:00Z');
  const password = randomUUID() + 'Aa1!';
  const { data, error } = await admin.auth.admin.createUser({
    email: `bill-${randomUUID()}@example.invalid`,
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
  const id = randomUUID();
  assert.equal(
    (
      await c.rpc('wealth_bill_mutate', {
        p_action: 'create',
        p_id: id,
        p_revision: 0,
        p_request: randomUUID(),
        p_timezone: 'Africa/Lagos',
        p_fields: fields(),
      })
    ).error,
    null,
  );
  const v = await c.rpc('wealth_bill_list', { p_id: id });
  assert.equal(v.error, null);
  assert.equal(v.data.items[0].amount, '100.01');
  const bad = await fetch(keys.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/rpc/wealth_bill_list', {
    method: 'POST',
    headers: {
      apikey: keys.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      authorization: 'Bearer invalid',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(bad.status, 401);
});
