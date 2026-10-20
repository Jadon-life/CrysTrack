import test from 'node:test';
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
      name.startsWith('@/')
        ? load(path.resolve('src', name.slice(2) + '.ts'))
        : name.startsWith('.')
          ? load(path.resolve(path.dirname(file), name + '.ts'))
          : native(name),
    mod,
    mod.exports,
  );
  return mod.exports;
}
const {
  buildWealthReport: report,
  localDay,
  expectedCount,
  sanitizedExactMetrics,
} = load('src/lib/wealth-report.ts');
const { decimal, kobo } = load('src/lib/budget-money.ts');
const old = load('src/lib/wealth.ts');
const uid = '00000000-0000-4000-8000-000000000001';
let seq = 10;
const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const b = (kind, amount, month = '2026-10', category = 'Food', count = 1) => ({
  month,
  kind,
  amount,
  category,
  count,
});
function snap(buckets = [], extras = {}) {
  const count = buckets.reduce((n, b) => n + b.count, 0);
  return {
    timezone: 'Africa/Lagos',
    today: '2026-10-19',
    count,
    buckets,
    entries: Array.from({ length: Math.min(count, 14) }, () => ({
      id: id(),
      user_id: uid,
      type: 'income',
      flow_kind: 'income',
      amount: '1.00',
      date: (extras.today ?? '2026-10-19').slice(0, 7) + '-01T00:00:00Z',
      source: null,
      category: null,
    })),
    targets: [],
    debts: [],
    expectedFlows: [],
    ...extras,
  };
}
const debt = (kind, outstanding, due = null, status = 'open') => ({
  id: id(),
  user_id: uid,
  kind,
  original_amount: '1000.00',
  outstanding_amount: outstanding,
  due_date: due,
  status,
});
const flow = (direction, min, max = null, extras = {}) => ({
  id: id(),
  user_id: uid,
  direction,
  amount_min: min,
  amount_max: max,
  frequency: 'monthly',
  expected_on: null,
  last_confirmed_at: null,
  last_actual_amount: null,
  status: 'active',
  ...extras,
});
test('complete grouped cents and large exact totals never cross Number authority', () => {
  const s = report(
    snap([b('income', '20.05', '2026-09', 'Other', 2005), b('expense', '0.30')]),
    uid,
  );
  assert.equal(s.summary.availableBalance, '19.75');
  // The former most-recent-2,000 authority loses six older income cents.
  const capped = old.summarizeWealth(
    [
      { type: 'expense', amount: '0.30', date: '2026-10-02T12:00:00Z' },
      ...Array.from({ length: 1999 }, () => ({
        type: 'income',
        amount: '0.01',
        date: '2026-09-01T12:00:00Z',
      })),
    ],
    [],
    [],
    new Date('2026-10-19T12:00:00Z'),
  );
  assert.equal(capped.availableBalance.toFixed(2), '19.69');
  assert.notEqual(s.summary.availableBalance, capped.availableBalance.toFixed(2));

  assert.equal(s.reporting.ledgerCount, 2006);
  assert.equal(s.entries.length, 14);
  assert.equal(
    report(snap([b('income', '9007199254740993.01')]), uid).summary.availableBalance,
    '9007199254740993.01',
  );
});
test('flow-kind movements preserve balances, transfers, savings clamp and debt semantics', () => {
  const r = report(
    snap(
      [
        b('income', '100.00'),
        b('borrow', '10.00'),
        b('receivable_repayment', '5.00'),
        b('savings_release', '2.00'),
        b('expense', '3.00'),
        b('saving', '4.00'),
        b('lend', '6.00'),
        b('liability_repayment', '7.00'),
        b('transfer', '999.00'),
      ],
      {
        debts: [
          debt('receivable', '8.00'),
          debt('liability', '9.00'),
          debt('liability', '100.00', null, 'settled'),
        ],
      },
    ),
    uid,
  ).summary;
  assert.equal(r.availableBalance, '97.00');
  assert.equal(r.savedBalance, '2.00');
  assert.equal(r.netPosition, '98.00');
  assert.equal(r.netSpendableFlow, '95.00');
  assert.equal(r.safeToSpend, '88.00');
  assert.equal(report(snap([b('savings_release', '5.00')]), uid).summary.savedBalance, '0.00');
});
test('fixed valid small scenario matches legacy actual/forecast meanings without copying float authority', () => {
  const entries = [
    { type: 'income', flow_kind: 'income', amount: 1000, date: '2026-10-03T12:00Z' },
    { type: 'expense', flow_kind: 'expense', amount: 100, date: '2026-10-04T12:00Z' },
    { type: 'saving', flow_kind: 'saving', amount: 200, date: '2026-10-04T12:00Z' },
  ];
  const debts = [debt('liability', '20.00')],
    flows = [flow('income', '50.00', '60.00'), flow('expense', '10.00', '15.00')];
  const before = old.summarizeWealth(entries, debts, flows, new Date('2026-10-19T12:00Z'));
  const after = report(
    snap(
      entries.map((e) => b(e.flow_kind, String(e.amount))),
      { timezone: 'UTC', debts, expectedFlows: flows },
    ),
    uid,
  ).summary;
  for (const key of [
    'availableBalance',
    'savedBalance',
    'netPosition',
    'monthIncome',
    'monthExpenses',
    'monthSaved',
    'netSpendableFlow',
    'safeToSpend',
    'projectedMonthEndLow',
    'projectedMonthEndHigh',
  ])
    assert.equal(after[key], decimal(kobo(String(before[key]))), key);
  assert.ok(Math.abs(Number(after.projectedMonthExpenses) - before.projectedMonthExpenses) < 0.005);
});
test('saved-zone instants align Lagos midnight, New York DST, leap and rollover', () => {
  assert.equal(localDay('2026-09-30T23:05:00Z', 'Africa/Lagos'), '2026-10-01');
  assert.equal(localDay('2026-10-01T00:05:00Z', 'America/New_York'), '2026-09-30');
  assert.equal(localDay('2026-03-08T07:00:00Z', 'America/New_York'), '2026-03-08');
  assert.equal(localDay('2026-11-01T06:00:00Z', 'America/New_York'), '2026-11-01');
  const r = report(snap([b('expense', '1.00', '2024-02')], { today: '2024-02-29' }), uid);
  assert.equal(r.cashflow.at(-1).key, '2024-02');
  assert.equal(r.summary.projectedMonthExpenses, '1.00');
  assert.throws(() => localDay('2026-10-01', 'Africa/Lagos'));
});
test('six-month cashflow uses full exact buckets, independent of recent entries or browser month', () => {
  const r = report(
    snap([
      b('income', '25.00', '2026-05'),
      b('expense', '0.75', '2026-10'),
      b('saving', '0.10'),
      b('savings_release', '0.20'),
    ]),
    uid,
  );
  assert.equal(r.cashflow.length, 6);
  assert.equal(r.cashflow[0].income, '25.00');
  assert.equal(r.cashflow.at(-1).expenses, '0.75');
  assert.equal(r.cashflow.at(-1).savings, '-0.10');
  assert.equal(r.summary.monthSaved, '0.00');
});
test('expected counts keep inclusive weekly rules and saved-zone confirmation boundaries', () => {
  const f = flow('income', '10.00');
  assert.equal(expectedCount({ ...f, frequency: 'weekly' }, '2026-10-19', 'Africa/Lagos'), 2);
  assert.equal(
    expectedCount(
      { ...f, last_confirmed_at: '2026-09-30T23:30:00Z' },
      '2026-10-19',
      'Africa/Lagos',
    ),
    0,
  );
  assert.equal(
    expectedCount(
      { ...f, last_confirmed_at: '2026-09-30T23:30:00Z' },
      '2026-10-19',
      'America/New_York',
    ),
    1,
  );
  assert.equal(expectedCount({ ...f, frequency: 'one_off' }, '2026-10-19', 'Africa/Lagos'), 1);
  assert.equal(expectedCount({ ...f, frequency: 'yearly' }, '2026-10-19', 'Africa/Lagos'), 0);
});
test('due liability uses next-month saved-zone exclusive boundary; planned bills cannot enter ranges', () => {
  const r = report(
    snap([b('income', '100.00')], {
      debts: [
        debt('liability', '5.00', '2026-10-31T23:00:00Z'),
        debt('liability', '6.00', '2026-10-31T22:59:59Z'),
      ],
      expectedFlows: [flow('income', '10.00', '20.00'), flow('expense', '2.00', '3.00')],
    }),
    uid,
  ).summary;
  assert.equal(r.dueLiabilities, '6.00');
  assert.equal(r.safeToSpend, '91.00');
  assert.equal(r.projectedMonthEndLow, '101.00');
  assert.equal(r.projectedMonthEndHigh, '112.00');
});
test('category baselines observe prior expense months, zero-fill missing category, never invent history', () => {
  const r = report(
    snap([
      b('expense', '9.00', '2026-01', 'A'),
      b('expense', '3.00', '2026-07', 'A'),
      b('expense', '6.00', '2026-08', 'B'),
      b('expense', '9.00', '2026-09', 'A'),
      b('expense', '1.00', '2026-10', 'A'),
    ]),
    uid,
  ).summary;
  assert.equal(r.categoryPatterns.find((p) => p.category === 'A').baseline, '4.00');
  assert.equal(r.dataMonths, 5);
});
test('projection and velocity compare unrounded rational values at the 15 percent boundary', () => {
  const raw = snap([b('expense', '20000.00', '2026-03'), b('expense', '7666.66', '2026-04')], {
    today: '2026-04-10',
  });
  raw.entries = raw.entries.map((e) => ({ ...e, date: '2026-04-01T00:00:00Z' }));
  const s = report(raw, uid).summary;
  assert.equal(s.projectedExpenseChangePct, 15);
  assert.equal(s.spendingVelocity, 'normal');
  assert.equal(s.projectedMonthExpenses, '22999.98');
});
test('partial, duplicate, foreign, future, invalid or unbounded evidence never becomes zero', () => {
  const x = snap([b('income', '1.00')]);
  for (const y of [
    { ...x, count: 2 },
    { ...x, buckets: [...x.buckets, ...x.buckets] },
    { ...x, timezone: 'invalid' },
    { ...x, buckets: [b('income', '1e3')] },
    { ...x, buckets: [b('income', '0.00')] },
    { ...x, buckets: [b('income', '1.00', '2026-11')] },
    { ...x, entries: x.entries.map((e) => ({ ...e, user_id: id() })) },
  ])
    assert.throws(() => report(y, uid));
});
test('read derivation is immutable and AI sanitization contains no source line items', () => {
  const raw = snap([b('expense', '0.30')]);
  const before = JSON.stringify(raw);
  const r = report(raw, uid);
  assert.equal(JSON.stringify(raw), before);
  const m = sanitizedExactMetrics(r.summary);
  assert.equal(m.cashflow, 'negative');
  assert.ok(!JSON.stringify(m).includes('source'));
  assert.ok(!JSON.stringify(m).includes('notes'));
});

