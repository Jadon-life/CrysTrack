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
  CRON_SECRET: 'synthetic-bills-local-only',
  NEXT_TELEMETRY_DISABLED: '1',
};
const admin = createClient(keys.NEXT_PUBLIC_SUPABASE_URL, keys.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const q = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const scalar = (sql) => localSql(sql).split('\n').at(-1);
const output = ROOT + '/.preview-test/bills';
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
    `CREATE OR REPLACE FUNCTION crystrack_bills.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT ${q(instant)}::timestamptz $$`,
  );
try {
  clock('2026-10-19T12:00:00Z');
  const email = `bill-browser-${randomUUID()}@example.invalid`,
    password = randomUUID() + 'Aa1!';
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Synthetic Bills Explorer' },
  });
  assert.equal(error, null);
  uid = data.user.id;
  localSql(
    `INSERT INTO profiles(user_id,timezone,scheduling_timezone,display_name) VALUES('${uid}','Africa/Lagos','Africa/Lagos','Synthetic Bills Explorer');`,
  );
  const owner = (sql) =>
    localSql(
      `BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${uid}","role":"authenticated"}';${sql};COMMIT;`,
    );
  owner('SELECT sep28_crystal_state()');
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
  await page.getByRole('button', { name: 'Bills & subscriptions', exact: true }).click();
  const section = page.getByTestId('recurring-bills');
  await section.getByRole('button', { name: 'Add bill', exact: true }).waitFor();
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="recurring-bills"] button:last-child')?.disabled,
  );
  const tableCount = (t) => scalar(`SELECT count(*) FROM ${t} WHERE user_id='${uid}'`);
  const before = await (await page.request.get(origin + '/api/wealth')).json();
  async function add(title = 'Synthetic internet') {
    await section.getByRole('button', { name: 'Add bill', exact: true }).click();
    const d = page.getByRole('dialog', { name: 'Add bill', exact: true });
    await d.getByLabel('Bill title', { exact: true }).fill(title);
    await d.getByLabel('Expected amount (NGN)', { exact: true }).fill('100.01');
    await d.getByLabel('Category', { exact: true }).selectOption('Utilities');
    await d.getByLabel('First due date', { exact: true }).fill('2026-10-19');
    await d.getByRole('button', { name: 'Save bill', exact: true }).click();
    await d.waitFor({ state: 'hidden' });
    await section.getByRole('button', { name: 'Edit ' + title, exact: true }).waitFor();
  }
  await add();
  const card = section.getByRole('article', { name: 'Synthetic internet bill', exact: true });
  await card.getByText('Next due 2026-10-19', { exact: false }).waitFor();
  assert.equal(tableCount('money_entries'), '0');
  assert.equal(tableCount('wealth_expected_flows'), '0');
  assert.deepEqual(await (await page.request.get(origin + '/api/wealth')).json(), before);
  evidence.checks.push(
    'Creating plans does not affect balances, expected money or legacy forecasts',
  );
  await card.getByRole('button', { name: 'Edit Synthetic internet', exact: true }).click();
  let d = page.getByRole('dialog', { name: 'Edit bill', exact: true });
  await d.getByLabel('Expected amount (NGN)', { exact: true }).fill('120.03');
  await d.getByRole('button', { name: 'Save bill', exact: true }).click();
  await d.waitFor({ state: 'hidden' });
  await card.getByText('₦120.03', { exact: false }).waitFor();
  await card.getByRole('button', { name: 'Pause Synthetic internet', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Pause bill', exact: true }).click();
  await card.getByRole('button', { name: 'Resume Synthetic internet', exact: true }).waitFor();
  await card.getByRole('button', { name: 'Resume Synthetic internet', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Resume bill', exact: true }).click();
  await card.getByRole('button', { name: 'Pause Synthetic internet', exact: true }).waitFor();
  await card.getByRole('button', { name: 'Edit Synthetic internet', exact: true }).click();
  await page.keyboard.press('Tab');
  assert.ok(await page.getByRole('dialog').evaluate((el) => el.contains(document.activeElement)));
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('aria-label') === 'Edit Synthetic internet',
  );
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
    'Edit Synthetic internet',
  );
  evidence.checks.push(
    'Real create/edit/pause/resume; keyboard dialog focus containment and Escape restoration',
  );
  await page.addScriptTag({ path: ROOT + '/node_modules/axe-core/axe.min.js' });
  for (const width of [375, 430, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1050 });
    await section.scrollIntoViewIfNeeded();
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'overflow ' + width,
    );
    for (const b of await card.getByRole('button').all()) {
      const box = await b.boundingBox();
      assert.ok(box && box.width >= 40 && box.height >= 40);
    }
    const a11y = await page.evaluate(async () => {
      const r = await window.axe.run('[data-testid="recurring-bills"]', {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      });
      return {
        violations: r.violations.map((v) => ({ id: v.id, impact: v.impact })),
        manualReview: r.incomplete.map((v) => v.id),
      };
    });
    assert.deepEqual(a11y.violations, []);
    evidence.accessibility.push({ width, ...a11y });
    evidence.widths.push(width);
    await page.screenshot({ path: output + '/bills-' + width + '.png', fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  const rocker = page.getByRole('switch', { name: /appearance active/ });
  if ((await rocker.getAttribute('aria-label')) === 'Dark appearance active') await rocker.click();
  await page.getByRole('switch', { name: 'Light appearance active', exact: true }).waitFor();
  await page.clock.setSystemTime(new Date('2026-10-19T16:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => document.documentElement.dataset.phase === 'day');
  await page.waitForFunction(() => {
    const i = document.querySelector('.environment-stability-image');
    return i?.complete && i.naturalWidth > 0;
  });
  await card.getByRole('button', { name: 'Edit Synthetic internet', exact: true }).waitFor();
  await page.screenshot({ path: output + '/bills-light-bright.png', fullPage: true });
  evidence.brightContrast = await page.evaluate(() => {
    const surface = document.querySelector('[data-testid="bill-reading-surface"]');
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
  let captured,
    settle,
    interrupted = false;
  const settled = new Promise((r) => (settle = r));
  await page.route('**/api/wealth/bills', async (route) => {
    if (route.request().method() !== 'PATCH' || interrupted) return route.continue();
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
  await card.getByRole('button', { name: 'Mark Synthetic internet as paid', exact: true }).click();
  d = page.getByRole('dialog', { name: 'Confirm actual payment', exact: true });
  await d.getByLabel('Actual amount paid (NGN)', { exact: true }).fill('111.11');
  await d.getByRole('button', { name: 'Confirm paid expense', exact: true }).click();
  assert.equal(tableCount('money_entries'), '0', 'required explicit checkbox');
  await d.getByLabel('I have actually paid this bill', { exact: true }).check();
  await d.getByRole('button', { name: 'Confirm paid expense', exact: true }).click();
  await settled;
  await page.unroute('**/api/wealth/bills');
  await section.getByRole('button', { name: 'Retry exact bill action', exact: true }).waitFor();
  assert.equal(tableCount('money_entries'), '1');
  await section.getByRole('button', { name: 'Retry exact bill action', exact: true }).click();
  await section.getByText('Payment confirmed from its expense record.', { exact: false }).waitFor();
  assert.equal(tableCount('money_entries'), '1');
  assert.equal(tableCount('sep28_crystal_events'), '0');
  const replay = await page.request.patch(origin + '/api/wealth/bills', { data: captured });
  assert.equal(replay.status(), 200);
  assert.equal(tableCount('money_entries'), '1');
  await card.getByText('1 confirmed payments', { exact: false }).waitFor();
  await card
    .getByRole('button', { name: 'Due history: Synthetic internet', exact: true })
    .count()
    .then(async (n) => {
      if (n)
        await card
          .getByRole('button', { name: 'Due history: Synthetic internet', exact: true })
          .click();
    });
  await section.getByText('2026-10-19 · Paid ·', { exact: false }).waitFor();
  await page.screenshot({ path: output + '/payment-confirmed.png', fullPage: true });
  await page.getByRole('button', { name: 'Budgets', exact: true }).click();
  await page
    .getByRole('article', { name: 'Utilities budget', exact: true })
    .getByText('₦111.11', { exact: true })
    .waitFor();
  evidence.checks.push(
    'Actual amount differs from expected; required explicit confirmation; committed-response loss/exact retry/replay create one expense, budget spend and zero spending shards; real history proof',
  );
  await page.getByRole('button', { name: 'Bills & subscriptions', exact: true }).click();
  await card.getByRole('button', { name: 'Edit Synthetic internet', exact: true }).waitFor();
  const v = await (await page.request.get(origin + '/api/wealth/bills')).json(),
    b = v.items.find((i) => i.title === 'Synthetic internet');
  await card.getByRole('button', { name: 'Edit Synthetic internet', exact: true }).click();
  const second = await page.request.patch(origin + '/api/wealth/bills', {
    data: {
      id: b.id,
      revision: b.revision,
      action: 'pause',
      timezone: v.timezone,
      requestId: randomUUID(),
      fields: {},
    },
  });
  assert.equal(second.status(), 200);
  d = page.getByRole('dialog', { name: 'Edit bill', exact: true });
  await d.getByLabel('Bill title', { exact: true }).fill('Stale tab title');
  await d.getByRole('button', { name: 'Save bill', exact: true }).click();
  await section.getByRole('alert').waitFor();
  assert.match(await section.getByRole('alert').textContent(), /changed/);
  assert.equal(tableCount('money_entries'), '1');
  await card.getByRole('button', { name: 'Cancel Synthetic internet', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cancel bill permanently', exact: true })
    .click();
  await card.getByText('canceled', { exact: true }).waitFor();
  assert.equal(await card.getByRole('button', { name: /^(Edit|Resume|Mark)/ }).count(), 0);
  evidence.checks.push(
    'Second-tab update conflicts; terminal cancel keeps payment expense and exposes no reopen/payment controls',
  );
  await page.route('**/api/wealth/bills?**', (r) =>
    r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' }),
  );
  await section.getByRole('button', { name: 'Refresh bills', exact: true }).click();
  await section.getByRole('alert').waitFor();
  assert.equal(await section.getByText('Next 7 days · planned', { exact: true }).count(), 0);
  assert.equal(await section.getByRole('article').count(), 0);
  await page.unroute('**/api/wealth/bills?**');
  await section.getByRole('button', { name: 'Refresh bills', exact: true }).click();
  await card.waitFor();
  evidence.checks.push(
    'Unavailable reread removes stale totals/cards instead of claiming zero or paid',
  );
  await section.getByRole('button', { name: 'Add bill', exact: true }).click();
  d = page.getByRole('dialog', { name: 'Add bill', exact: true });
  await d.getByLabel('Bill title', { exact: true }).fill('Synthetic reminder');
  await d.getByLabel('Expected amount (NGN)', { exact: true }).fill('1.01');
  await d.getByLabel('First due date', { exact: true }).fill('2026-10-19');
  await d.getByRole('checkbox', { name: /Remind me at 09:00/ }).check();
  await d.getByRole('button', { name: 'Save bill', exact: true }).click();
  await d.waitFor({ state: 'hidden' });
  await section.getByRole('article', { name: 'Synthetic reminder bill', exact: true }).waitFor();
  localSql(
    `INSERT INTO user_preferences(user_id,dnd_enabled,default_reminder_channels) VALUES('${uid}',false,ARRAY['push','telegram']) ON CONFLICT(user_id) DO UPDATE SET dnd_enabled=false,default_reminder_channels=ARRAY['push','telegram']`,
  );
  assert.equal((await page.request.post(origin + '/api/reminders/dispatch')).status(), 401);
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await page.request.post(origin + '/api/reminders/dispatch', {
          headers: { 'x-cron-secret': 'synthetic-bills-local-only' },
        })
      ).status(),
      200,
    );
  assert.equal(
    scalar(
      `SELECT count(*) FROM reminder_deliveries WHERE user_id='${uid}' AND entity_type='bill'`,
    ),
    '1',
  );
  assert.equal(
    scalar(`SELECT status FROM reminder_deliveries WHERE user_id='${uid}' AND entity_type='bill'`),
    'failed',
  );
  assert.equal(
    scalar(
      `SELECT count(*) FROM activity_events WHERE user_id='${uid}' AND type='reminder_sent' AND entity_type='bill'`,
    ),
    '0',
  );
  assert.equal(tableCount('money_entries'), '1');
  evidence.checks.push(
    'Real local dispatcher rejects unauthenticated scheduler; missing Push/Telegram configuration records one failed attempt, no retry duplicate or false success/activity/payment',
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
  localSql(
    "CREATE OR REPLACE FUNCTION crystrack_bills.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT clock_timestamp() $$",
  );
  // Retain only synthetic immutable payment facts until the next guarded local reset.
}
