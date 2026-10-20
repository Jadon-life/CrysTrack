/** Real signed-in Chromium against guarded disposable local Supabase. No target overrides. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { ROOT, readLocalKeys, localSql } from './local-supabase.mjs';
import { localEnvironment } from './local-supabase-policy.mjs';
const phase = process.argv[2]?.split('=')[1];
assert.ok(['before', 'after', 'fixture'].includes(phase));
assert.equal(process.argv.length, 3);
assert.equal(process.argv[2], '--phase=' + phase);
const keys = readLocalKeys();
assert.equal(
  JSON.parse(fs.readFileSync(ROOT + '/.next/required-server-files.json')).config.env
    .NEXT_PUBLIC_CRYSTRACK_RUNTIME,
  'normal',
);
const native = createRequire(import.meta.url),
  cache = new Map();
function load(f) {
  f = path.resolve(f);
  if (cache.has(f)) return cache.get(f).exports;
  const m = { exports: {} };
  cache.set(f, m);
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
  )(
    (n) => (n.startsWith('.') ? load(path.resolve(path.dirname(f), n + '.ts')) : native(n)),
    m,
    m.exports,
  );
  return m.exports;
}
const { parseCsv } = load('src/lib/csv/statement.ts');
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
  }),
  q = (s) => "'" + String(s).replaceAll("'", "''") + "'",
  scalar = (s) => localSql(s).split('\n').at(-1);
const output = ROOT + '/.preview-test/calm-' + phase;
const fixturePath = ROOT + '/.preview-test/calm-private-fixture.json';
fs.mkdirSync(output, { recursive: true });
const evidence = {
  checks: [],
  widths: [],
  accessibility: [],
  exports: [],
  browserErrors: [],
  externalRequestsBlocked: 0,
};
let server, browser, page;
const frozen = '2026-10-19T12:00:00Z';
const clock = (fixed, at = frozen) => {
  for (const schema of [
    'crystrack_daily',
    'crystrack_bills',
    'crystrack_budgets',
    'crystrack_csv',
    'crystrack_overview',
  ])
    localSql(
      `CREATE OR REPLACE FUNCTION ${schema}.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$SELECT ${fixed ? q(at) + '::timestamptz' : 'clock_timestamp()'}$$`,
    );
};
try {
  clock(true);
  let fixture;
  if (fs.existsSync(fixturePath)) fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  else {
    assert.ok(['before', 'fixture'].includes(phase), 'Prepare the synthetic fixture before the after regression.');
    fixture = await (async () => {
      const email = `money-display-${randomUUID()}@example.invalid`,
        password = randomUUID() + 'Aa1!';
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: 'Synthetic Calm Explorer' },
      });
      assert.equal(error, null);
      const uid = data.user.id;
      localSql(
        `INSERT INTO profiles(user_id,timezone,scheduling_timezone,display_name) VALUES('${uid}','Africa/Lagos','Africa/Lagos','Synthetic Calm Explorer')`,
      );
      const owner = (s) =>
        localSql(
          `BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${uid}","role":"authenticated"}';${s};COMMIT;`,
        );
      const ownerJson = (s) =>
        JSON.parse(
          owner('SELECT ' + s)
            .split('\n')
            .at(-1),
        );
      localSql(
        "CREATE OR REPLACE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$SELECT '2026-10-18T12:00:00Z'::timestamptz$$",
      );
      owner('SELECT sep28_crystal_state()');
      owner(
        `INSERT INTO money_entries(user_id,type,flow_kind,amount,date,source,category) VALUES('${uid}','income','income',25000,'2026-10-01','Synthetic whole income','Other'),('${uid}','saving','saving',5000,'2026-10-01','Synthetic whole saving','Savings');INSERT INTO finance_targets(user_id,title,target_amount,current_amount) VALUES('${uid}','Synthetic whole fund',10000,5000);INSERT INTO wealth_debts(user_id,kind,counterparty,original_amount,outstanding_amount) VALUES('${uid}','liability','Synthetic precise liability',2500,1250.25)`,
      );
      const statement = {
        source: 'synthetic-issue35',
        fileHash: '3'.repeat(64),
        timezone: 'Africa/Lagos',
        rows: [
          {
            row: 1,
            date: '2026-10-01',
            description: 'Synthetic imported precise lunch',
            amount: '2500.75',
            type: 'expense',
            currency: 'NGN',
            category: 'Food',
            reference: 'SYN-35',
            account: null,
            keepDuplicate: false,
          },
        ],
      };
      const review = ownerJson(
        `wealth_csv_review(${q(statement.source)},${q(statement.fileHash)},${q(statement.timezone)},${q(JSON.stringify(statement.rows))}::jsonb)`,
      );
      owner(
        `SELECT wealth_csv_import('${randomUUID()}',${q(statement.source)},${q(statement.fileHash)},${q(statement.timezone)},${q(JSON.stringify(statement.rows))}::jsonb,${q(review.token)},true)`,
      );
      owner(
        `SELECT wealth_budget_mutate('set','2026-10-01','Food','2000.00',0,'${randomUUID()}','Africa/Lagos')`,
      );
      const billId = randomUUID(),
        bill = {
          title: 'Synthetic whole bill',
          category: 'Utilities',
          merchant: null,
          amount: '2500.00',
          frequency: 'monthly',
          firstDue: '2026-10-19',
          endDate: null,
          reminderEnabled: false,
        };
      owner(
        `SELECT wealth_bill_mutate('create','${billId}',0,'${randomUUID()}','Africa/Lagos',${q(JSON.stringify(bill))}::jsonb)`,
      );
      owner('SELECT wealth_bill_list(NULL,0,NULL)');
      // Five explicitly reviewed/confirmed, bounded RPC batches, not a 2,000-row shortcut.
      for (let batch = 0; batch < 5; batch++) {
        const rows = Array.from({ length: 401 }, (_, i) => ({
          row: i + 1,
          date: '2026-09-01',
          description: 'Synthetic archived income cents',
          amount: '0.01',
          type: 'income',
          currency: 'NGN',
          category: 'Other',
          reference: `SYN-H-${batch}-${i}`,
          account: null,
          keepDuplicate: true,
        }));
        const source = 'synthetic-overview-history',
          hash = String(batch + 4).repeat(64);
        const r = ownerJson(
          `wealth_csv_review('${source}','${hash}','Africa/Lagos',${q(JSON.stringify(rows))}::jsonb)`,
        );
        owner(
          `SELECT wealth_csv_import('${randomUUID()}','${source}','${hash}','Africa/Lagos',${q(JSON.stringify(rows))}::jsonb,'${r.token}',true)`,
        );
      }
      const paidId = randomUUID(),
        paidBill = { ...bill, title: 'Synthetic paid proof', amount: '4.75' };
      owner(
        `SELECT wealth_bill_mutate('create','${paidId}',0,'${randomUUID()}','Africa/Lagos',${q(JSON.stringify(paidBill))}::jsonb)`,
      );
      const view = ownerJson(`wealth_bill_list('${paidId}',0,NULL)`),
        o = view.occurrences[0],
        definition = view.items.find((b) => b.id === paidId);
      owner(
        `SELECT wealth_bill_mutate('pay','${paidId}',${definition.revision},'${randomUUID()}','Africa/Lagos',${q(JSON.stringify({ occurrenceId: o.id, occurrenceRevision: o.revision, actualAmount: '4.75' }))}::jsonb)`,
      );

      owner('SELECT daily_context()');
      for (const [title, time] of [
        ['Read a chapter', '07:00'],
        ['Practice questions', '20:00'],
        ['Take a walk', '18:00'],
      ]) {
        const id = randomUUID();
        owner(
          `INSERT INTO recurring_tasks(id,user_id,title,preferred_time) VALUES('${id}','${uid}',${q(title)},${q(time)});INSERT INTO task_schedules(task_id,weekday) SELECT '${id}',generate_series(0,6)`,
        );
      }
      localSql(
        "CREATE OR REPLACE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$SELECT '2026-10-19T12:00:00Z'::timestamptz$$",
      );
      owner("SELECT daily_context();SELECT daily_read_window('2026-10-13','2026-10-19')");
      for (const [title, deadline, category] of [
        ['Lab report due today', '2026-10-19T16:00:00Z', 'PHY 101'],
        ['Review overdue worksheet', '2026-10-18T12:00:00Z', 'MTH 101'],
      ]) {
        const fields = {
          title,
          deadline,
          category,
          priority: 'high',
          timezone: 'Africa/Lagos',
          reminder_config: { enabled: false, channels: ['push'], offsetMinutes: [] },
        };
        owner(
          `SELECT assignment_mutate('create','${randomUUID()}',NULL,${q(JSON.stringify(fields))}::jsonb)`,
        );
      }

      const overdueId = randomUUID();
      owner(
        `SELECT wealth_bill_mutate('create','${overdueId}',0,'${randomUUID()}','Africa/Lagos',${q(JSON.stringify({ ...bill, title: 'Synthetic overdue bill', firstDue: '2026-10-17', amount: '750.00' }))}::jsonb);SELECT wealth_bill_list(NULL,0,NULL)`,
      );
      const emptyEmail = `calm-empty-${randomUUID()}@example.invalid`,
        emptyPassword = randomUUID() + 'Aa1!';
      const empty = await admin.auth.admin.createUser({
        email: emptyEmail,
        password: emptyPassword,
        email_confirm: true,
        user_metadata: { full_name: 'Synthetic Empty Explorer' },
      });
      assert.equal(empty.error, null);
      const emptyId = empty.data.user.id;
      localSql(
        `INSERT INTO profiles(user_id,timezone,scheduling_timezone,display_name) VALUES('${emptyId}','Africa/Lagos','Africa/Lagos','Synthetic Empty Explorer')`,
      );
      localSql(
        `BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${emptyId}","role":"authenticated"}';SELECT daily_context();SELECT daily_read_window('2026-10-13','2026-10-19');SELECT sep28_crystal_state();COMMIT`,
      );
      return { uid, email, password, billId, paidId, emptyId, emptyEmail, emptyPassword };
    })();
    fs.writeFileSync(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
  }
  const { uid, email, password, billId, emptyId, emptyEmail, emptyPassword } = fixture;
  const owner = (s) =>
    localSql(
      `BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${uid}","role":"authenticated"}';${s};COMMIT`,
    );
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
    'sep28_crystal_moments',
    'daily_records',
    'daily_tracking_states',
    'daily_routine_records',
    'daily_notes',
    'routine_schedule_versions',
  ];
  const snapshot = () =>
    scalar(
      'SELECT jsonb_build_object(' +
        tables
          .map(
            (t) =>
              q(t) +
              `,(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM ${t} t WHERE user_id IN('${uid}','${emptyId}'))`,
          )
          .join(',') +
        ')::text',
    );
  const before = snapshot();
  const financialHash = () => createHash('sha256').update(snapshot()).digest('hex');
  evidence.sourceHash = financialHash();
  if (phase !== 'after')
    fs.writeFileSync(ROOT + '/.preview-test/calm-before-hash.txt', evidence.sourceHash);
  else
    assert.equal(
      evidence.sourceHash,
      fs.readFileSync(ROOT + '/.preview-test/calm-before-hash.txt', 'utf8'),
      'same synthetic records as baseline',
    );
  // Fixture mode provisions local synthetic records without asserting the obsolete pre-Issue-39 UI.
  if (phase === 'fixture') {
    console.log('PASS: guarded synthetic Calm fixture and financial baseline prepared; no UI comparison claimed.');
  } else {
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

  const login = async (e, p) => {
    await page.goto(origin + '/auth');
    await page.locator('input[type=email]').fill(e);
    await page.locator('input[type=password]').fill(p);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await page.waitForURL(origin + '/');
    await page.getByTestId('today-streak').waitFor();
  };
  const capture = async (name, fullPage = true) => {
    if (fullPage)
      await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: output + '/' + name + '.jpg',
      type: 'jpeg',
      quality: 78,
      fullPage,
    });
  };
  const setTheme = async (light) => {
    const sw = page.getByRole('switch', { name: /appearance active/ });
    if (((await sw.getAttribute('aria-label')) === 'Light appearance active') !== light)
      await sw.click();
    await page
      .getByRole('switch', {
        name: light ? 'Light appearance active' : 'Dark appearance active',
        exact: true,
      })
      .waitFor();
  };
  const inspectAccessibility = async (width, theme) => {
    await page.addScriptTag({ path: ROOT + '/node_modules/axe-core/axe.min.js' });
    const result = await page.evaluate(async () => {
      const r = await window.axe.run(
        '[data-calm-disclosure], .wealth-segmented, [aria-labelledby="wealth-attention-heading"], a[href="#today-deadlines"]',
        { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } },
      );
      const rgba = (value) => {
        const c = document.createElement('canvas');
        c.width = c.height = 1;
        const x = c.getContext('2d');
        x.clearRect(0, 0, 1, 1);
        x.fillStyle = value;
        x.fillRect(0, 0, 1, 1);
        return Array.from(x.getImageData(0, 0, 1, 1).data).map((n, i) => (i === 3 ? n / 255 : n));
      };
      const over = (a, b) => a.slice(0, 3).map((v, i) => v * a[3] + b[i] * (1 - a[3]));
      const lum = (a) =>
        a
          .map((v) => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          })
          .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const contrast = (fg, bg) => {
        const l = [lum(fg), lum(bg)].sort((a, b) => b - a);
        return (l[0] + 0.05) / (l[1] + 0.05);
      };
      const controls = [
        ...document.querySelectorAll(
          '[data-calm-disclosure] > summary, .wealth-segmented button, a[href="#today-deadlines"]',
        ),
      ]
        .filter((e) => e.getBoundingClientRect().height > 0)
        .map((e) => {
          const surface = e.closest('[data-calm-disclosure], .wealth-segmented');
          const bg = surface
            ? over(rgba(getComputedStyle(surface).backgroundColor), [255, 255, 255])
            : [255, 255, 255];
          const own = over(rgba(getComputedStyle(e).backgroundColor), bg);
          const fg = over(rgba(getComputedStyle(e).color), own);
          const rect = e.getBoundingClientRect();
          return {
            name: e.textContent.trim(),
            height: rect.height,
            width: rect.width,
            contrast: contrast(fg, own),
          };
        });
      return {
        violations: r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target),
        })),
        controls,
      };
    });
    assert.deepEqual(result.violations, []);
    for (const c of result.controls) {
      assert.ok(c.height >= 40 && c.width >= 40, '40px ' + c.name);
      assert.ok(c.contrast >= 4.5, 'contrast ' + c.name + ': ' + c.contrast);
    }
    evidence.accessibility.push({ width, theme, ...result });
  };
  for (const width of [375, 430, 768, 1280, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 812 },
      timezoneId: 'America/New_York',
      locale: 'en-GB',
      reducedMotion: 'reduce',
      acceptDownloads: true,
    });
    await context.route('**/*', (r) => {
      if (['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname))
        return r.continue();
      evidence.externalRequestsBlocked++;
      return r.abort();
    });
    const fx = (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          usdNgn: 1600,
          ngnUsd: 0.000625,
          provider: 'Synthetic local quote',
          updatedAt: frozen,
        }),
      });
    await context.route('**/api/exchange-rate', fx);
    page = await context.newPage();
    page.on('pageerror', (e) => evidence.browserErrors.push(e.message));
    await page.clock.setSystemTime(new Date('2026-10-19T16:00:00Z'));
    await login(email, password);
    for (const light of [false, true]) {
      await setTheme(light);
      const theme = light ? 'light' : 'dark';
      await page.goto(origin + '/');
      await page.getByRole('button', { name: 'Complete Read a chapter', exact: true }).waitFor();
      const y = (
        await page
          .getByRole('button', { name: 'Complete Read a chapter', exact: true })
          .boundingBox()
      ).y;
      evidence.checks.push({ width, theme, todayFirstTaskY: y });
      if (phase === 'after') assert.ok(y < 812, 'primary task control in first mobile viewport');
      await capture(`today-${theme}-${width}`);
      if (phase === 'after') {
        await inspectAccessibility(width, theme + ' Today');
        const urgent = page.locator('a[href="#today-deadlines"]');
        await urgent.focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.activeElement?.id === 'today-deadlines');
        await page.waitForFunction(() => {
          const top = document.getElementById('today-deadlines')?.getBoundingClientRect().top;
          return top !== undefined && top >= 88 && top < window.innerHeight;
        });
        assert.ok((await page.locator('#today-deadlines').boundingBox()).y < 812);
      }
      await page.goto(origin + '/finance');
      await page.getByTestId('wealth-report-status').waitFor();
      const report = await (await page.request.get(origin + '/api/wealth')).json();
      assert.equal(report.reporting.ledgerCount, 2009);
      assert.equal(report.summary.availableBalance, '17514.55');
      evidence.checks.push({
        width,
        theme,
        wealthHeight: await page.evaluate(() => document.documentElement.scrollHeight),
        count: 2009,
      });
      await capture(`wealth-${theme}-${width}`);
      if (phase === 'after') {
        await inspectAccessibility(width, theme);
        // Secondary balances and all retained recent rows stay discoverable by keyboard.
        const balances = page.getByTestId('wealth-balances').locator('summary');
        await balances.focus();
        await page.keyboard.press('Enter');
        await page.getByText('Saved', { exact: true }).waitFor();
        assert.equal(await balances.getAttribute('aria-expanded'), 'true');
        await page.keyboard.press('Enter');
        const recent = page.getByRole('button', {
          name: 'Show all 14 recent transactions',
          exact: true,
        });
        await recent.focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('#recent-money-rows > div').count(), 14);
        assert.equal(
          await page
            .getByRole('button', { name: 'Show fewer transactions', exact: true })
            .getAttribute('aria-expanded'),
          'true',
        );
        await page.getByRole('button', { name: 'Show fewer transactions', exact: true }).click();
        assert.equal(await page.locator('#recent-money-rows > div').count(), 4);
        const toggle = page.getByTestId('wealth-analysis').locator('summary');
        await toggle.focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction(
          () =>
            document
              .querySelector('[data-testid="wealth-analysis"] > summary')
              ?.getAttribute('aria-expanded') === 'true',
        );
        assert.equal(
          await page
            .getByTestId('wealth-analysis')
            .locator('summary')
            .getAttribute('aria-expanded'),
          'true',
        );
        const exactTable = page.getByRole('table', {
          name: 'Six-month recorded cashflow, exact NGN',
          exact: true,
        });
        const tableBox = await exactTable.locator('..').boundingBox();
        assert.ok(
          tableBox.width <= 1 && tableBox.height <= 1,
          'exact accessible table stays visually clipped inside glass styles',
        );
        await page.getByTestId('wealth-analysis').locator('.recharts-area-curve').first().waitFor();
        await page.getByTestId('wealth-analysis').locator('.recharts-pie-sector').first().waitFor();
        await capture(`wealth-expanded-${theme}-${width}`);
        await inspectAccessibility(width, theme + ' expanded');
        await page.getByTestId('wealth-analysis').locator('.recharts-wrapper').first().waitFor();
        assert.ok(
          (
            await page
              .getByTestId('wealth-analysis')
              .locator('.recharts-wrapper')
              .first()
              .boundingBox()
          ).width > 100,
        );
        await page.getByTestId('wealth-analysis').locator('summary').click();
      }
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
    }
    await setTheme(false);
    await page.getByRole('button', { name: 'Budgets', exact: true }).click();
    await page
      .getByRole('article', { name: 'Food budget', exact: true })
      .getByText(/Over this limit/)
      .waitFor();
    await capture(`budget-over-${width}`);
    await page.getByRole('button', { name: 'Bills & subscriptions', exact: true }).click();
    await page.getByRole('article', { name: 'Synthetic overdue bill bill', exact: true }).waitFor();
    await capture(`bills-${width}`);
    await page
      .getByRole('button', { name: 'Due history: Synthetic paid proof', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Due & payment history', exact: true }).waitFor();
    await page.getByText(/2026-10-19 · Paid ·/).waitFor();
    await capture(`paid-history-${width}`);
    await page.getByRole('button', { name: 'All bills', exact: true }).click();

    const due = page.getByRole('article', { name: 'Synthetic whole bill bill', exact: true });
    await due
      .getByRole('button', { name: /Mark.*paid/ })
      .first()
      .click();
    await page.getByRole('dialog').waitFor();
    await capture(`bill-consent-${width}`, false);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await page.route('**/api/wealth', (r) =>
      r.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Synthetic unavailable evidence' }),
      }),
    );
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page
      .getByRole('status')
      .filter({ hasText: 'Wealth is temporarily unavailable' })
      .waitFor();
    await capture(`wealth-unavailable-${width}`, false);
    assert.equal(await page.getByTestId('wealth-report-status').count(), 0);
    await page.unroute('**/api/wealth');
    await page.getByRole('button', { name: 'Refresh Wealth', exact: true }).click();
    await page.getByTestId('wealth-report-status').waitFor();
    await context.unroute('**/api/exchange-rate', fx);
    await context.route('**/api/exchange-rate', (r) =>
      r.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Synthetic missing FX' }),
      }),
    );
    await page.evaluate(() => localStorage.removeItem('crystrack-wealth-rate-v1'));
    await page.reload();
    await page.getByTestId('wealth-report-status').waitFor();
    await page
      .getByText('USD conversion unavailable; NGN ledger remains intact.', { exact: true })
      .waitFor();
    await capture(`missing-fx-${width}`, false);
    await page.route('**/api/daily-records?*', (r) =>
      r.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":"Synthetic unavailable history"}',
      }),
    );
    await page.goto(origin + '/');
    await page
      .getByTestId('today-streak')
      .getByText(/History not yet verified/)
      .waitFor();
    await capture(`unverified-today-${width}`);
    await page.unroute('**/api/daily-records?*');
    await page.route('**/api/tasks?*', (r) =>
      r.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":"Synthetic unavailable tasks"}',
      }),
    );
    await page.reload();
    await page.getByTestId('today-streak').waitFor();
    if (phase === 'after')
      await page
        .getByRole('alert')
        .filter({ hasText: 'Your tasks could not be verified' })
        .waitFor();
    else await page.getByText('Nothing scheduled today', { exact: true }).last().waitFor();
    await capture(`unverified-tasks-${width}`, false);
    await page.unroute('**/api/tasks?*');

    await page.getByRole('button', { name: 'Open profile menu', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.waitForURL(origin + '/auth');
    await login(emptyEmail, emptyPassword);
    await page.getByText('Nothing scheduled today', { exact: true }).last().waitFor();
    assert.equal(await page.getByText('Read a chapter', { exact: true }).count(), 0);
    await capture(`empty-today-${width}`);
    await page.goto(origin + '/finance');
    await page.getByTestId('wealth-report-status').waitFor();
    const emptyReport = await (await page.request.get(origin + '/api/wealth')).json();
    assert.equal(emptyReport.reporting.ledgerCount, 0);
    assert.equal(emptyReport.summary.availableBalance, '0.00');
    assert.equal(await page.getByText('Synthetic whole income', { exact: true }).count(), 0);
    await capture(`empty-wealth-${width}`);
    assert.equal(
      snapshot(),
      before,
      'navigation/disclosure/theme/consent cancellation never mutate finance, shards or routine outcomes in either account',
    );
    evidence.widths.push(width);
    await context.close();
    page = null;
  }
  if (phase === 'after') {
    // Explicit mutations use a third synthetic owner, separate from both immutable comparison accounts.
    const e = `calm-journey-${randomUUID()}@example.invalid`,
      pw = randomUUID() + 'Aa1!';
    const u = await admin.auth.admin.createUser({
      email: e,
      password: pw,
      email_confirm: true,
      user_metadata: { full_name: 'Synthetic Journey Explorer' },
    });
    assert.equal(u.error, null);
    const id = u.data.user.id;
    const j = (s) =>
      localSql(
        `BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${id}","role":"authenticated"}';${s};COMMIT`,
      );
    const total = (t) => Number(scalar(`SELECT count(*) FROM ${t} WHERE user_id='${id}'`));
    localSql(
      `INSERT INTO profiles(user_id,timezone,scheduling_timezone,display_name) VALUES('${id}','Africa/Lagos','Africa/Lagos','Synthetic Journey Explorer');CREATE OR REPLACE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$SELECT '2026-10-18T12:00:00Z'::timestamptz$$`,
    );
    j('SELECT daily_context();SELECT sep28_crystal_state()');
    const routine = randomUUID();
    j(
      `INSERT INTO recurring_tasks(id,user_id,title,preferred_time) VALUES('${routine}','${id}','Journey reading','07:00');INSERT INTO task_schedules(task_id,weekday) SELECT '${routine}',generate_series(0,6)`,
    );
    localSql(
      "CREATE OR REPLACE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$SELECT '2026-10-19T12:00:00Z'::timestamptz$$",
    );
    j(
      `SELECT daily_context();INSERT INTO money_entries(user_id,type,flow_kind,amount,date,source,category) VALUES('${id}','income','income',25000.25,'2026-10-01','Journey income','Other'),('${id}','expense','expense',2500.75,'2026-10-01','Journey expense','Food');SELECT wealth_budget_mutate('set','2026-10-01','Food','2000.00',0,'${randomUUID()}','Africa/Lagos')`,
    );
    const b = randomUUID();
    j(
      `SELECT wealth_bill_mutate('create','${b}',0,'${randomUUID()}','Africa/Lagos',${q(JSON.stringify({ title: 'Journey bill', category: 'Utilities', merchant: null, amount: '2500.00', frequency: 'monthly', firstDue: '2026-10-19', endDate: null, reminderEnabled: false }))}::jsonb);SELECT wealth_bill_list(NULL,0,NULL)`,
    );
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      timezoneId: 'America/New_York',
      locale: 'en-GB',
      reducedMotion: 'reduce',
      acceptDownloads: true,
    });
    await context.route('**/*', (r) =>
      ['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname)
        ? r.continue()
        : r.abort(),
    );
    await context.route('**/api/exchange-rate', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          usdNgn: 1600,
          ngnUsd: 0.000625,
          provider: 'Synthetic quote',
          updatedAt: frozen,
        }),
      }),
    );
    page = await context.newPage();
    page.on('pageerror', (e) => evidence.browserErrors.push(e.message));
    await page.clock.setSystemTime(new Date('2026-10-19T16:00:00Z'));
    await login(e, pw);
    await page.getByRole('button', { name: 'Complete Journey reading', exact: true }).click();
    await page
      .getByRole('button', { name: 'Mark Journey reading incomplete', exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByRole('button', { name: 'Complete Journey reading', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Skip Journey reading today', exact: true }).click();
    await page
      .getByRole('button', { name: 'Undo skip for Journey reading', exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByRole('button', { name: 'Complete Journey reading', exact: true }).waitFor();
    assert.equal(total('money_entries'), 2);
    await page.getByRole('link', { name: 'Tasks & Week grid', exact: true }).click();
    await page.getByRole('button', { name: 'Week grid', exact: true }).click();
    await page.getByTestId('task-week-grid').waitFor();
    await capture('journey-week-grid-375');
    await page.goto(origin + '/assignments');
    await page.getByRole('button', { name: 'New assignment', exact: true }).waitFor();
    await page.goto(origin + '/finance');
    await page.getByTestId('wealth-report-status').waitFor();
    const inspect = page
      .getByText('Available', { exact: true })
      .locator('..')
      .getByRole('button', { name: /^Inspect/ });
    await inspect.focus();
    await page.keyboard.press('Enter');
    let d = page.getByRole('dialog', { name: 'Amount details', exact: true });
    await d.getByText('Exact NGN amount: ₦22,499.50.', { exact: true }).waitFor();
    await capture('journey-exact-375', false);
    await page.keyboard.press('Escape');
    await d.waitFor({ state: 'hidden' });
    await page.waitForFunction((n) => n === document.activeElement, await inspect.elementHandle());
    await page.getByRole('button', { name: 'Review budgets', exact: true }).click();
    await page
      .getByRole('article', { name: 'Food budget', exact: true })
      .getByText(/Over this limit/)
      .waitFor();
    await page.getByRole('button', { name: 'Bills & subscriptions', exact: true }).click();
    await page.getByRole('button', { name: 'Mark Journey bill as paid', exact: true }).click();
    d = page.getByRole('dialog', { name: 'Confirm actual payment', exact: true });
    await d.getByLabel('Actual amount paid (NGN)', { exact: true }).fill('2500.25');
    await d.getByRole('button', { name: 'Confirm paid expense', exact: true }).click();
    assert.equal(total('money_entries'), 2, 'missing payment consent blocks a write');
    await d.getByLabel('I have actually paid this bill', { exact: true }).check();
    // Move focus off the formerly invalid consent field before the actual consent capture.
    await d.getByLabel('Actual amount paid (NGN)', { exact: true }).click();
    await capture('journey-payment-consent-375', false);
    await d.getByRole('button', { name: 'Confirm paid expense', exact: true }).click();
    await d.waitFor({ state: 'hidden' });
    assert.equal(total('money_entries'), 3);
    const shards = scalar(
      `SELECT coalesce(sum(delta),0) FROM sep28_crystal_events WHERE user_id='${id}'`,
    );
    await page.getByRole('button', { name: 'CSV tools', exact: true }).click();
    const csv = page.getByTestId('csv-tools');
    await csv.getByRole('button', { name: 'Import CSV', exact: true }).click();
    d = page.getByRole('dialog', { name: 'Review a CSV statement', exact: true });
    await d
      .getByTestId('statement-file')
      .setInputFiles(ROOT + '/tests/fixtures/csv/synthetic-signed-ngn.csv');
    assert.equal(total('money_entries'), 3, 'selecting a statement is not an import');
    await d.getByLabel('Statement source key', { exact: true }).fill('synthetic-calm-journey');
    await d.getByRole('checkbox', { name: /I have checked that this statement/ }).check();
    await d.getByRole('button', { name: 'Select valid rows', exact: true }).click();
    await d
      .getByRole('article', { name: 'Statement row 1', exact: true })
      .getByLabel('description', { exact: true })
      .fill('Synthetic corrected journey lunch');
    await d.getByRole('checkbox', { name: 'Include row 3', exact: true }).uncheck();
    await d.getByRole('button', { name: 'Check selected rows', exact: true }).click();
    await d.getByRole('heading', { name: 'Authoritative duplicate review', exact: true }).waitFor();
    assert.equal(
      await d.getByRole('button', { name: 'Confirm import', exact: true }).isDisabled(),
      true,
    );
    assert.equal(total('money_entries'), 3);
    await capture('journey-csv-review-375', false);
    await d.getByRole('checkbox', { name: /I reviewed every chosen row/ }).check();
    await d.getByRole('button', { name: 'Confirm import', exact: true }).click();
    await csv.getByRole('status').filter({ hasText: 'Confirmed import: 2 transactions' }).waitFor();
    assert.equal(total('money_entries'), 5);
    assert.equal(total('wealth_csv_batches'), 1);
    assert.equal(
      scalar(`SELECT coalesce(sum(delta),0) FROM sep28_crystal_events WHERE user_id='${id}'`),
      shards,
      'CSV cannot earn more shards',
    );
    await csv.getByLabel('Export from', { exact: true }).fill('2026-10-01');
    await csv.getByLabel('Export through', { exact: true }).fill('2026-10-31');
    const downloading = page.waitForEvent('download');
    await csv.getByRole('button', { name: 'Export CSV', exact: true }).click();
    const downloaded = await downloading;
    const rows = parseCsv(fs.readFileSync(await downloaded.path(), 'utf8'), ',', 'journey').rows;
    assert.equal(rows.length, 5);
    assert.ok(rows.some((r) => r[2] === '2500.25'));
    await page.goto(origin + '/');
    await page.getByRole('button', { name: 'Complete Journey reading', exact: true }).waitFor();
    await capture('journey-return-today-375');
    assert.equal(
      snapshot(),
      before,
      'third-account explicit actions cannot affect either comparison account',
    );
    evidence.checks.push(
      '375px combined journey: late-preferred task complete/undo/skip/undo → Tasks Week grid → Assignments → Wealth exact keyboard dialog → over-limit Budgets → explicit paid bill consent → CSV mapping/correction/review/confirm → exact five-row export → Today; no write without consent and no CSV shards',
    );
    await context.close();
    page = null;
  }

  assert.deepEqual(evidence.browserErrors, []);
  evidence.sourceHashAfter = financialHash();
  assert.equal(evidence.sourceHashAfter, evidence.sourceHash);
  fs.writeFileSync(output + '/result.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  }
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
  clock(false);
}