test('read adapter denies malformed, foreign and absent coverage without masking a zero', async () => {
  const { readWealthReport } = load('src/lib/wealth-report-server.ts');
  assert.equal(
    (await readWealthReport({ rpc: async () => ({ data: snap(), error: null }) }, uid)).summary
      .availableBalance,
    '0.00',
  );
  for (const response of [
    { data: null, error: { message: 'private database detail' } },
    { data: {}, error: null },
    { data: { ...snap(), count: 1 }, error: null },
  ])
    await assert.rejects(() => readWealthReport({ rpc: async () => response }, uid));
});
test('unsupported exact magnitude and response cardinality fail rather than truncating authority', () => {
  const x = snap([b('income', '1.00')]);
  assert.throws(() => report({ ...x, buckets: [b('income', '1'.repeat(49) + '.00')] }, uid));
  assert.throws(() =>
    report({ ...x, buckets: Array.from({ length: 12001 }, () => b('income', '1.00')) }, uid),
  );
});

test('AI wealth context shares exact authority and saved-zone metadata without private line items', async () => {
  const { buildIntelligenceContext } = load('src/lib/ai/context.ts');
  const raw = snap([b('income', '25.01')], {
    debts: [{ ...debt('liability', '0.25'), counterparty: 'PRIVATE COUNTERPARTY' }],
  });
  raw.entries[0].amount = '25.01';
  raw.entries[0].source = 'PRIVATE DESCRIPTION';
  raw.entries[0].note = 'PRIVATE NOTE';
  raw.entries[0].reference = 'PRIVATE REFERENCE';
  const client = {
    from(table) {
      assert.equal(table, 'profiles');
      return {
        select() {
          return this;
        },
        eq(key, owner) {
          assert.equal(key, 'user_id');
          assert.equal(owner, uid);
          return this;
        },
        async maybeSingle() {
          return { data: { timezone: 'Pacific/Honolulu', current_timezone: 'UTC' } };
        },
      };
    },
    async rpc(name) {
      assert.equal(name, 'wealth_overview_read');
      return { data: raw, error: null };
    },
  };
  const result = await buildIntelligenceContext(client, uid, 'wealth');
  assert.equal(result.timezone, 'Africa/Lagos');
  assert.equal(result.as_of_date, '2026-10-19');
  assert.equal(result.as_of_weekday, 1);
  assert.equal(result.wealth.accounting_summary.availableBalance, '25.01');
  assert.equal(result.wealth.ledger_rows_processed, 1);
  assert.equal(result.wealth.ledger_truncated_for_safety, false);
  assert.equal(result.wealth.recent_transactions[0].amount_ngn, '25.01');
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  await assert.rejects(
    () =>
      buildIntelligenceContext(
        { ...client, rpc: async () => ({ error: { message: 'PRIVATE failure' } }) },
        uid,
        'wealth',
      ),
    { message: 'Financial read unavailable' },
  );
});
