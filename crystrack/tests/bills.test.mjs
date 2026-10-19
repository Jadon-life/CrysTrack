import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';
const native = createRequire(import.meta.url),
  cache = new Map();
function load(f) {
  f = path.resolve(f);
  if (cache.has(f)) return cache.get(f).exports;
  const mod = { exports: {} };
  cache.set(f, mod);
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
  )(
    (n) => (n.startsWith('.') ? load(path.resolve(path.dirname(f), n + '.ts')) : native(n)),
    mod,
    mod.exports,
  );
  return mod.exports;
}
const { anchoredDue, billWriteSchema, billViewSchema, billMutationResultSchema } =
  load('src/lib/bills.ts');
const { kobo, decimal } = load('src/lib/budget-money.ts');
test('bill recurrence clamps month ends without anchor drift, including leap/year/quarter/DST dates', () => {
  assert.equal(anchoredDue('2026-01-31', 'monthly', 1), '2026-02-28');
  assert.equal(anchoredDue('2026-01-31', 'monthly', 2), '2026-03-31');
  assert.equal(anchoredDue('2028-02-29', 'yearly', 1), '2029-02-28');
  assert.equal(anchoredDue('2028-02-29', 'yearly', 4), '2032-02-29');
  assert.equal(anchoredDue('2026-01-31', 'quarterly', 1), '2026-04-30');
  assert.equal(anchoredDue('2026-03-01', 'weekly', 1), '2026-03-08');
  assert.equal(anchoredDue('2026-10-25', 'weekly', 1), '2026-11-01');
  assert.throws(() => anchoredDue('2026-02-29', 'monthly', 1));
});
test('bill envelopes reject client money coercion, owner/reward/timestamp fields and invalid revisions', () => {
  const b = {
    action: 'create',
    id: '00000000-0000-4000-8000-000000000001',
    revision: 0,
    requestId: '00000000-0000-4000-8000-000000000002',
    timezone: 'Africa/Lagos',
    fields: {
      title: 'Internet',
      category: 'Utilities',
      merchant: null,
      amount: '100.01',
      frequency: 'monthly',
      firstDue: '2026-10-31',
      endDate: null,
      reminderEnabled: false,
    },
  };
  assert.equal(billWriteSchema.safeParse(b).success, true);
  for (const amount of ['0', '-1', '1.001', 'NaN', '1e3', 100.01])
    assert.equal(
      billWriteSchema.safeParse({ ...b, fields: { ...b.fields, amount } }).success,
      false,
    );
  for (const key of ['user_id', 'bill_id', 'paidAt', 'shards', 'currency'])
    assert.equal(billWriteSchema.safeParse({ ...b, [key]: 'x' }).success, false);
  assert.equal(
    billWriteSchema.safeParse({ ...b, fields: { ...b.fields, unexpected: true } }).success,
    false,
  );
  assert.equal(decimal(kobo('100.01') + kobo('0.02')), '100.03');
});
test('paid UI cannot claim confirmation without source identity, payment timestamp and actual amount', () => {
  const v = {
    today: '2026-10-19',
    timezone: 'Africa/Lagos',
    revision: '0'.repeat(32),
    page: 0,
    hasMore: false,
    items: [],
    occurrences: [],
    plans: { seven: '0.00', thirty: '0.00', overdue: 0 },
  };
  assert.equal(billViewSchema.safeParse(v).success, true);
  const o = {
    id: '00000000-0000-4000-8000-000000000001',
    billId: '00000000-0000-4000-8000-000000000002',
    dueDay: '2026-10-19',
    timezone: 'Africa/Lagos',
    title: 'Internet',
    category: 'Utilities',
    expected: '100.00',
    actual: null,
    revision: 1,
    paidAt: null,
    entryId: null,
    status: 'paid',
  };
  assert.equal(billViewSchema.safeParse({ ...v, occurrences: [o] }).success, false);
  assert.equal(
    billViewSchema.safeParse({ ...v, occurrences: [{ ...o, status: 'not_confirmed' }] }).success,
    true,
  );
  assert.equal(billViewSchema.safeParse({ ...v, timezone: 'Invalid/Zone' }).success, false);
});

test('mutation acknowledgement requires real identity, positive revision and an explicit nullable source field', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  assert.ok(billMutationResultSchema.safeParse({ id, revision: 1, entryId: null }).success);
  for (const data of [
    { id, revision: 1 },
    { id, revision: '1', entryId: null },
    { id, revision: 0, entryId: null },
    { id, revision: 1, entryId: 'unknown' },
  ])
    assert.equal(billMutationResultSchema.safeParse(data).success, false);
});
