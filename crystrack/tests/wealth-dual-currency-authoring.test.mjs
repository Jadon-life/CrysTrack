import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';
const native = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const js = ts.transpileModule(fs.readFileSync(file,'utf8'), {
    compilerOptions: { module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require','module','exports',js)(
    name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):native(name),
    mod,mod.exports
  );
  return mod.exports;
}
const {sourceAmountToNgn:toNgn}=load('src/lib/wealth-input-currency.ts');
const {moneyPresentation}=load('src/lib/money-presentation.ts');
test('NGN budget of 30000 shows its USD equivalent when Wealth toggle changes',()=>{
  const a=moneyPresentation('30000.00','NGN',1600);
  const b=moneyPresentation('30000.00','USD',1600);
  assert.equal(a.text,'₦30,000');
  assert.equal(b.text,'≈ $18.75');
  assert.equal(a.exact,'₦30,000.00');
});
test('USD subscription of 30 converts to ₦48,000 at same quote and vice versa for displays',()=>{
  const entered=toNgn('30','USD',1600,false);
  assert.deepEqual(entered,{ngn:'48000.00',origin:'$30.00',quote:'1600'});
  assert.equal(moneyPresentation(entered.ngn,'NGN',1600).text,'₦48,000');
  assert.equal(moneyPresentation(entered.ngn,'USD',1600).text,'≈ $30.00');
  assert.deepEqual(toNgn('30000','NGN',null,true),{ngn:'30000.00',origin:'₦30,000.00',quote:null});
});
test('fixed-point rounding is deterministic, avoids JS float and rejects stale rates',()=>{
  assert.equal(toNgn('0.01','USD',1600)?.ngn,'16.00');
  assert.equal(toNgn('0.01','USD',0.5)?.ngn,'0.01');
  assert.equal(toNgn('1.00','USD',1234.56789)?.ngn,'1234.57');
  assert.equal(toNgn('30','USD',1600,true),null);
  for(const rate of [null,undefined,0,Infinity,NaN,-1,1e-13]) assert.equal(toNgn('30','USD',rate,false),null);
  for(const raw of ['', '30.001','1,000','30e2','-30',' 30', '0','01','10000000000']) assert.equal(toNgn(raw,'USD',1600),null);
});
test('finance modal, budgets, bills and actual bill payment convert before calling unchanged writer',()=>{
  const entry=fs.readFileSync('src/app/finance/page.tsx','utf8');
  const budget=fs.readFileSync('src/components/wealth/monthly-budgets.tsx','utf8');
  const bills=fs.readFileSync('src/components/wealth/recurring-bills.tsx','utf8');
  const writer=fs.readFileSync('src/app/api/finance/entries/route.ts','utf8');
  assert.match(entry, /sourceAmountToNgn\(entry.amount, entryCurrency, rate\?\.usdNgn, rate\?\.stale\)/);
  assert.match(entry, /amount = Number\(normalized.ngn\)/);
  assert.match(entry, /Source \${normalized.origin}.*reference quote at entry time/);
  assert.match(entry,/aria-label=\{\`Amount \(\${entryCurrency}\)\`\}/);
  assert.match(budget,/sourceAmountToNgn\(limit, limitCurrency, rate\?\.usdNgn, rate\?\.stale\)/);
  assert.match(budget,/budgetSetSchema\.safeParse\(\{ \.\.\.body, limit: normalized.ngn \}\)/);
  assert.match(bills,/billFieldsSchema\.safeParse\(\{ \.\.\.fields, amount: converted.ngn \}\)/);
  assert.match(bills,/actualAmount: converted.ngn/);
  assert.match(bills,/Bill amount currency/);
  assert.match(bills,/Bill payment currency/);
  assert.match(writer,/amount,\s*\n\s*date: body\.date/);
  assert.doesNotMatch(entry,/WealthCurrencyConverter/);
  assert.doesNotMatch(entry,/Naira ↔ dollar calculator/);
});
test('an explicit currency change clears the typed input rather than relabeling 30 NGN as 30 USD',()=>{
  const entry=fs.readFileSync('src/app/finance/page.tsx','utf8');
  const bills=fs.readFileSync('src/components/wealth/recurring-bills.tsx','utf8');
  const budget=fs.readFileSync('src/components/wealth/monthly-budgets.tsx','utf8');
  assert.match(entry,/setEntry\(v => \(\{\.\.\.v,amount:''\}\)\)/);
  assert.match(bills,/setFields\(f=>\(\{\.\.\.f,amount:''\}\)\)/);
  assert.match(bills,/setActual\(''\)/);
  assert.match(budget,/setLimit\(''\)/);
});
