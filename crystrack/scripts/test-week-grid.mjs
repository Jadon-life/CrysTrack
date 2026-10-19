/** Real normal-mode Chromium. Guarded synthetic local Docker data only. */
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
assert.ok(process.argv.slice(2).every((arg) => arg === '--baseline'));
const baseline = process.argv.includes('--baseline');
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
const day = '2026-10-22',
  step = (n) => {
    const d = new Date(day + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
const clock = (d) =>
  localSql(
    `CREATE OR REPLACE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT '${d}T12:00:00Z'::timestamptz $$`,
  );
const q = (s) => "'" + s.replaceAll("'", "''") + "'";
let server, browser, uid;
const output = ROOT + '/.preview-test/week-grid';
fs.mkdirSync(output, { recursive: true });
const evidence = {
  day,
  timezone: 'Africa/Lagos',
  checks: [],
  widths: [],
  externalRequestsBlocked: 0,
  browserErrors: [],
};
try {
  const email = `week-${randomUUID()}@example.invalid`,
    password = randomUUID() + 'aA1!';
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Synthetic Week Explorer' },
  });
  assert.equal(error, null);
  uid = data.user.id;
  localSql(
    `INSERT INTO profiles(user_id,timezone,display_name) VALUES('${uid}','Africa/Lagos','Synthetic Week Explorer') ON CONFLICT(user_id) DO UPDATE SET timezone='Africa/Lagos';`,
  );
  const owner = (expr) =>
    JSON.parse(
      localSql(
        `BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${uid}","role":"authenticated"}';SELECT ${expr};COMMIT;`,
      )
        .split('\n')
        .at(-1),
    );
  clock(step(-6));
  owner('daily_context()');
  owner('sep28_crystal_state()');
  const reading = randomUUID(),
    practice = randomUUID(),
    retired = randomUUID();
  for (const [id, title] of [
    [reading, 'Morning reading'],
    [practice, 'Practice problems'],
    [retired, 'Archived lab routine'],
  ])
    localSql(
      `INSERT INTO recurring_tasks(id,user_id,title,preferred_time) VALUES('${id}','${uid}',${q(title)},'10:00');INSERT INTO task_schedules(task_id,weekday) SELECT '${id}',generate_series(0,6);`,
    );
  for (let offset = -5; offset <= 0; offset++) {
    clock(step(offset));
    owner('daily_context()');
    if (offset < 0)
      owner(`daily_set_outcome('${step(offset)}','${reading}','completed',1,'${randomUUID()}')`);
    if (offset === -4)
      owner(`daily_set_outcome('${step(offset)}','${practice}','skipped',1,'${randomUUID()}')`);
    if (offset === -3) {
      localSql(
        `UPDATE daily_records SET evidence='incomplete' WHERE user_id='${uid}' AND day_key='${step(offset)}'`,
      );
      owner(`daily_retire_routine('${retired}')`);
    }
    if (offset === -1) localSql(`UPDATE recurring_tasks SET title='Reading practice' WHERE id='${reading}'`);
  }
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
    locale: 'en-GB',
    timezoneId: 'America/New_York',
    reducedMotion: 'reduce',
  });
  await context.route('**/*', (route) => {
    if (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)) return route.continue();
    evidence.externalRequestsBlocked++;
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => evidence.browserErrors.push(e.message));
  await page.clock.setSystemTime(new Date(day + 'T12:00:00Z'));
  await page.goto(origin + '/auth');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForURL(origin + '/');
  await page.goto(origin + '/tasks');
  await page.getByRole('heading', { name: 'Tasks', exact: true }).waitFor();
  await page.getByRole('checkbox', { name: /Complete Reading practice/ }).waitFor();
  if (baseline) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: output + '/before.png', fullPage: true });
    console.log('PASS: actual pre-Week-Grid Tasks screenshot captured.');
  } else {
    const grid = page.getByTestId('task-week-grid');
    const open = async () => {
      await page.getByRole('button', { name: 'Week grid', exact: true }).click();
      await grid.getByRole('table').waitFor();
    };
    const refresh = async () => {
      const response = page.waitForResponse(
        (r) => new URL(r.url()).pathname === '/api/tasks/week' && r.status() === 200,
      );
      await grid.getByRole('button', { name: 'Refresh week', exact: true }).click();
      await response;
      await grid.getByRole('table').waitFor();
    };
    const total = () => BigInt(owner('sep28_crystal_state()').total);
    const money = () =>
      localSql("SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY id)::text,'[]') FROM money_entries m");
    const moneyBefore = money();
    await open();
    const raw = await (await page.request.get(origin + '/api/tasks/week')).json();
    assert.equal(raw.context.day, day);
    assert.equal(raw.context.timezone, 'Africa/Lagos');
    assert.equal(raw.from, '2026-10-18');
    assert.equal(raw.days[1].evidence, 'incomplete');
    const row = (id) => raw.rows.find((r) => r.id === id);
    assert.equal(row(reading).cells[0].state, 'completed');
    assert.equal(row(practice).cells[0].state, 'skipped');
    assert.equal(row(practice).cells[2].state, 'missed');
    assert.equal(row(reading).cells[1].state, 'unverified');
    assert.equal(row(reading).cells[4].state, 'pending');
    assert.equal(row(reading).cells[5].state, 'planned');
    assert.equal(await grid.getByRole('columnheader').count(), 8);
    assert.equal(await grid.locator('th[aria-current="date"]').count(), 1);
    assert.equal(await grid.getByRole('button', { name: /Complete .* today/ }).count(), 2);
    // Hard delete only the synthetic definition; the verified durable name/outcome stays visible.
    localSql(`DELETE FROM recurring_tasks WHERE id='${retired}' AND user_id='${uid}'`);
    await refresh();
    await grid.getByRole('rowheader', { name: /Archived lab routine.*recorded name/ }).waitFor();
    evidence.checks.push(
      'Seven saved-zone columns: completed/skipped/missed/pending, partial unverified, planned future; deleted routine retains recorded name',
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: output + '/after-desktop.png', fullPage: true });
    const region = grid.getByRole('region');
    // Scoped automated WCAG checks plus real focus, scrolling, touch and reduced-motion checks.
    await page.addScriptTag({ path: ROOT + '/node_modules/axe-core/axe.min.js' });
    evidence.accessibility = [];
    for (const width of [375, 430, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 1050 });
      await region.scrollIntoViewIfNeeded();
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        'Page overflow ' + width,
      );
      const leftBefore = (await grid.getByRole('rowheader').first().boundingBox()).x;
      await region.evaluate((el) => {
        el.scrollLeft = 450;
      });
      const leftAfter = (await grid.getByRole('rowheader').first().boundingBox()).x;
      assert.ok(Math.abs(leftAfter - leftBefore) < 2, 'Sticky row label ' + width);
      await grid.getByRole('button', { name: 'Complete Reading practice today', exact: true }).focus();
      const target = await grid
          .getByRole('button', { name: 'Complete Reading practice today', exact: true })
          .boundingBox(),
        bounds = await region.boundingBox();
      assert.ok(target.width >= 40 && target.height >= 40);
      assert.ok(
        target.x >= bounds.x && target.x + target.width <= bounds.x + bounds.width + 1,
        'Focused action exposed ' + width,
      );
      const result = await page.evaluate(async () => {
        const report = await window.axe.run(document.querySelector('[data-testid="task-week-grid"]'), {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        });
        return {
          violations: report.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => n.target),
          })),
          manualReview: report.incomplete.map((v) => v.id),
        };
      });
      evidence.accessibility.push({ width, ...result });
      assert.deepEqual(result.violations, [], 'New grid axe violations ' + width);
      if (width === 375) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: output + '/after-mobile.png', fullPage: true });
        await region.screenshot({ path: output + '/mobile-scroll.png' });
      }
      evidence.widths.push(width);
    }
    await page.setViewportSize({ width: 1440, height: 1050 });
    await region.evaluate((el) => {
      el.scrollLeft = 0;
    });
    assert.equal(
      await grid.locator('..').evaluate((el) => getComputedStyle(el, '::before').animationName),
      'none',
    );
    const beforeTotal = total();
    await grid.getByRole('button', { name: 'Complete Reading practice today', exact: true }).focus();
    await page.keyboard.press('Enter');
    await grid
      .getByRole('button', { name: 'Undo completion for Reading practice today', exact: true })
      .waitFor();
    assert.equal(total(), beforeTotal + 5n);
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
      'Undo completion for Reading practice today',
    );
    await grid.getByRole('button', { name: 'Complete Practice problems today', exact: true }).click();
    await grid
      .getByRole('button', { name: 'Undo completion for Practice problems today', exact: true })
      .waitFor();
    assert.equal(total(), beforeTotal + 10n);
    evidence.checks.push(
      'Keyboard complete and multiple Today actions: +5 each; all done today adds no +50; focus restored after authoritative refresh',
    );
    await grid
      .getByRole('button', { name: 'Undo completion for Reading practice today', exact: true })
      .click();
    await grid.getByRole('button', { name: 'Complete Reading practice today', exact: true }).waitFor();
    assert.equal(total(), beforeTotal + 5n);
    await grid.getByRole('button', { name: 'Skip Reading practice today', exact: true }).click();
    await grid.getByRole('button', { name: 'Undo skip for Reading practice today', exact: true }).waitFor();
    await grid.getByRole('button', { name: 'Undo skip for Reading practice today', exact: true }).click();
    await grid.getByRole('button', { name: 'Complete Reading practice today', exact: true }).waitFor();
    let savedBody, resolveAbort, interceptError;
    const abortDone = new Promise((resolve) => {
      resolveAbort = resolve;
    });
    let intercepted = false;
    const completeURL = `**/api/tasks/${reading}/occurrences/${day}/toggle`;
    await page.route(completeURL, async (route) => {
      if (intercepted) return route.continue();
      intercepted = true;
      savedBody = route.request().postDataJSON();
      try {
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        await route.abort('failed');
      } catch (error) {
        interceptError = error;
      } finally {
        resolveAbort();
      }
    });
    await grid.getByRole('button', { name: 'Complete Reading practice today', exact: true }).click();
    await abortDone;
    if (interceptError) throw interceptError;
    await grid.getByRole('button', { name: 'Retry recorded action', exact: true }).waitFor();
    await page.unroute(completeURL);
    assert.equal(total(), beforeTotal + 10n);
    const retryRequest = page.waitForRequest(
      (r) =>
        r.method() === 'POST' &&
        new URL(r.url()).pathname === `/api/tasks/${reading}/occurrences/${day}/toggle`,
    );
    await grid.getByRole('button', { name: 'Retry recorded action', exact: true }).click();
    assert.deepEqual((await retryRequest).postDataJSON(), savedBody);
    await grid
      .getByRole('button', { name: 'Undo completion for Reading practice today', exact: true })
      .waitFor();
    assert.equal(total(), beforeTotal + 10n);
    assert.equal(
      localSql(
        `SELECT count(*) FROM daily_mutation_requests WHERE user_id='${uid}' AND request_id='${savedBody.requestId}'`,
      ),
      '1',
    );
    evidence.checks.push(
      'Undo/skip/unskip and commit-then-network-failure retry preserve exact requestId/revision; one ledger award and one receipt',
    );
    let conflictHandled = false;
    const practiceURL = `**/api/tasks/${practice}/occurrences/${day}/toggle`;
    await page.route(practiceURL, async (route) => {
      if (!conflictHandled) {
        conflictHandled = true;
        const body = route.request().postDataJSON();
        owner(
          `daily_set_outcome('${day}','${practice}','skipped',${body.expectedRevision},'${randomUUID()}')`,
        );
      }
      await route.continue();
    });
    await grid
      .getByRole('button', { name: 'Undo completion for Practice problems today', exact: true })
      .click();
    await grid.getByRole('button', { name: 'Undo skip for Practice problems today', exact: true }).waitFor();
    await page.unroute(practiceURL);
    assert.equal(await grid.getByRole('button', { name: 'Retry recorded action', exact: true }).count(), 0);
    assert.equal(total(), beforeTotal + 5n);
    evidence.checks.push(
      'Competing write returns 409; UI refreshes actual Skipped result and never blindly retries stale intent',
    );
    for (const deniedDay of [step(-1), step(1)]) {
      const response = await page.request.post(
        origin + `/api/tasks/${reading}/occurrences/${deniedDay}/toggle`,
        { data: { desiredStatus: 'completed', expectedRevision: 1, requestId: randomUUID() } },
      );
      assert.equal(response.status(), 409);
    }
    const weekURL = (url) => url.pathname === '/api/tasks/week';
    await page.route(weekURL, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":"Synthetic unavailable"}',
      }),
    );
    await grid.getByRole('button', { name: 'Refresh week', exact: true }).click();
    await grid.getByRole('alert').waitFor();
    assert.equal(await grid.getByRole('table').count(), 0);
    await page.unroute(weekURL);
    await refresh();
    evidence.checks.push(
      'Past/future writes denied; unavailable endpoint removes stale outcome claims and recovers on refresh',
    );
    await grid.getByRole('button', { name: 'Previous week', exact: true }).click();
    await grid.getByRole('caption').filter({ hasText: '11 October 2026' }).waitFor();
    const previous = await (await page.request.get(origin + '/api/tasks/week?from=2026-10-11')).json();
    assert.equal(previous.days[0].evidence, 'missing');
    assert.equal(previous.days[0].count, null);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: output + '/history-unverified.png', fullPage: true });
    await grid.getByRole('button', { name: 'This week', exact: true }).click();
    await grid.getByRole('caption').filter({ hasText: '18 October 2026' }).waitFor();
    // Extra synthetic future definitions exercise DOM/server pagination without inventing past outcomes.
    localSql(
      `INSERT INTO routine_schedule_versions(user_id,routine_key,version,effective_from,enabled,title,schedule,created_at) SELECT '${uid}',gen_random_uuid(),1,'${step(1)}',true,'Synthetic planned extra '||n,'[{"weekday":5},{"weekday":6}]',crystrack_daily.clock() FROM generate_series(1,31)n`,
    );
    await refresh();
    assert.equal(await grid.getByRole('rowheader').count(), 25);
    await grid.getByRole('button', { name: 'More routines', exact: true }).click();
    await grid.getByText('Page 2 · up to 25 routines · 52 past / 8 future weeks', { exact: true }).waitFor();
    assert.equal(await grid.getByRole('rowheader').count(), 9);
    await grid.getByRole('button', { name: 'Previous routines', exact: true }).click();
    await grid.getByText('Page 1 · up to 25 routines · 52 past / 8 future weeks', { exact: true }).waitFor();
    localSql(
      `UPDATE recurring_tasks SET description='Synthetic concurrent schedule change' WHERE id='${reading}'`,
    );
    await grid.getByRole('button', { name: 'More routines', exact: true }).click();
    await grid.getByText('Your week changed. We’re refreshing the first page.', { exact: true }).waitFor();
    await grid.getByRole('table').waitFor();
    assert.equal(await grid.getByRole('rowheader').count(), 25);
    await grid.getByRole('combobox', { name: 'Routine filter', exact: true }).selectOption('active');
    await grid.getByRole('table').waitFor();
    assert.equal(await grid.getByRole('rowheader').count(), 2);
    await grid.getByRole('combobox', { name: 'Routine filter', exact: true }).selectOption('history');
    await grid.getByRole('table').waitFor();
    assert.equal(await grid.getByRole('rowheader').count(), 3);
    evidence.checks.push(
      'Previous week unknown history, active/history filters, 34 routine paging and stale schedule cursor reset verified',
    );
    const ctx = owner('daily_context()');
    const transition = owner(`daily_request_timezone('UTC',${ctx.revision})`);
    localSql(
      `CREATE OR REPLACE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT '${transition.effective_at}'::timestamptz $$`,
    );
    await page.clock.setSystemTime(new Date(transition.effective_at));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await grid.getByRole('caption').filter({ hasText: 'UTC' }).waitFor();
    const moved = await (await page.request.get(origin + '/api/tasks/week')).json();
    assert.equal(moved.context.timezone, 'UTC');
    assert.equal(moved.context.day, transition.first_day);
    assert.equal(moved.days.find((d) => d.day === day).timezone, 'Africa/Lagos');
    assert.equal(money(), moneyBefore);
    evidence.checks.push(
      'Saved-zone midnight/timezone transition moves Today without rewriting old Lagos columns; finance rows unchanged',
    );
    assert.deepEqual(evidence.browserErrors, []);
    fs.writeFileSync(output + '/result.json', JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  }
} catch (error) {
  if (browser) {
    const page = browser.contexts()[0]?.pages()[0];
    if (page) await page.screenshot({ path: output + '/failure.png', fullPage: true }).catch(() => null);
  }
  throw error;
} finally {
  if (browser) await browser.close();
  if (server) {
    server.kill('SIGTERM');
    await Promise.race([once(server, 'exit'), new Promise((r) => setTimeout(r, 3000))]);
  }
  localSql(
    "CREATE OR REPLACE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT clock_timestamp() $$",
  );
  if (uid) await admin.auth.admin.deleteUser(uid);
}
