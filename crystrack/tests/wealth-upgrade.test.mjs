import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

test('Wealth replaces Money in the primary navigation without changing the route contract', () => {
  const nav = read('src/components/navigation/nav-items.tsx');
  assert.match(nav, /label: 'Wealth'/);
  assert.match(nav, /href: '\/finance'/);
  assert.doesNotMatch(nav, /label: 'Money'/);
});

test('adaptive scenes remain time-driven and Shanghai is the night master scene', () => {
  const config = read('src/config/experience.ts');
  for (const phase of ['morning', 'day', 'golden', 'evening', 'night']) {
    assert.match(config, new RegExp(`${phase}:`));
  }
  assert.match(config, /Pudong skyline at night from Huangpu River/);

  const background = read('src/components/layout/environment-background.tsx');
  assert.match(background, /environment\.phase/);
  assert.match(background, /pointermove/);

  const css = read('src/app/globals.css');
  assert.match(css, /environment-background__scene/);
  assert.match(css, /perspective: 1200px/);
  assert.match(css, /sceneBreath/);
});

test('Manrope and high-readability glass are applied globally', () => {
  const layout = read('src/app/layout.tsx');
  assert.match(layout, /Manrope/);
  const css = read('src/app/globals.css');
  assert.match(css, /--font-manrope/);
  assert.match(css, /backdrop-filter: blur\(16px\)/);
  assert.match(css, /font-variant-numeric: tabular-nums/);
});

test('Wealth ledger supports savings, debt, expected money and privacy-preserving intelligence', () => {
  assert.ok(existsSync(join(root, 'src/db/migrations/0003_wealth_intelligence.sql')));
  const migration = read('src/db/migrations/0003_wealth_intelligence.sql');
  for (const marker of [
    'wealth_debts',
    'wealth_expected_flows',
    'create_wealth_debt',
    'repay_wealth_debt',
    'confirm_expected_flow',
    'savings_release',
  ]) assert.match(migration, new RegExp(marker));

  const wealth = read('src/lib/wealth.ts');
  assert.match(wealth, /netPosition/);
  assert.match(wealth, /safeToSpend/);
  assert.match(wealth, /sanitizedWealthMetrics/);
  assert.match(wealth, /suggestCategory/);

  const ai = read('src/lib/ai/wealth-groq.ts');
  assert.match(ai, /sanitized aggregate metrics/);
  assert.match(ai, /Never invent currency amounts/);
});

test('NGN remains canonical while USD uses a current reference-rate API', () => {
  const config = read('src/config/experience.ts');
  assert.match(config, /canonicalCurrency: 'NGN'/);
  assert.match(config, /alternateCurrency: 'USD'/);

  assert.match(config, /open\.er-api\.com\/v6\/latest\/USD/);
  const rateRoute = read('src/app/api/exchange-rate/route.ts');
  assert.match(rateRoute, /rates\?\.NGN|conversion_rates\?\.NGN/);

  const currency = read('src/lib/wealth-currency.ts');
  assert.match(currency, /crystrack-wealth-display-currency-v1/);
  assert.match(currency, /crystrack-wealth-rate-v1/);
});

test('dashboard restores the approved command-centre structure with real components', () => {
  const dashboard = read('src/app/page.tsx');
  for (const label of [
    "Today&apos;s Tasks",
    'Goals Progress',
    'Assignments',
    'Wealth Overview',
    'AI Insight',
    'Upcoming Reminders',
    'Focus Timer',
  ]) assert.match(dashboard, new RegExp(label));

  assert.match(dashboard, /MiniCalendar/);
  assert.match(dashboard, /QuickCapture/);
  assert.match(dashboard, /dashboard-bottom-rail/);
});

test('Wealth page exposes currency switch, forecasting, spending patterns, debts and expected money', () => {
  const page = read('src/app/finance/page.tsx');
  for (const marker of [
    '₦ NGN',
    '$ USD',
    'Safe to spend',
    'Spending pattern',
    'Expected money',
    'Money owed',
    'Wealth Intelligence',
    'Savings goals',
  ]) assert.match(page, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
