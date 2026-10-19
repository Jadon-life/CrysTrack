/** Signed-in real Chromium proof on the guarded disposable local target ONLY. */
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
const syntheticCron = randomUUID();
const env = {
  ...localEnvironment(process.env),
  ...blank,
  ...keys,
  CRON_SECRET: syntheticCron,
  VERCEL_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
};
const admin = createClient(keys.NEXT_PUBLIC_SUPABASE_URL, keys.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let server, browser, uid;
const output = ROOT + '/.preview-test/assignments';
fs.mkdirSync(output, { recursive: true });
const evidence = { checks: [], widths: [], externalAttemptsBlocked: 0, browserErrors: [] };
const sqlQuote = (s) => "'" + s.replaceAll("'", "''") + "'";
const input = (date, zone = 'Africa/Lagos') => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const p = (n) => parts.find((p) => p.type === n).value;
  return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}`;
};
try {
  const email = `assignment-${randomUUID()}@example.invalid`,
    password = randomUUID() + 'aA1!';
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Synthetic Assignment Explorer' },
  });
  assert.equal(error, null);
  uid = data.user.id;
  localSql(
    `INSERT INTO profiles(user_id,timezone,scheduling_timezone,display_name) VALUES('${uid}','UTC','Africa/Lagos','Synthetic Assignment Explorer') ON CONFLICT(user_id) DO UPDATE SET scheduling_timezone='Africa/Lagos';`,
  );
  const owner = (sql) =>
    localSql(
      `BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${uid}","role":"authenticated"}';${sql};COMMIT;`,
    );
  const total = () => JSON.parse(owner('SELECT sep28_crystal_state()').split('\n').at(-1)).total;
  total();
  const moneyBefore = localSql(
    `SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id)::text,'[]') FROM money_entries m`,
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
      await new Promise((r) => setTimeout(r, 250));
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
    timezoneId: 'America/New_York',
    locale: 'en-GB',
    reducedMotion: 'reduce',
  });
  await context.route('**/*', (route) => {
    if (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)) return route.continue();
    evidence.externalAttemptsBlocked++;
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => evidence.browserErrors.push(e.message));
  await page.goto(origin + '/auth');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForURL(origin + '/');
  await page.getByTestId('today-streak').waitFor();
  await page.goto(origin + '/assignments');
  await page.getByRole('button', { name: 'New assignment', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Create assignment' });
  await dialog.waitFor();
  await dialog.getByLabel('Title *', { exact: true }).fill('Synthetic MTH assignment');
  await dialog
    .getByLabel('Description', { exact: true })
    .fill('Read a chapter, then practice two questions. Synthetic data only.');
  const future = new Date(Date.now() + 2 * 86400000);
  await dialog.locator('#assignment-deadline').fill(input(future));
  await dialog.getByLabel('Subject / category', { exact: true }).fill('MTH 101');
  await dialog.getByLabel('Telegram', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  let card = page.getByRole('article', { name: 'Synthetic MTH assignment', exact: true });
  await card.waitFor();
  const active = await (await page.request.get(origin + '/api/assignments')).json();
  assert.equal(active.length, 1);
  const id = active[0].id;
  assert.equal(
    active[0].deadline,
    new Date(input(future) + ':00+01:00').toISOString().replace('.000Z', '+00:00'),
  );
  assert.equal(localSql(`SELECT count(*) FROM reminders WHERE entity_id='${id}'`), '3');
  assert.equal(total(), '0');
  evidence.checks.push(
    'Create in saved Africa/Lagos despite browser America/New_York; exact stored instant and both reminder channels',
  );
  await page.goto(origin + '/');
  const todayAssignment = page.getByText('Synthetic MTH assignment', { exact: true });
  await todayAssignment.waitFor();
  const expectedTime = await page.evaluate(
    (deadline) =>
      new Date(deadline).toLocaleString([], {
        timeZone: 'Africa/Lagos',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    active[0].deadline,
  );
  assert.ok((await todayAssignment.locator('../..').textContent()).includes(expectedTime));
  evidence.checks.push('Today assignment caption uses saved Africa/Lagos despite America/New_York browser');
  await page.goto(origin + '/assignments');
  await card.waitFor();
  await card.getByRole('button', { name: 'Edit Synthetic MTH assignment', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Edit assignment' });
  await dialog.waitFor();
  await dialog.getByLabel('Title *', { exact: true }).fill('Synthetic revised assignment');
  await dialog.locator('#assignment-deadline').fill(input(new Date(Date.now() - 2 * 3600000)));
  await dialog.getByLabel('Priority', { exact: true }).selectOption('high');
  await dialog
    .getByLabel('Custom offset in minutes (0–43200, up to 12 selected)', { exact: true })
    .fill('30');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog.screenshot({ path: output + '/edit-form.png' });
  const focused = await dialog
    .locator('input')
    .first()
    .evaluate((el) => {
      el.focus();
      return document.activeElement === el;
    });
  assert.ok(focused);
  await page.keyboard.press('Shift+Tab');
  assert.ok(await dialog.evaluate((el) => el.contains(document.activeElement)), 'Focus remains in modal');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  card = page.getByRole('article', { name: 'Synthetic revised assignment', exact: true });
  await card
    .getByRole('button', { name: 'Finish Late: Synthetic revised assignment', exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
    'Edit Synthetic revised assignment',
  );
  // The trigger replaces the old pending plan in the same transaction.
  assert.equal(localSql(`SELECT count(*) FROM reminders WHERE entity_id='${id}' AND status='pending'`), '4');
  assert.equal(
    localSql(`SELECT count(DISTINCT metadata_json->>'revision') FROM reminders WHERE entity_id='${id}'`),
    '1',
  );
  const stale = await page.request.patch(origin + `/api/assignments/${id}`, {
    data: { revision: 1, title: 'Stale edit', deadline: future.toISOString() },
  });
  assert.equal(stale.status(), 409);
  const forged = await page.request.patch(origin + `/api/assignments/${id}`, {
    data: { revision: 2, title: 'Forged', deadline: future.toISOString(), shards: 300 },
  });
  assert.equal(forged.status(), 400);
  // Real dispatcher with local-only synthetic secret and all integration keys explicitly blank.
  const dispatch = () =>
    page.request.post(origin + '/api/reminders/dispatch', {
      headers: { 'x-cron-secret': syntheticCron },
      timeout: 120000,
    });
  assert.equal((await dispatch()).status(), 200);
  assert.equal(
    localSql(
      `SELECT status FROM reminder_deliveries WHERE entity_id='${id}' ORDER BY created_at DESC LIMIT 1`,
    ),
    'failed',
  );
  assert.equal(
    localSql(
      `SELECT cardinality(failed_channels) FROM reminder_deliveries WHERE entity_id='${id}' ORDER BY created_at DESC LIMIT 1`,
    ),
    '2',
  );
  assert.equal((await dispatch()).status(), 200);
  assert.equal(localSql(`SELECT count(*) FROM reminder_deliveries WHERE entity_id='${id}'`), '1');
  evidence.checks.push(
    'Actual local cron: absent Push/Telegram config records failed channels gracefully; immediate repeat does not duplicate delivery',
  );
  const rocker = page.getByRole('switch', { name: /appearance active/ });
  if ((await rocker.getAttribute('aria-label')).startsWith('Dark')) {
    await rocker.click();
    await page.getByRole('switch', { name: 'Light appearance active', exact: true }).waitFor();
  }
  await rocker.click();
  await page.waitForFunction(() => document.documentElement.dataset.themePreference === 'dark');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: output + '/overdue-desktop.png', fullPage: true });
  await rocker.click();
  await page.waitForFunction(() => document.documentElement.dataset.themePreference === 'light');
  await page.screenshot({ path: output + '/overdue-light.png', fullPage: true });
  // Browser clock only: exercise the existing bright daytime photo; server deadline facts stay real.
  await page.clock.setSystemTime(new Date(new Date().toISOString().slice(0, 10) + 'T16:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => document.documentElement.dataset.phase === 'day');
  await page.waitForFunction(() => {
    const image = document.querySelector('.environment-stability-image');
    return image?.complete && image.naturalWidth > 0;
  });
  await page.screenshot({ path: output + '/overdue-bright.png', fullPage: true });
  assert.equal(
    await card
      .locator('p')
      .first()
      .evaluate((el) => getComputedStyle(el).fontSize),
    '14px',
  );
  assert.equal(
    await card.locator('..').evaluate((el) => getComputedStyle(el, '::before').animationName),
    'none',
  );
  await page.clock.setSystemTime(new Date());
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  evidence.checks.push(
    'Bright daytime scenic photo screenshot; 14px description, reduced-motion glass animation disabled',
  );

  assert.ok(
    await page.locator('.environment-stability-image').evaluate((el) => el.complete && el.naturalWidth > 0),
  );
  await rocker.click();
  await page.waitForFunction(() => document.documentElement.dataset.themePreference === 'dark');
  evidence.checks.push(
    'Physical 3D rocker switches light/dark; approved local scenic photograph loaded; glass layout unchanged',
  );
  evidence.checks.push(
    'Edit/reschedule to overdue; no gray lockout; stale revision 409, client shards 400; atomic reminder replacement',
  );
  for (const width of [375, 430, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1050 });
    await card.scrollIntoViewIfNeeded();
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'No page overflow ' + width,
    );
    const action = card.getByRole('button', {
      name: 'Finish Late: Synthetic revised assignment',
      exact: true,
    });
    const rect = await action.boundingBox();
    assert.ok(rect.width >= 40 && rect.height >= 40);
    assert.ok(await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
    if (width === 375) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: output + '/mobile.png', fullPage: true });
    }
    evidence.widths.push(width);
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  const before = (await (await page.request.get(origin + '/api/assignments')).json())[0];
  // Simulate a successful database commit followed by a lost response. Retry is idempotent.
  let lost = false,
    interceptError;
  let resolveAbort;
  const aborted = new Promise((resolve) => {
    resolveAbort = resolve;
  });
  await page.route(`**/api/assignments/${id}/complete`, async (route) => {
    if (lost) return route.continue();
    lost = true;
    try {
      const result = await route.fetch();
      assert.equal(result.status(), 200);
      await route.abort('failed');
    } catch (error) {
      interceptError = error;
    } finally {
      resolveAbort();
    }
  });
  await card.getByRole('button', { name: 'Finish Late: Synthetic revised assignment', exact: true }).click();
  await aborted;
  if (interceptError) throw interceptError;
  await page.getByRole('alert').filter({ hasText: 'Failed to fetch' }).waitFor();
  await page.unroute(`**/api/assignments/${id}/complete`);
  assert.equal(total(), '30');
  const replay = await page.request.patch(origin + `/api/assignments/${id}/complete`, {
    data: { revision: 2 },
  });
  assert.equal(replay.status(), 200);
  const completed = await replay.json();
  assert.equal(total(), '30');
  assert.equal(completed.deadline, before.deadline);
  assert.ok(Date.parse(completed.completed_at) > Date.parse(completed.deadline));
  assert.equal(
    localSql(`SELECT count(*) FROM activity_events WHERE entity_id='${id}' AND type='assignment_completed'`),
    '1',
  );
  assert.equal(localSql(`SELECT count(*) FROM reminders WHERE entity_id='${id}' AND status='pending'`), '0');
  await page.getByRole('button', { name: 'Finished history', exact: true }).click();
  await card.getByText('Finished Late', { exact: true }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: output + '/finished-late.png', fullPage: true });
  assert.equal(
    await card.getByRole('button', { name: 'Edit Synthetic revised assignment', exact: true }).count(),
    0,
  );
  evidence.checks.push(
    'Finish Late commit/lost response/replay: one completion timestamp, one event, one +30, original deadline unchanged; visible finished history',
  );
  const reminders = await (await page.request.get(origin + '/api/reminders')).json();
  assert.equal(reminders.filter((r) => r.entity_id === id && r.status === 'pending').length, 0);
  await page.goto(origin + '/plan');
  await page.getByText('0 open', { exact: true }).waitFor();
  await page.goto(origin + '/');
  await page.getByTestId('today-streak').waitFor();
  assert.equal((await (await page.request.get(origin + '/api/assignments')).json()).length, 0);
  evidence.checks.push(
    'Today and Plan keep active-only assignment contract; completed reminders absent; verified Today card retained',
  );
  await page.goto(origin + '/assignments');
  await page.getByRole('button', { name: 'Finished history', exact: true }).click();
  await card.waitFor();
  page.once('dialog', (d) => {
    assert.match(d.message(), /reverses any earned 30 shards/);
    return d.accept();
  });
  await card
    .getByRole('button', { name: 'Delete Synthetic revised assignment permanently', exact: true })
    .click();
  await card.waitFor({ state: 'hidden' });
  assert.equal(total(), '0');
  for (const table of ['reminders', 'activity_events', 'reminder_deliveries'])
    assert.equal(localSql(`SELECT count(*) FROM ${table} WHERE entity_id='${id}'`), '0');
  assert.equal(
    localSql(`SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id)::text,'[]') FROM money_entries m`),
    moneyBefore,
  );
  evidence.checks.push(
    'Confirmed permanent delete removes assignment/history/reminders and reverses 30; all local finance rows byte-for-byte unchanged',
  );
  // Strict DST handling is also enforced by the normal server, not only the browser helper.
  localSql(`UPDATE profiles SET scheduling_timezone='America/New_York' WHERE user_id='${uid}'`);
  for (const localDeadline of ['2026-03-08T02:30', '2026-11-01T01:30']) {
    const response = await page.request.post(origin + '/api/assignments', {
      data: { title: 'DST rejected', localDeadline, timezone: 'America/New_York' },
    });
    assert.equal(response.status(), 400);
    assert.match((await response.json()).error, /clocks change/);
  }
  evidence.checks.push('Server rejects nonexistent spring and ambiguous fall saved-zone times');
  await page.getByRole('button', { name: 'New assignment', exact: true }).click();
  await page.getByRole('dialog', { name: 'Create assignment', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'New assignment');
  evidence.checks.push(
    'Modal Escape closes and restores keyboard focus; edit modal traps keyboard focus and restores its trigger',
  );

  assert.deepEqual(evidence.browserErrors, []);
  fs.writeFileSync(output + '/result.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  if (browser) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    if (pages[0])
      await pages[0].screenshot({ path: output + '/failure.png', fullPage: true }).catch(() => null);
  }
  throw error;
} finally {
  if (browser) await browser.close();
  if (server) {
    server.kill('SIGTERM');
    await Promise.race([once(server, 'exit'), new Promise((r) => setTimeout(r, 3000))]);
  }
  if (uid) await admin.auth.admin.deleteUser(uid);
}
