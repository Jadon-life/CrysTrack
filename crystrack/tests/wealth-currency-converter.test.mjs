import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';

const native = createRequire(import.meta.url);
const modules = new Map();
function load(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file).exports;
  const item = { exports: {} };
  modules.set(file, item);
  const source = fs.readFileSync(file, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'module', 'exports', transpiled)(
    name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : native(name),
    item, item.exports,
  );
  return item.exports;
}
const {convertReferenceAmount: convert} = load('src/lib/reference-currency.ts');
test('Naira to dollar and dollar to Naira use the SAME reference quote', () => {
  const naira = convert('2500.25', 'NGN', 1600);
  assert.equal(naira.source, '₦2,500.25');
  assert.equal(naira.target, '$1.56');
  assert.equal(naira.unit, 'USD');
  const usd = convert('2.50', 'USD', 1600);
  assert.equal(usd.source, '$2.50');
  assert.equal(usd.target, '₦4,000.00');
  assert.equal(usd.unit, 'NGN');
  assert.equal(usd.quote, '1600');
});
test('Fixed-point half-up rounding never loses kobo to floating arithmetic', () => {
  assert.equal(convert('0.01', 'USD', 1600).target, '₦16.00');
  assert.equal(convert('0.01', 'NGN', 1600).target, '$0.00');
  assert.equal(convert('0.005', 'USD', 1600), null);
  assert.equal(convert('0.01', 'USD', 0.5).target, '₦0.01'); // half-up 0.005 NGN
  assert.equal(convert('1.00', 'USD', 1234.56789).target, '₦1,234.57');
  assert.equal(convert('1234.56789', 'NGN', 1234), null);
  assert.equal(convert('2000000000000.00', 'NGN', 2000).target, '$1,000,000,000.00');
});
test('Invalid, absent, negative or unsafely formatted amounts and rates fail closed', () => {
  for (const amount of ['', '1e4', '1,000', '-1', '01.0', '1.234', ' 20', 'Infinity', '$20']) {
    assert.equal(convert(amount, 'NGN', 1500), null, String(amount));
  }
  for (const rate of [undefined, null, NaN, Infinity, 0, -1, 1e-13]) {
    assert.equal(convert('100', 'NGN', rate), null, String(rate));
  }
  assert.equal(convert('100', 'EUR', 1500), null);
});
test('All currency conversion stays display-only, never in a finance writer', () => {
  const helper = fs.readFileSync('src/lib/reference-currency.ts', 'utf8');
  const ui = fs.readFileSync('src/components/wealth/currency-converter.tsx', 'utf8');
  const wealth = fs.readFileSync('src/app/finance/page.tsx', 'utf8');
  assert.match(ui, /Convert either way using one reference rate/);
  assert.match(ui, /This does not exchange or record money/);
  assert.match(ui, /All actual CrysTrack Money entries are recorded in NGN/);
  assert.match(ui, /aria-label=\{\`Swap conversion direction/);
  assert.match(wealth, /<WealthCurrencyConverter rate=\{rate\} loadingRate=\{loadingRate\}/);
  assert.match(wealth, /Amount \(NGN\)/);
  assert.doesNotMatch(helper + ui, /fetch\(|post\(|patch\(|supabase|localStorage\.setItem|money_entries|service_role/i);
  assert.match(ui, /Synthetic illustration only/);
  assert.match(ui, /No conversion is guessed/);
});
