import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('synthetic Wealth can demonstrate the currency toggle without external rate provider', () => {
  const hook = fs.readFileSync('src/lib/wealth-currency.ts', 'utf8');
  const ui = fs.readFileSync('src/app/finance/page.tsx', 'utf8');
  assert.match(hook, /if \(isRestrictedPreview\(\)\) \{/);
  const start = hook.indexOf('if (isRestrictedPreview())');
  const end = hook.indexOf('const storedCurrency', start);
  const preview = hook.slice(start, end);
  assert.match(preview, /usdNgn: 1600/);
  assert.match(preview, /Synthetic demonstration/);
  assert.match(preview, /setRate\(/);
  assert.doesNotMatch(preview, /fetch\(|localStorage|setItem\(/);
  assert.match(ui, /Synthetic demonstration: \$1 = ₦1,600 is an example only/);
  assert.match(ui, /Synthetic example quote — not current market FX/);
  assert.match(ui, /!isRestrictedPreview\(\) && <a/);
  assert.doesNotMatch(ui, /WealthCurrencyConverter/);
});
