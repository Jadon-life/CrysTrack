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
      name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : native(name),
    mod,
    mod.exports,
  );
  return mod.exports;
}
const { kobo, decimal, exactMoney, indicativeUsd, budgetSignal, usedPercent, progressWidth } =
  load('src/lib/budget-money.ts');
const {
  budgetCategories,
  budgetSetSchema,
  budgetRemoveSchema,
  budgetQuerySchema,
  budgetViewSchema,
  shiftMonth,
} = load('src/lib/budgets.ts');
test('budget money remains exact over cents, huge totals, negative remainder and display conversion', () => {
  assert.equal(decimal(kobo('0.10') + kobo('0.20')), '0.30');
  assert.equal(kobo('9007199254740993.01'), 900719925474099301n);
  assert.equal(decimal(kobo('12.34') - kobo('50')), '-37.66');
  assert.equal(exactMoney('9007199254740993.01'), '₦9,007,199,254,740,993.01');
  assert.equal(indicativeUsd('2500.25', 1600), '1.56');
  assert.equal(indicativeUsd('-2500.25', 1600), '-1.56');
  assert.equal(indicativeUsd('1.00', 0), null);
  assert.equal(indicativeUsd('1.00', NaN), null);
  for (const s of ['NaN', 'Infinity', '1e2', '0.001', '01.00', '1,000'])
    assert.throws(() => kobo(s));
});
test('budget signals and percentages compare exact integer kobo and preserve overspending', () => {
  assert.equal(budgetSignal('0.00', null), 'unset');
  assert.equal(budgetSignal('79.99', '100'), 'within');
  assert.equal(budgetSignal('80.00', '100'), 'near');
  assert.equal(budgetSignal('100.01', '100'), 'over');
  assert.equal(usedPercent('1', '3'), '33.33');
  assert.equal(usedPercent('2', '3'), '66.67');
  assert.equal(usedPercent('20000000019.99', '9999999999.99'), '200.00');
  assert.equal(progressWidth('200', '100'), '100.00%');
});
test('strict budget writes reject owner/currency/mass assignment, floats, invalid limits and malformed months', () => {
  const b = {
    month: '2026-10-01',
    category: 'Food',
    limit: '100.01',
    revision: 0,
    requestId: '00000000-0000-4000-8000-000000000001',
    timezone: 'Africa/Lagos',
  };
  assert.equal(budgetSetSchema.safeParse(b).success, true);
  for (const key of ['user_id', 'currency', 'spent', 'shards', 'active'])
    assert.equal(budgetSetSchema.safeParse({ ...b, [key]: 'x' }).success, false);
  for (const limit of [100, '0', '-1', 'NaN', '10000000000', '0.001'])
    assert.equal(budgetSetSchema.safeParse({ ...b, limit }).success, false);
  assert.equal(budgetSetSchema.safeParse({ ...b, month: '2026-10-02' }).success, false);
  assert.equal(budgetSetSchema.safeParse({ ...b, category: 'Crypto' }).success, false);
  assert.equal(budgetRemoveSchema.safeParse({ ...b, limit: undefined }).success, false);
  assert.equal(budgetQuerySchema.safeParse({ month: '2028-02-01' }).success, true);
  assert.equal(shiftMonth('2028-02-01', 1), '2028-03-01');
  assert.equal(shiftMonth('2026-01-01', -1), '2025-12-01');
});
test('unavailable or inconsistent aggregates cannot claim zero spend, unset limit or mixed currency', () => {
  const v = {
    month: '2026-10-01',
    currentMonth: '2026-10-01',
    minimum: '2025-10-01',
    timezone: 'Africa/Lagos',
    currency: 'NGN',
    startsAt: '2026-09-30T23:00:00Z',
    endsAt: '2026-10-31T23:00:00Z',
    items: budgetCategories.map((category) => ({
      category,
      id: null,
      revision: 0,
      active: false,
      limit: null,
      spent: '0.00',
      entryCount: 0,
      left: null,
      percentUsed: null,
      createdAt: null,
      updatedAt: null,
      removedAt: null,
    })),
  };
  assert.equal(budgetViewSchema.safeParse(v).success, true);
  for (const change of [
    (x) => (x.currency = 'USD'),
    (x) => x.items.pop(),
    (x) => (x.items[0].spent = 0),
    (x) => (x.items[0].active = true),
    (x) => (x.items[0].spent = '9.99'),
    (x) => (x.items[0].category = 'Other'),
    (x) => (x.timezone = 'No/Zone'),
  ]) {
    const x = structuredClone(v);
    change(x);
    assert.equal(budgetViewSchema.safeParse(x).success, false);
  }
});
