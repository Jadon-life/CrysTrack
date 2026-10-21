/** Normal-mode Chromium with guarded synthetic local Supabase ONLY. No target overrides. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { ROOT, readLocalKeys, localSql } from './local-supabase.mjs';
import { localEnvironment } from './local-supabase-policy.mjs';
assert.equal(process.argv.length, 2, 'No caller targets allowed');
const keys = readLocalKeys();
assert.equal(
  JSON.parse(fs.readFileSync(ROOT + '/.next/required-server-files.json')).config.env
    .NEXT_PUBLIC_CRYSTRACK_RUNTIME,
  'normal',
);
const blank = Object.fromEntries(
  fs
    .readFileSync(ROOT + '/.env.example', 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l))
    .map((l) => [l.split('=')[0], '']),
);
const env = {
  ...localEnvironment(process.env),
  ...blank,
  ...keys,
  VERCEL_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
};
const admin = createClient(keys.NEXT_PUBLIC_SUPABASE_URL, keys.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const q = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const scalar = (sql) => localSql(sql).split('\n').at(-1);
const output = ROOT + '/.preview-test/budgets';
fs.mkdirSync(output, { recursive: true });
const evidence = {
  checks: [],
  widths: [],
  accessibility: [],
  externalRequestsBlocked: 0,
  browserErrors: [],
  rate: 'Synthetic indicative quote: 1600 NGN/USD',
};
let server, browser, page, uid;
const clock = (instant) =>
  localSql(
    `CREATE OR REPLACE FUNCTION crystrack_budgets.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT ${q(instant)}::timestamptz $$`,
  );
try {
  clock('2026-10-19T12:00:00Z');
  const email = `budget-browser-${randomUUID()}@example.invalid`,
    password = randomUUID() + 'Aa1!';
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Synthetic Budget Explorer' },
  });
  assert.equal(error, null);
  uid = data.user.id;
  localSql(
    `INSERT INTO profiles(user_id,timezone,scheduling_timezone,display_name) VALUES('${uid}','Africa/Lagos','Africa/Lagos','Synthetic Budget Explorer');`,
  );
  const owner = (sql) =>
    localSql(
      `BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${uid}","role":"authenticated"}';${sql};COMMIT;`,
    );
  owner('SELECT sep28_crystal_state()');
  const foodId = randomUUID();
  owner(
    `INSERT INTO money_entries(id,user_id,type,flow_kind,amount,category,date) VALUES('${foodId}','${uid}','expense','expense',2500.25,'Food','2026-10-19T12:00Z'),('${randomUUID()}','${uid}','expense','expense',150,'Transport','2026-10-19T12:00Z'),('${randomUUID()}','${uid}','saving','saving',500,'Savings','2026-10-19T12:00Z');`,
  );
  owner(
    `INSERT INTO finance_targets(user_id,title,target_amount,current_amount) VALUES('${uid}','Synthetic fund',10000,500);INSERT INTO wealth_debts(user_id,kind,counterparty,original_amount,outstanding_amount) VALUES('${uid}','liability','Synthetic lender',400,300);INSERT INTO wealth_expected_flows(user_id,direction,title,amount_min) VALUES('${uid}','income','Synthetic income',5000);`,
  );
  const snapshot = () =>
    scalar(
      `SELECT jsonb_build_object('entries',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM money_entries t WHERE user_id='${uid}'),'targets',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM finance_targets t WHERE user_id='${uid}'),'debts',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM wealth_debts t WHERE user_id='${uid}'),'expected',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM wealth_expected_flows t WHERE user_id='${uid}'),'awards',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY kind,source_key),'[]') FROM sep28_crystal_awards t WHERE user_id='${uid}'),'events',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM sep28_crystal_events t WHERE user_id='${uid}'),'daily',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY day_key),'[]') FROM daily_records t WHERE user_id='${uid}'),'routines',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM daily_routine_records t WHERE user_id='${uid}'))::text`,
    );
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    { cwd: ROOT, env, stdio: 'ignore' },
  );
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(origin + '/auth');
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  assert.ok(ready);
  browser = await chromium.launch({
    executablePath: process.env.CRYSTRACK_CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    locale: 'en-GB',
    timezoneId: 'America/New_York',
    reducedMotion: 'reduce',
  });
  await context.route('**/*', (route) => {
    if (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname))
      return route.continue();
    evidence.externalRequestsBlocked++;
    return route.abort();
  });
  await context.route('**/api/exchange-rate', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        usdNgn: 1600,
        ngnUsd: 0.000625,
        provider: 'Synthetic local test quote',
        updatedAt: '2026-10-19T12:00:00Z',
      }),
    }),
  );
  page = await context.newPage();
  page.on('pageerror', (e) => evidence.browserErrors.push(e.message));
  await page.clock.setSystemTime(new Date('2026-10-19T12:00Z'));
  await page.goto(origin + '/auth');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForURL(origin + '/');
  await page.getByTestId('today-streak').waitFor();
  await page.goto(origin + '/finance');
  await page.getByRole('button', { name: 'Budgets', exact: true }).waitFor();
  const before = snapshot(),
    wealthBefore = await (await page.request.get(origin + '/api/wealth')).json();
  await page.screenshot({ path: output + '/overview-before.png', fullPage: true });
  await page.getByRole('button', { name: 'Budgets', exact: true }).click();
  const section = page.getByTestId('monthly-budgets'),
    food = section.getByRole('article', { name: 'Food budget', exact: true });
  await food.getByText('₦2,500.25', { exact: true }).waitFor();
  assert.equal(await food.getByText('No budget set', { exact: true }).count(), 1);
  assert.match(await section.textContent(), /October 2026 · Africa\/Lagos/);
  async function open(category = 'Food') {
    await section
      .getByRole('button', { name: new RegExp(`^(Set|Edit) ${category} budget$`) })
      .click();
    return page.getByRole('dialog', { name: 'Set ' + category + ' budget', exact: true });
  }
  async function save(amount, category = 'Food') {
    const dialog = await open(category);
    await dialog.getByLabel('Monthly limit (NGN)').fill(amount);
    await dialog.getByRole('button', { name: 'Save limit', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await section
      .getByRole('button', { name: 'Edit ' + category + ' budget', exact: true })
      .waitFor();
  }
  await save('2000.00');
  await page.waitForFunction(() => document.activeElement?.id === 'budget-action-Food');
  await food.getByText('125.01% used', { exact: false }).waitFor();
  assert.match(await food.textContent(), /−₦500.25/);
  assert.match(await food.textContent(), /Over this limit/);
  assert.equal(await food.getByRole('meter').getAttribute('aria-valuetext'), '125.01 percent used');
  const dialog = await open();
  await dialog.getByLabel('Monthly limit (NGN)').fill('1.001');
  await dialog.getByRole('button', { name: 'Save limit', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  assert.match(await dialog.getByRole('alert').textContent(), /two decimal/);
  await dialog.getByLabel('Monthly limit (NGN)').fill('3000.00');
  await dialog.getByRole('button', { name: 'Save limit', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await food.getByText('83.34% used', { exact: false }).waitFor();
  assert.match(await food.textContent(), /Approaching/);
  await save('2000.00');
  await food.getByText('125.01% used', { exact: false }).waitFor();
  evidence.checks.push(
    'Saved Lagos month despite New York browser; exact create/edit/over-limit/near-limit and precision validation; no budget is distinct from zero',
  );
  await page.getByRole('button', { name: '$ USD', exact: true }).click();
  await food.getByText('≈ $1.56', { exact: true }).waitFor();
  assert.match(await food.textContent(), /≈ \$1.25/);
  const usdDialog = await open();
  assert.equal(await usdDialog.getByLabel('Monthly limit (NGN)').inputValue(), '2000');
  await usdDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: '₦ NGN', exact: true }).click();
  await food.getByText('₦2,500.25', { exact: true }).waitFor();
  evidence.checks.push(
    'Indicative USD uses existing currency control/provider quote; editor and persisted limits remain canonical NGN',
  );
  await page.addScriptTag({ path: ROOT + '/node_modules/axe-core/axe.min.js' });
  for (const width of [375, 430, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1050 });
    await food.scrollIntoViewIfNeeded();
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'Document overflow ' + width,
    );
    for (const button of await food.getByRole('button').all()) {
      const box = await button.boundingBox();
      assert.ok(box && box.height >= 40 && box.width >= 40);
    }
    const a11y = await page.evaluate(async () => {
      const r = await window.axe.run('[data-testid="monthly-budgets"]', {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      });
      return {
        violations: r.violations.map((v) => ({ id: v.id, impact: v.impact })),
        manualReview: r.incomplete.map((v) => v.id),
        ariaReview: r.incomplete
          .filter((v) => v.id === 'aria-prohibited-attr')
          .flatMap((v) => v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary }))),
      };
    });
    assert.deepEqual(a11y.violations, [], 'New budgets axe violations ' + width);
    evidence.accessibility.push({ width, ...a11y });
    evidence.widths.push(width);
    if (width === 375) await page.screenshot({ path: output + '/mobile.png', fullPage: false });
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  await section.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: output + '/budgets-desktop.png', fullPage: true });
  const keyboardDialog = await open();
  await page.keyboard.press('Tab');
  assert.ok(await page.getByRole('dialog').evaluate((el) => el.contains(document.activeElement)));
  await page.keyboard.press('Escape');
  await keyboardDialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('aria-label') === 'Edit Food budget',
    null,
    { timeout: 5000 },
  );
  const rocker = page.getByRole('switch', { name: /appearance active/ });
  if ((await rocker.getAttribute('aria-label')) === 'Dark appearance active') await rocker.click();
  await page.getByRole('switch', { name: 'Light appearance active', exact: true }).waitFor();
  await page.clock.setSystemTime(new Date('2026-10-19T16:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => document.documentElement.dataset.phase === 'day');
  await page.waitForFunction(() => {
    const img = document.querySelector('.environment-stability-image');
    return img?.complete && img.naturalWidth > 0;
  });
  await section.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: output + '/budgets-light-bright.png', fullPage: true });
  // Actual computed CSS, conservatively composited over white (brightest backdrop).
  // This is a contrast calculation, not financial arithmetic.
  evidence.brightContrast = await page.evaluate(() => {
    const surface = document.querySelector('[data-testid="budget-reading-surface"]');
    const rgba = (s) => s.match(/[\d.]+/g).map(Number);
    const bg = rgba(getComputedStyle(surface).backgroundColor),
      a = bg[3] ?? 1;
    const backing = bg.slice(0, 3).map((v) => v * a + 255 * (1 - a));
    const lum = (rgb) =>
      rgb
        .map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    return ['h2', 'p', 'button'].map((selector) => {
      const fg = rgba(getComputedStyle(surface.querySelector(selector)).color),
        x = lum(fg),
        y = lum(backing);
      return { selector, ratio: (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) };
    });
  });
  assert.ok(
    evidence.brightContrast.every((c) => c.ratio >= 4.5),
    'New header contrast over brightest backdrop',
  );

  await rocker.click();
  await page.getByRole('switch', { name: 'Dark appearance active', exact: true }).waitFor();
  evidence.checks.push(
    'Five widths: no document overflow, >=40px controls, semantic meters/date/labels, scoped axe zero violations, keyboard modal containment/Escape/focus return, physical switch and bright scenic photo preserved',
  );
  // Commit then lose response. Wait for interception settlement before removing its handler.
  let captured;
  let settle;
  const settled = new Promise((r) => (settle = r));
  let interrupted = false;
  await page.route('**/api/wealth/budgets', async (route) => {
    if (route.request().method() !== 'POST' || interrupted) return route.continue();
    interrupted = true;
    captured = route.request().postDataJSON();
    try {
      const r = await route.fetch();
      assert.equal(r.status(), 200);
      await route.abort('failed');
    } finally {
      settle();
    }
  });
  await save('500.00', 'Transport');
  await settled;
  await page.unroute('**/api/wealth/budgets');
  await section.getByRole('button', { name: 'Retry budget change', exact: true }).waitFor();
  const persisted = scalar(
    `SELECT revision::text||':'||created_at::text FROM wealth_monthly_budgets WHERE user_id='${uid}' AND category='Transport'`,
  );
  await section.getByRole('button', { name: 'Retry budget change', exact: true }).click();
  await section
    .getByRole('button', { name: 'Retry budget change', exact: true })
    .waitFor({ state: 'hidden' });
  await section.getByRole('button', { name: 'Edit Transport budget', exact: true }).waitFor();
  assert.equal(
    scalar(
      `SELECT revision::text||':'||created_at::text FROM wealth_monthly_budgets WHERE user_id='${uid}' AND category='Transport'`,
    ),
    persisted,
  );
  assert.equal(
    scalar(
      `SELECT count(*) FROM crystrack_budgets.requests WHERE user_id='${uid}' AND request_id='${captured.requestId}'`,
    ),
    '1',
  );
  evidence.checks.push(
    'Committed-but-lost budget create response explicitly replays exact intent: one source, revision, receipt; no duplicate limit or shards',
  );
  const stale = await open();
  await stale.getByLabel('Monthly limit (NGN)').fill('1.00');
  owner(
    `SELECT wealth_budget_mutate('set','2026-10-01','Food','2200.00',3,'${randomUUID()}','Africa/Lagos')`,
  );
  await stale.getByRole('button', { name: 'Save limit', exact: true }).click();
  await stale.waitFor({ state: 'hidden' });
  await food.getByText('₦2,200', { exact: true }).waitFor();
  assert.match(await section.getByRole('alert').textContent(), /changed/);
  await food.getByRole('button', { name: 'Remove Food budget', exact: true }).click();
  let remove = page.getByRole('dialog', { name: 'Remove Food budget', exact: true });
  await remove.getByRole('button', { name: 'Remove limit', exact: true }).click();
  await remove.waitFor({ state: 'hidden' });
  await food.getByText('No budget set', { exact: true }).waitFor();
  assert.equal(
    scalar(
      `SELECT count(*) FROM wealth_monthly_budgets WHERE user_id='${uid}' AND category='Food'`,
    ),
    '1',
  );
  await save('2000.00');
  await food.getByText('125.01% used', { exact: false }).waitFor();
  for (const method of ['post', 'patch']) {
    const r = await page.request[method](origin + '/api/wealth/budgets', {
      data: {
        month: '2026-10-01',
        category: 'Food',
        limit: '1',
        revision: 6,
        requestId: randomUUID(),
        timezone: 'Africa/Lagos',
        user_id: uid,
        shards: 500,
        currency: 'USD',
      },
    });
    assert.equal(r.status(), 400);
  }
  const priorFinance = await (await page.request.get(origin + '/api/wealth')).json();
  assert.deepEqual(priorFinance, wealthBefore);
  assert.equal(snapshot(), before);
  evidence.checks.push(
    'Racing editor gets 409 and refreshes competing value; remove/recreate retains one revision identity; mass assignment rejected; ledger/targets/debts/expected flows/Wealth forecasts/crystals/daily facts unchanged byte-for-byte',
  );
  await section.getByRole('button', { name: 'Previous month', exact: true }).click();
  await section.getByText('September 2026 · Africa/Lagos', { exact: true }).waitFor();
  assert.equal(
    await section.getByRole('button', { name: 'Set Food budget', exact: true }).count(),
    0,
  );
  assert.equal(await food.getByText('No budget set', { exact: true }).count(), 1);
  await section.getByRole('button', { name: 'This month', exact: true }).click();
  await food.getByRole('button', { name: 'Edit Food budget', exact: true }).waitFor();
  await page.route('**/api/wealth/budgets**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"Synthetic unavailable"}',
    }),
  );
  await section.getByRole('button', { name: 'Refresh budgets', exact: true }).click();
  await section.getByRole('alert').waitFor();
  assert.equal(await section.getByRole('article').count(), 0);
  await page.unroute('**/api/wealth/budgets**');
  await section.getByRole('button', { name: 'Refresh budgets', exact: true }).click();
  await food.getByRole('button', { name: 'Edit Food budget', exact: true }).waitFor();
  // Authoritative underlying ledger changes are discovered on focus, never copied client totals.
  owner(`UPDATE money_entries SET category='Health' WHERE id='${foodId}'`);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await food.getByText('₦0', { exact: true }).waitFor();
  await section
    .getByRole('article', { name: 'Health budget', exact: true })
    .getByText('₦2,500.25', { exact: true })
    .waitFor();
  owner(`UPDATE money_entries SET category='Food' WHERE id='${foodId}'`);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await food.getByText('₦2,500.25', { exact: true }).waitFor();
  // A budget is guidance, never a finance write gate. Use the existing live form.
  await page.getByRole('button', { name: 'Money entry', exact: true }).click();
  const moneyForm = page.locator('form').filter({ has: page.getByLabel('Amount (NGN)', {exact:true}) });
  await moneyForm.locator('select').first().selectOption('expense');
  await moneyForm.locator('input[type=number]').fill('100.01');
  await moneyForm.locator('select').nth(1).selectOption('Food');
  await moneyForm.getByRole('button', { name: 'Save', exact: true }).click();
  await moneyForm.waitFor({ state: 'hidden' });
  await food.getByText('₦2,600.26', { exact: true }).waitFor();
  evidence.checks.push(
    'Existing Money entry UI still records a real expense above the limit; Budgets refreshes its complete aggregate after the parent ledger reload',
  );
  const boundaryEditor = await open('Housing');
  await boundaryEditor.getByLabel('Monthly limit (NGN)').fill('800.00');
  clock('2026-10-31T23:00:00Z');
  await page.clock.setSystemTime(new Date('2026-10-31T23:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await section.getByText('November 2026 · Africa/Lagos', { exact: true }).waitFor();
  await boundaryEditor.getByRole('button', { name: 'Save limit', exact: true }).click();
  await boundaryEditor.waitFor({ state: 'hidden' });
  await section.getByRole('alert').filter({ hasText: 'changed' }).waitFor();
  assert.equal(
    scalar(
      `SELECT count(*) FROM wealth_monthly_budgets WHERE user_id='${uid}' AND month='2026-11-01'`,
    ),
    '0',
    'open October editor must not silently retarget an unset November budget',
  );
  await food.getByText('No budget set', { exact: true }).waitFor();
  evidence.checks.push(
    'Past month stays read-only without backfill; failed read removes stale totals; tab focus discovers actual category edits; saved-zone midnight opens next month without carrying targets and an old editor cannot retarget the new month',
  );
  const secondEmail = `budget-other-${randomUUID()}@example.invalid`,
    secondPassword = randomUUID() + 'Aa1!';
  const second = await admin.auth.admin.createUser({
    email: secondEmail,
    password: secondPassword,
    email_confirm: true,
    user_metadata: { full_name: 'Other Synthetic Budget Explorer' },
  });
  assert.equal(second.error, null);
  localSql(
    `INSERT INTO profiles(user_id,timezone) VALUES('${second.data.user.id}','Africa/Lagos') ON CONFLICT(user_id) DO NOTHING`,
  );
  await page.getByRole('button', { name: 'Open profile menu' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL(origin + '/auth');
  assert.equal((await page.request.get(origin + '/api/wealth/budgets')).status(), 401);
  await page.locator('input[type=email]').fill(secondEmail);
  await page.locator('input[type=password]').fill(secondPassword);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForURL(origin + '/');
  await page.goto(origin + '/finance');
  await page.getByRole('button', { name: 'Budgets', exact: true }).click();
  await page
    .getByRole('article', { name: 'Food budget', exact: true })
    .getByText('No budget set', { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole('article', { name: 'Food budget', exact: true })
      .getByText('₦2,500.25', { exact: true })
      .count(),
    0,
  );
  evidence.checks.push(
    'Real local sign-out denies budget API; second owner sees no first-owner limits or spending',
  );
  assert.deepEqual(evidence.browserErrors, []);
  fs.writeFileSync(output + '/result.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (e) {
  if (page)
    await page.screenshot({ path: output + '/failure.png', fullPage: true }).catch(() => null);
  throw e;
} finally {
  if (browser) await browser.close();
  if (server) {
    server.kill('SIGTERM');
    await Promise.race([once(server, 'exit'), new Promise((r) => setTimeout(r, 3000))]);
  }
  clock(new Date().toISOString());
  localSql(
    "CREATE OR REPLACE FUNCTION crystrack_budgets.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT clock_timestamp() $$",
  );
  if (uid)
    localSql(
      `DELETE FROM money_entries WHERE user_id='${uid}';DELETE FROM finance_targets WHERE user_id='${uid}';DELETE FROM wealth_debts WHERE user_id='${uid}';DELETE FROM wealth_expected_flows WHERE user_id='${uid}'`,
    );
}
