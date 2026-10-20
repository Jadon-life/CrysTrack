/** Signed-in Chromium + real disposable local Auth/RLS; provider HTTP is replaced only by an explicit Node preload. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { ROOT, readLocalKeys, localSql } from './local-supabase.mjs';
import { localEnvironment } from './local-supabase-policy.mjs';
assert.equal(process.argv.length, 2, 'No caller-supplied target/credentials/URL');
assert.equal(
  JSON.parse(fs.readFileSync(ROOT + '/.next/required-server-files.json')).config.env
    .NEXT_PUBLIC_CRYSTRACK_RUNTIME,
  'normal',
);
const keys = readLocalKeys(),
  folder = ROOT + '/.preview-test/ai-privacy';
fs.mkdirSync(folder, { recursive: true });
for (const name of fs.readdirSync(folder))
  if (name.endsWith('.jpg') || name === 'result.json') fs.unlinkSync(path.join(folder, name));
fs.writeFileSync(folder + '/control.json', '{"mode":"success"}', { mode: 0o600 });
fs.writeFileSync(folder + '/provider-events.ndjson', '', { mode: 0o600 });
const mode = (m) => fs.writeFileSync(folder + '/control.json', JSON.stringify({ mode: m }));
const events = () =>
  fs
    .readFileSync(folder + '/provider-events.ndjson', 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
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
  CRYSTRACK_TEST_PROVIDER_STUB: 'ISSUE41-SYNTHETIC-ONLY',
};
const admin = createClient(keys.NEXT_PUBLIC_SUPABASE_URL, keys.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const q = (s) => "'" + String(s).replaceAll("'", "''") + "'",
  scalar = (s) => localSql(s).split('\n').at(-1),
  role = (u, s) =>
    localSql(
      `BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${s};COMMIT`,
    );
const evidence = {
  widths: [],
  checks: [],
  accessibility: [],
  hashes: [],
  modelCalls: 0,
  realProviderCalls: 0,
  browserErrors: [],
  externalRequestsBlocked: 0,
};
let browser, page;
const servers = [];
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
const prior = new Date(today + 'T12:00:00Z');
prior.setUTCDate(prior.getUTCDate() - 6);
async function fixture(label = 'Privacy Explorer', finance = true) {
  const email = `ai-privacy-${randomUUID()}@example.invalid`,
    password = randomUUID() + 'Aa1!';
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Synthetic ' + label },
  });
  assert.equal(created.error, null);
  const id = created.data.user.id,
    goal = randomUUID(),
    legacy = randomUUID(),
    checkin = randomUUID();
  localSql(
    `INSERT INTO profiles(user_id,timezone,scheduling_timezone,display_name)VALUES('${id}','Africa/Lagos','Africa/Lagos','Synthetic ${label}');INSERT INTO goals(id,user_id,title,description,status,progress_mode,measurable,starting_value,progress_value,target_value,ai_coaching,checkin_config)VALUES('${goal}','${id}','PRIVATE_GOAL_IDENTITY','PRIVATE_GOAL_NOTES','active','percentage',true,0,20,100,true,'{"frequency":"daily"}');INSERT INTO goal_checkins(id,user_id,goal_id,response_text,ai_analysis)VALUES('${checkin}','${id}','${goal}','PRIVATE_REFLECTION','{"status":"on_track","summary":"PRIVATE_OLD_GOAL_INSIGHT"}');INSERT INTO goal_insights(goal_id,summary)VALUES('${goal}','PRIVATE_OLD_GOAL_INSIGHT');INSERT INTO ai_conversations(id,user_id,title)VALUES('${legacy}','${id}','Synthetic saved local conversation');INSERT INTO ai_messages(user_id,conversation_id,role,content)VALUES('${id}','${legacy}','assistant','PRIVATE_LEGACY_FINANCE');INSERT INTO ai_domain_insights(user_id,domain,data_fingerprint,insight,model)VALUES('${id}','overview','old-policy','{"headline":"PRIVATE_OLD_DOMAIN","summary":"PRIVATE_OLD_DOMAIN","observations":["PRIVATE_OLD_DOMAIN"],"actions":[],"risk_level":"low","confidence":"low"}','synthetic-legacy')`,
  );
  role(id, 'SELECT daily_context();SELECT sep28_crystal_state()');
  if (finance)
    role(
      id,
      `INSERT INTO money_entries(user_id,type,flow_kind,amount,source,category,date)VALUES('${id}','income','income',40000,'PRIVATE_MERCHANT','Other',now()),('${id}','saving','saving',5000,'PRIVATE_SAVINGS_NOTE','Savings',now()),('${id}','expense','expense',1250.25,'PRIVATE_ACCOUNT_REFERENCE','Food',now())`,
    );
  const routine = randomUUID(),
    weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Lagos',
      weekday: 'short',
    }).format(new Date()),
    day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
  role(
    id,
    `INSERT INTO recurring_tasks(id,user_id,title,preferred_time)VALUES('${routine}','${id}','Synthetic private routine','10:00');INSERT INTO task_schedules(task_id,weekday)VALUES('${routine}',${day});SELECT daily_context();SELECT daily_read_window('${prior.toISOString().slice(0, 10)}','${today}')`,
  );
  return { id, email, password, goal, legacy, checkin };
}
function snapshot(owners) {
  const tables = [
    'money_entries',
    'finance_targets',
    'wealth_debts',
    'wealth_expected_flows',
    'wealth_monthly_budgets',
    'wealth_recurring_bills',
    'wealth_bill_occurrences',
    'wealth_csv_batches',
    'wealth_csv_rows',
    'sep28_crystal_awards',
    'sep28_crystal_events',
    'sep28_crystal_preferences',
    'daily_records',
    'daily_tracking_states',
    'daily_routine_records',
    'daily_notes',
    'routine_schedule_versions',
    'recurring_tasks',
    'goals',
    'goal_checkins',
  ];
  return createHash('sha256')
    .update(
      scalar(
        'SELECT jsonb_build_object(' +
          tables
            .map((t) => {
              const row = t === 'goal_checkins' ? "(to_jsonb(x)-'ai_analysis')" : 'to_jsonb(x)';
              return (
                q(t) +
                `,(SELECT coalesce(jsonb_agg(${row} ORDER BY ${row}::text),'[]') FROM ${t} x WHERE user_id IN(${owners.map(q).join(',')}))`
              );
            })
            .join(',') +
          ')::text',
      ),
    )
    .digest('hex');
}
async function server(configured) {
  const sock = net.createServer();
  sock.listen(0, '127.0.0.1');
  await once(sock, 'listening');
  const port = sock.address().port;
  await new Promise((r) => sock.close(r));
  const s = spawn(
    process.execPath,
    [
      '--import',
      pathToFileURL(ROOT + '/scripts/fixtures/ai-provider-stub.mjs').href,
      'node_modules/next/dist/bin/next',
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    {
      cwd: ROOT,
      env: { ...env, OPENROUTER_API_KEY: configured ? 'synthetic-issue41-not-a-provider-key' : '' },
      stdio: 'ignore',
    },
  );
  servers.push(s);
  const origin = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(origin + '/auth');
      if (r.ok) return origin;
    } catch {}
    if (s.exitCode != null) throw new Error('Guarded local server failed to start');
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Local readiness failed');
}
async function context(width) {
  const c = await browser.newContext({
    viewport: { width, height: 900 },
    locale: 'en-GB',
    timezoneId: 'America/New_York',
    reducedMotion: 'reduce',
  });
  await c.route('**/*', (r) => {
    if (['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname))
      return r.continue();
    evidence.externalRequestsBlocked++;
    return r.abort();
  });
  const p = await c.newPage();
  p.on('pageerror', (e) => evidence.browserErrors.push(e.message));
  return { context: c, page: p };
}
async function login(origin, u) {
  await page.goto(origin + '/auth');
  await page.locator('input[type=email]').fill(u.email);
  await page.locator('input[type=password]').fill(u.password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForURL(origin + '/');
  await page.getByTestId('today-streak').waitFor();
}
async function settings(origin) {
  await page.goto(origin + '/settings#ai-privacy');
  await page.getByTestId('ai-privacy-controls').waitFor();
  await page.waitForFunction(
    () => !document.querySelector('[role="switch"][aria-label="Use external AI"]')?.disabled,
  );
}
async function theme(light) {
  const sw = page.getByRole('switch', { name: /appearance active/ });
  if (((await sw.getAttribute('aria-label')) === 'Light appearance active') !== light)
    await sw.click();
  await page
    .getByRole('switch', {
      name: light ? 'Light appearance active' : 'Dark appearance active',
      exact: true,
    })
    .waitFor();
}
async function shot(name, full = true) {
  if (full) await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: folder + '/' + name + '.jpg',
    type: 'jpeg',
    quality: 78,
    fullPage: full,
  });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'No page overflow ' + name,
  );
}
async function axe(selector, width, label) {
  await page.addScriptTag({ path: ROOT + '/node_modules/axe-core/axe.min.js' });
  const violations = await page.evaluate(
    async (s) =>
      (
        await window.axe.run(s, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        })
      ).violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
    selector,
  );
  assert.deepEqual(violations, []);
  const sizes = await page.locator(selector + ' button').evaluateAll((els) =>
    els
      .filter((e) => !e.disabled && e.getBoundingClientRect().height)
      .map((e) => ({
        name: e.getAttribute('aria-label') || e.textContent.trim(),
        width: e.getBoundingClientRect().width,
        height: e.getBoundingClientRect().height,
      })),
  );
  assert.ok(
    sizes.every((s) => s.width >= 40 && s.height >= 40),
    JSON.stringify(sizes),
  );
  const contrasts = await page.evaluate((selector) => {
    const rgba = (value) => {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const x = c.getContext('2d');
      x.clearRect(0, 0, 1, 1);
      x.fillStyle = value;
      x.fillRect(0, 0, 1, 1);
      return Array.from(x.getImageData(0, 0, 1, 1).data).map((v, i) => (i === 3 ? v / 255 : v));
    };
    const over = (a, b) => a.slice(0, 3).map((v, i) => v * a[3] + b[i] * (1 - a[3]));
    const lum = (a) =>
      a
        .map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        })
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const root = document.querySelector(selector),
      background = over(rgba(getComputedStyle(root).backgroundColor), [255, 255, 255]);
    return [...root.querySelectorAll('p,label,[role="switch"]')]
      .filter((n) => n.getBoundingClientRect().height && !n.disabled)
      .map((n) => {
        const fg = over(rgba(getComputedStyle(n).color), background),
          l = [lum(fg), lum(background)].sort((a, b) => b - a);
        return { tag: n.tagName, contrast: (l[0] + 0.05) / (l[1] + 0.05) };
      });
  }, selector);
  assert.ok(
    contrasts.every((c) => c.contrast >= 4.5),
    'Conservative reading-surface contrast ' + JSON.stringify(contrasts),
  );
  evidence.accessibility.push({ width, label, violations, controls: sizes, contrasts });
}
async function confirmScope(kind) {
  const button = page.getByRole('switch', {
    name: kind === 'ai' ? 'Use external AI' : 'Include my Wealth data',
    exact: true,
  });
  await button.focus();
  await page.keyboard.press('Space');
  const dialog = page.getByRole('dialog', {
    name: kind === 'ai' ? 'Enable external AI?' : 'Allow Wealth context?',
    exact: true,
  });
  await dialog.waitFor();
  assert.equal(
    await dialog.getByRole('button', { name: 'Confirm permission', exact: true }).isDisabled(),
    true,
  );
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Confirm permission', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(
    (name) =>
      document
        .querySelector('[role="switch"][aria-label="' + name + '"]')
        ?.getAttribute('aria-checked') === 'true',
    kind === 'ai' ? 'Use external AI' : 'Include my Wealth data',
  );
}
async function until(check, label) {
  for (let i = 0; i < 150; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Timed out: ' + label);
}
async function privacy(origin) {
  const r = await page.request.get(origin + '/api/ai/privacy');
  assert.equal(r.status(), 200);
  return r.json();
}
try {
  browser = await chromium.launch({
    executablePath: process.env.CRYSTRACK_CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  const origin = await server(true),
    unconfigured = await server(false);
  for (const width of [375, 430, 768, 1280, 1440]) {
    const a = await fixture(),
      b = await fixture('Other Owner', false),
      before = snapshot([a.id, b.id]);
    const holder = await context(width);
    page = holder.page;
    await login(origin, a);
    for (const light of [false, true]) {
      const label = light ? 'light' : 'dark';
      await settings(origin);
      await theme(light);
      let p = await privacy(origin);
      if (p.enabled) {
        await page.getByRole('switch', { name: 'Use external AI', exact: true }).click();
        await page.waitForFunction(
          () =>
            document
              .querySelector('[role="switch"][aria-label="Use external AI"]')
              ?.getAttribute('aria-checked') === 'false',
        );
      }
      await shot(`off-${label}-${width}`);
      await axe('[data-testid="ai-privacy-controls"]', width, 'off ' + label);
      const disclosure = page.locator('summary').filter({ hasText: 'How context and providers work' });
      await disclosure.focus();
      await page.keyboard.press('Enter');
      assert.equal(await disclosure.evaluate((el) => el.parentElement.open), true);
      await shot(`disclosure-${label}-${width}`);
      await axe('[data-testid="ai-privacy-controls"]', width, 'disclosure ' + label);
      await page.keyboard.press('Enter');
      assert.equal(await disclosure.evaluate((el) => el.parentElement.open), false);
      const prominence = await page.getByRole('switch', { name: 'Use external AI', exact: true }).evaluate((el) => el.getBoundingClientRect().top - el.closest('[data-testid="ai-privacy-controls"]').getBoundingClientRect().top);
      assert.ok(prominence < 400, 'Consent switch stays prominent within its section');
      const deniedCount = events().length,
        chatBefore = scalar(`SELECT count(*) FROM ai_messages WHERE user_id='${a.id}'`);
      const denied = await page.request.post(origin + '/api/ai/chat', {
        data: { message: 'Synthetic off attempt' },
      });
      assert.equal(denied.status(), 403);
      assert.equal(events().length, deniedCount);
      assert.equal(scalar(`SELECT count(*) FROM ai_messages WHERE user_id='${a.id}'`), chatBefore);
      const sw = page.getByRole('switch', { name: 'Use external AI', exact: true });
      await sw.focus();
      await page.keyboard.press('Space');
      let dialog = page.getByRole('dialog', { name: 'Enable external AI?', exact: true });
      await dialog.waitFor();
      await shot(`consent-${label}-${width}`, false);
      await axe('[role="dialog"]', width, 'consent ' + label);
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      await page.waitForFunction((el) => el === document.activeElement, await sw.elementHandle());
      await confirmScope('ai');
      assert.equal((await privacy(origin)).wealthEnabled, false);
      await page.getByRole('button', { name: 'Review what AI receives', exact: true }).click();
      await page.getByLabel('Current automatic AI context', { exact: true }).waitFor();
      const minimal = await page
        .getByLabel('Current automatic AI context', { exact: true })
        .textContent();
      assert.doesNotMatch(minimal, /PRIVATE_|available_ngn|33749\.75/);
      assert.equal(events().length, deniedCount);
      await shot(`minimal-${label}-${width}`);
      await axe('[data-testid="ai-privacy-controls"]', width, 'minimal ' + label);
      await confirmScope('wealth');
      await page.getByRole('button', { name: 'Review what AI receives', exact: true }).click();
      await page.waitForFunction(() =>
        document
          .querySelector('[aria-label="Current automatic AI context"]')
          ?.textContent?.includes('33749.75'),
      );
      assert.doesNotMatch(
        await page.getByLabel('Current automatic AI context', { exact: true }).textContent(),
        /PRIVATE_/,
      );
      await shot(`wealth-${label}-${width}`);
      // Navigation/expansion never silently generates AI, even with both permissions ON.
      const navigationCount = events().length;
      await page.goto(origin + '/goals');
      await page.getByTestId('ai-domain-goals').waitFor();
      await page.goto(origin + '/finance');
      await page.getByTestId('wealth-report-status').waitFor();
      await page.getByTestId('wealth-analysis').locator('summary').click();
      await page.getByTestId('ai-domain-wealth').waitFor();
      assert.equal(events().length, navigationCount);
      await page.goto(origin + '/ai');
      await page
        .getByRole('button', { name: 'Synthetic saved local conversation', exact: false })
        .first()
        .click();
      await page.getByText('PRIVATE_LEGACY_FINANCE', { exact: true }).waitFor();
      const firstRows = Number(scalar(`SELECT count(*) FROM ai_messages WHERE user_id='${a.id}'`));
      await page
        .getByLabel('AI chat message', { exact: true })
        .fill('Summarize my recorded numeric patterns.');
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await until(
        () =>
          Number(scalar(`SELECT count(*) FROM ai_messages WHERE user_id='${a.id}'`)) ===
          firstRows + 2,
        'first chat committed',
      );
      await page
        .getByText('Synthetic read-only reply from the local provider stub.', { exact: true })
        .first()
        .waitFor();
      const sent = events().at(-1).body;
      assert.doesNotMatch(JSON.stringify(sent), /PRIVATE_/);
      assert.match(JSON.stringify(sent), /33749\.75/);
      await shot(`chat-${label}-${width}`);
      if (width === 375 && !light) {
        for (const domain of ['tasks', 'goals', 'assignments', 'overview', 'wealth']) {
          const r = await page.request.post(origin + '/api/ai/domain/' + domain + '?force=1', {
            data: {},
          });
          assert.equal(r.status(), 200, await r.text());
        }
        assert.equal(
          (
            await page.request.post(origin + '/api/goals/' + a.goal + '/analyze', { data: {} })
          ).status(),
          200,
        );
        assert.equal(
          (await page.request.post(origin + '/api/wealth/insight', { data: {} })).status(),
          200,
        );
        const primary = page,
          third = await fixture('Explicit Action Owner', false),
          thirdHolder = await context(375);
        page = thirdHolder.page;
        await login(origin, third);
        const thirdCalls = events().length;
        const offCheckin = await page.request.post(
          origin + '/api/goals/' + third.goal + '/checkins',
          { data: { progressValue: '25', responseText: 'PRIVATE_EXPLICIT_REFLECTION' } },
        );
        assert.equal(offCheckin.status(), 201);
        assert.equal((await offCheckin.json()).aiStatus, 'off');
        assert.equal(events().length, thirdCalls);
        const created = await page.request.post(origin + '/api/goals', {
          data: {
            title: 'Synthetic second numeric goal',
            progressMode: 'percentage',
            startingValue: 0,
            targetValue: 100,
            aiCoaching: true,
            checkinConfig: { frequency: 'daily' },
          },
        });
        assert.equal(created.status(), 201);
        const otherGoal = await created.json();
        const permission = await privacy(origin);
        const enabled = await page.request.put(origin + '/api/ai/privacy', {
          data: {
            enabled: true,
            wealthEnabled: false,
            expectedRevision: permission.revision,
            requestId: randomUUID(),
            policy: permission.policy,
          },
        });
        assert.equal(enabled.status(), 200);
        const onCheckin = await page.request.post(
          origin + '/api/goals/' + otherGoal.id + '/checkins',
          { data: { progressValue: '20', responseText: 'PRIVATE_EXPLICIT_REFLECTION' } },
        );
        assert.equal(onCheckin.status(), 201);
        assert.equal((await onCheckin.json()).aiStatus, 'generated');
        assert.equal(events().length, thirdCalls + 1);
        await thirdHolder.context.close();
        page = primary;
        const priorRows = scalar(`SELECT count(*) FROM ai_messages WHERE user_id='${a.id}'`),
          priorCalls = events().length;
        mode('defer');
        await page
          .getByLabel('AI chat message', { exact: true })
          .fill('Synthetic pending request.');
        await page.getByRole('button', { name: 'Send message', exact: true }).click();
        await until(
          () => events().length === priorCalls + 1,
          'deferred provider request reached stub',
        );
        const otherTab = await holder.context.newPage();
        page = otherTab;
        await settings(origin);
        await page.getByRole('switch', { name: 'Use external AI', exact: true }).click();
        await page.waitForFunction(
          () =>
            document
              .querySelector('[role="switch"][aria-label="Use external AI"]')
              ?.getAttribute('aria-checked') === 'false',
        );
        page = primary;
        await page
          .getByTestId('ai-privacy-notice')
          .getByText(/AI is off/)
          .waitFor();
        await page.getByText(/AI permission changed or the request expired/).waitFor();
        assert.equal(scalar(`SELECT count(*) FROM ai_messages WHERE user_id='${a.id}'`), priorRows);
        await shot('inflight-revoked-375');
        mode('success');
        await otherTab.close();
        await settings(origin);
        await confirmScope('ai');
        assert.equal((await privacy(origin)).wealthEnabled, false);
        await confirmScope('wealth');
        evidence.checks.push(
          'Real local HTTP: all domain/goal/Wealth adapters, OFF/ON explicit third-owner check-ins, cross-tab in-flight revocation and no late chat storage',
        );
      }

      // Revoke Wealth, then verify no old financial history enters the next permission generation.
      await settings(origin);
      await page.getByRole('switch', { name: 'Include my Wealth data', exact: true }).click();
      await page.waitForFunction(
        () =>
          document
            .querySelector('[role="switch"][aria-label="Include my Wealth data"]')
            ?.getAttribute('aria-checked') === 'false',
      );
      await page.goto(origin + '/ai');
      await page
        .getByText('Synthetic read-only reply from the local provider stub.', { exact: true })
        .first()
        .waitFor();
      const secondRows = Number(scalar(`SELECT count(*) FROM ai_messages WHERE user_id='${a.id}'`));
      await page
        .getByLabel('AI chat message', { exact: true })
        .fill('Describe the permitted counts only.');
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await until(
        () =>
          Number(scalar(`SELECT count(*) FROM ai_messages WHERE user_id='${a.id}'`)) ===
          secondRows + 2,
        'scoped chat committed',
      );
      await page
        .getByText('Synthetic read-only reply from the local provider stub.', { exact: true })
        .last()
        .waitFor();
      await page.waitForTimeout(100);
      assert.doesNotMatch(JSON.stringify(events().at(-1).body), /33749\.75|available_ngn|PRIVATE_/);
      await settings(origin);
      await page.getByRole('switch', { name: 'Use external AI', exact: true }).click();
      await page.waitForFunction(
        () =>
          document
            .querySelector('[role="switch"][aria-label="Use external AI"]')
            ?.getAttribute('aria-checked') === 'false',
      );
      const clearedForeign = scalar(`SELECT count(*) FROM ai_messages WHERE user_id='${b.id}'`);
      await page.getByRole('button', { name: 'Clear local AI history', exact: true }).click();
      dialog = page.getByRole('dialog', { name: 'Clear local AI history', exact: true });
      await dialog.waitFor();
      assert.equal(
        await dialog
          .getByRole('button', { name: 'Delete local AI history', exact: true })
          .isDisabled(),
        true,
      );
      await shot(`clear-${label}-${width}`, false);
      await axe('[role="dialog"]', width, 'clear ' + label);
      await dialog.getByRole('checkbox').check();
      await dialog.getByRole('button', { name: 'Delete local AI history', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(scalar(`SELECT count(*) FROM ai_messages WHERE user_id='${a.id}'`), '0');
      assert.equal(scalar(`SELECT count(*) FROM ai_domain_insights WHERE user_id='${a.id}'`), '0');
      assert.equal(scalar(`SELECT count(*) FROM goal_insights WHERE goal_id='${a.goal}'`), '0');
      assert.equal(
        scalar(
          `SELECT count(*) FROM goal_checkins WHERE id='${a.checkin}' AND ai_analysis IS NULL`,
        ),
        '1',
      );
      assert.equal(
        scalar(`SELECT count(*) FROM ai_messages WHERE user_id='${b.id}'`),
        clearedForeign,
      );
      // The private legacy chat was deleted: create a new local thread for the next theme's flow.
      if (!light)
        localSql(
          `INSERT INTO ai_conversations(id,user_id,title)VALUES('${a.legacy}','${a.id}','Synthetic saved local conversation');INSERT INTO ai_messages(user_id,conversation_id,role,content)VALUES('${a.id}','${a.legacy}','assistant','PRIVATE_LEGACY_FINANCE')`,
        );
    }
    assert.equal(
      snapshot([a.id, b.id]),
      before,
      'Consent/review/chat/clear never change either owner finance/shard/durable/source records',
    );
    // Unconfigured server is a distinct loopback process, with no provider key and no adapter calls.
    await settings(origin);
    await confirmScope('ai');
    const noKeyCount = events().length;
    await page.goto(unconfigured + '/settings#ai-privacy');
    await page.getByTestId('ai-privacy-controls').waitFor();
    await page
      .getByText(
        'AI is not configured on this server. Permission does not mean a provider request succeeded.',
        { exact: true },
      )
      .waitFor();
    for (const light of [false, true]) {
      await theme(light);
      await shot(`unconfigured-${light ? 'light' : 'dark'}-${width}`);
      await axe(
        '[data-testid="ai-privacy-controls"]',
        width,
        'unconfigured ' + (light ? 'light' : 'dark'),
      );
    }
    assert.equal(
      (
        await page.request.post(unconfigured + '/api/ai/chat', {
          data: { message: 'Synthetic unavailable request' },
        })
      ).status(),
      503,
    );
    assert.equal(events().length, noKeyCount);
    await page.goto(origin + '/ai');
    await page.getByRole('button', { name: 'Open profile menu', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.waitForURL(origin + '/auth');
    await login(origin, b);
    await settings(origin);
    assert.equal(
      await page
        .getByRole('switch', { name: 'Use external AI', exact: true })
        .getAttribute('aria-checked'),
      'false',
    );
    await page.goto(origin + '/ai');
    await page
      .getByRole('button', { name: 'Synthetic saved local conversation', exact: false })
      .first()
      .waitFor();
    assert.equal(
      await page
        .getByText('Synthetic read-only reply from the local provider stub.', { exact: true })
        .count(),
      0,
    );
    await shot(`other-owner-${width}`);
    assert.equal(snapshot([a.id, b.id]), before);
    evidence.hashes.push({
      width,
      before,
      after: snapshot([a.id, b.id]),
      ledgerRows: 3,
      availableNGN: '33749.75',
    });
    evidence.widths.push(width);
    console.log(`PASS: AI privacy flows, both themes, owner isolation and source invariants at ${width}px`);
    await holder.context.close();
    page = null;
  }
  assert.deepEqual(evidence.browserErrors, []);
  evidence.modelCalls = events().length;
  assert.ok(evidence.modelCalls > 0);
  assert.ok(events().every((e) => !JSON.stringify(e.body).includes('PRIVATE_')));
  evidence.checks.push(
    'All model HTTP intercepted by guarded Node preload; no real provider call. Separate unconfigured process stays offline.',
  );
  fs.writeFileSync(folder + '/result.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (e) {
  if (page)
    await page.screenshot({ path: folder + '/failure.png', fullPage: true }).catch(() => null);
  throw e;
} finally {
  if (browser) await browser.close();
  for (const s of servers) {
    if (s.exitCode === null) {
      s.kill('SIGTERM');
      await Promise.race([once(s, 'exit'), new Promise((r) => setTimeout(r, 3000))]);
    }
  }
  mode('success');
}
