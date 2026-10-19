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
const { moneyPresentation: p, editableMoney } = load('src/lib/money-presentation.ts');
const { kobo, exactMoney } = load('src/lib/budget-money.ts');
test('everyday whole naira omits zero kobo, including exact zero and negatives', () => {
  for (const [value, text] of [
    ['0', '₦0'],
    ['0.00', '₦0'],
    ['25000.00', '₦25,000'],
    ['-25000', '−₦25,000'],
    ['-0.00', '₦0'],
  ]) {
    assert.equal(p(value).text, text);
    assert.equal(p(value).approximate, false);
  }
});
test('everyday decisions keep genuine kobo visible rather than silently rounding', () => {
  for (const [value, text] of [
    ['0.01', '₦0.01'],
    ['2500.75', '₦2,500.75'],
    ['-0.01', '−₦0.01'],
    ['999.50', '₦999.50'],
  ])
    assert.equal(p(value).text, text);
});
test('whole summaries visibly mark half-up rounding and retain exact accessible disclosure', () => {
  for (const [value, text] of [
    ['0.01', '≈₦0'],
    ['0.49', '≈₦0'],
    ['0.50', '≈₦1'],
    ['2500.75', '≈₦2,501'],
    ['-0.49', '≈−₦0'],
    ['-0.50', '≈−₦1'],
  ]) {
    const r = p(value, 'NGN', null, { mode: 'summary' });
    assert.equal(r.text, text);
    assert.equal(r.approximate, true);
    assert.ok(r.detail.includes(exactMoney(value)));
  }
  assert.equal(p('2500.00', 'NGN', null, { mode: 'summary' }).text, '₦2,500');
});
test('bank statement views always retain both decimals without changing source strings', () => {
  for (const value of ['0', '2500.00', '2500.75', '9999999999.99', '-0.01']) {
    const before = kobo(value);
    assert.equal(p(value, 'NGN', null, { mode: 'statement' }).text, exactMoney(value));
    assert.equal(kobo(value), before);
  }
});
test('large exact strings preserve every digit beyond Number safe integers', () => {
  assert.equal(p('9007199254740993.00').text, '₦9,007,199,254,740,993');
  assert.equal(p('9007199254740993.01').text, '₦9,007,199,254,740,993.01');
  assert.equal(p('9999999999.99', 'NGN', null, { mode: 'summary' }).text, '≈₦10,000,000,000');
});
test('indicative USD never masquerades as canonical or exact, including integer/zero conversions', () => {
  assert.equal(p('2500.25', 'USD', 1600).text, '≈ $1.56');
  assert.equal(p('1600.00', 'USD', 1600).text, '≈ $1.00');
  assert.equal(p('0.01', 'USD', 1600).text, '≈ $0.00');
  assert.match(p('2500.25', 'USD', 1600).detail, /Exact NGN amount: ₦2,500.25/);
  for (const rate of [undefined, 0, NaN, Infinity, -1])
    assert.equal(p('2500', 'USD', rate).text, '₦2,500 · USD unavailable');
});
test('legacy Number totals have a display-only bridge and expose drift/sub-cent rounding', () => {
  assert.equal(p(25000).text, '₦25,000');
  assert.equal(p(2500.75).text, '₦2,500.75');
  for (const value of [0.1 + 0.2, 1.005, 1e-7, -1e-7]) {
    const r = p(value);
    assert.equal(r.approximate, true);
    assert.equal(r.exact, null);
    assert.ok(r.text.startsWith('≈'));
    assert.match(r.detail, /not an exact ledger total/);
  }
  assert.equal(p(1.005).text, '≈₦1.01');
});
test('invalid or unsafe input never becomes a fabricated zero', () => {
  for (const value of [
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER,
    '',
    'NaN',
    '1e3',
    '1,000',
    '1.001',
    ' 0',
    '01',
  ])
    assert.equal(p(value).text, '—');
});
test('editable values simplify whole naira but never drop real kobo', () => {
  for (const [value, output] of [
    ['2500.00', '2500'],
    ['0.00', '0'],
    ['2500.75', '2500.75'],
    ['-0.01', '-0.01'],
  ]) {
    assert.equal(editableMoney(value), output);
    assert.equal(kobo(editableMoney(value)), kobo(value));
  }
  assert.throws(() => editableMoney('1.001'));
});
test('sign policy and Nigerian grouping are deterministic for screen-reader descriptions', () => {
  assert.equal(p('2500', 'NGN', null, { sign: true }).text, '+₦2,500');
  assert.equal(p('2500.75', 'NGN', null, { sign: true, mode: 'summary' }).text, '≈+₦2,501');
  assert.equal(p('-2500.75', 'NGN', null, { sign: true }).text, '−₦2,500.75');
  assert.equal(p('1000000').detail, 'Exact NGN amount: ₦1,000,000.00.');
});
