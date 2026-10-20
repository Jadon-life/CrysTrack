/** Real signed-in Chromium against guarded disposable local Supabase. No target overrides. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { ROOT, readLocalKeys, localSql } from './local-supabase.mjs';
import { localEnvironment } from './local-supabase-policy.mjs';
assert.equal(process.argv.length, 2);
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
const output = ROOT + '/.preview-test/money-presentation';
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
const clock = (fixed) => {
  for (const schema of ['crystrack_bills', 'crystrack_budgets', 'crystrack_csv'])
    localSql(
      `CREATE OR REPLACE FUNCTION ${schema}.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$SELECT ${fixed ? q(frozen) + '::timestamptz' : 'clock_timestamp()'}$$`,
    );
};
try {
  clock(true);
  const email = `money-display-${randomUUID()}@example.invalid`,
    password = randomUUID() + 'Aa1!';
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Synthetic Money Explorer' },
  });
  assert.equal(error, null);
  const uid = data.user.id;
  localSql(
    `INSERT INTO profiles(user_id,timezone,scheduling_timezone,display_name) VALUES('${uid}','Africa/Lagos','Africa/Lagos','Synthetic Money Explorer')`,
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
  ];
  const snapshot = () =>
    scalar(
      'SELECT jsonb_build_object(' +
        tables
          .map(
            (t) =>
              q(t) +
              `,(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM ${t} t WHERE user_id='${uid}')`,
          )
          .join(',') +
        ')::text',
    );
  const before = snapshot();
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
  for (const width of [375, 430, 768, 1280, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 1050 },
      locale: width === 430 ? 'en-NG' : 'en-GB',
      timezoneId: 'America/New_York',
      reducedMotion: 'reduce',
      acceptDownloads: true,
    });
    await context.route('**/*', (r) => {
      if (['127.0.0.1', 'localhost'].includes(new URL(r.request().url()).hostname))
        return r.continue();
      evidence.externalRequestsBlocked++;
      return r.abort();
    });
    await context.route('**/api/exchange-rate', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          usdNgn: 1600,
          ngnUsd: 0.000625,
          provider: 'Synthetic local quote',
          updatedAt: frozen,
        }),
      }),
    );
    page = await context.newPage();
    page.on('pageerror', (e) => evidence.browserErrors.push(e.message));
    await page.clock.setSystemTime(new Date(frozen));
    await page.goto(origin + '/auth');
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(password);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await page.waitForURL(origin + '/');
    await page.getByTestId('today-streak').waitFor();
    await page.goto(origin + '/finance');
    await page.getByText('Synthetic whole income', { exact: true }).waitFor();
    assert.ok((await page.getByText('+₦25,000', { exact: true }).count()) === 1);
    assert.equal(await page.getByText('+₦25,000.00', { exact: true }).count(), 0);
    await page.getByText('-₦2,500.75', { exact: true }).waitFor();
    await page.getByText('You owe ₦1,250.25', { exact: false }).waitFor();
    const inspect = page.getByText('Available', { exact: true }).locator('..').getByRole('button', { name: /^Inspect ≈₦17,499\./ });
    await inspect.waitFor();
    assert.match(await inspect.getAttribute('aria-label'), /Exact NGN amount: ₦17,499.25/);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: output + `/everyday-${width}.png`, fullPage: true });
    await inspect.focus();
    await page.keyboard.press('Enter');
    const detail = page.getByRole('dialog', { name: 'Amount details', exact: true });
    await detail.waitFor();
    await detail.getByText('Exact NGN amount: ₦17,499.25.', { exact: true }).waitFor();
    await page.keyboard.press('Tab');
    assert.ok(await detail.evaluate((n) => n.contains(document.activeElement)));
    await page.addScriptTag({ path: ROOT + '/node_modules/axe-core/axe.min.js' });
    const axe = await page.evaluate(async () => {
      const r = await window.axe.run('[role="dialog"]', {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact }));
    });
    assert.deepEqual(axe, []);
    evidence.accessibility.push({ width, amountDialogViolations: axe });
    if (width === 375 || width === 1440)
      await page.screenshot({ path: output + `/exact-details-${width}.png` });
    await page.keyboard.press('Escape');
    await detail.waitFor({ state: 'hidden' });
    // Radix restores focus after its asynchronous dialog close lifecycle.
    await page.waitForFunction(n => n === document.activeElement, await inspect.elementHandle(), {timeout:5000});
    assert.equal(await inspect.evaluate((n) => n === document.activeElement), true);
    const summaryAxe = await page.evaluate(async () => {
      const r = await window.axe.run('[data-money-presentation]', {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact }));
    });
    assert.deepEqual(summaryAxe, []);
    const box = await inspect.boundingBox();
    assert.ok(box.height >= 40);
    await page.getByRole('button', { name: 'Money entry', exact: true }).click();
    const amount = page.getByLabel('Amount (NGN)', { exact: true });
    await amount.waitFor();
    assert.equal(await amount.inputValue(), '');
    await amount.fill('2500');
    assert.equal(await amount.evaluate((n) => n.checkValidity()), true);
    await amount.fill('2500.75');
    assert.equal(await amount.inputValue(), '2500.75');
    assert.equal(await amount.evaluate((n) => n.checkValidity()), true);
    await amount.fill('2500.751');
    assert.equal(await amount.evaluate((n) => n.checkValidity()), false);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Budgets', exact: true }).click();
    const food = page.getByRole('article', { name: 'Food budget', exact: true });
    await food.getByText('₦2,500.75', { exact: true }).waitFor();
    await food.getByText('₦2,000', { exact: true }).waitFor();
    await food.getByText('−₦500.75', { exact: false }).waitFor();
    assert.match(await food.textContent(), /Over this limit/);
    if (width === 1440)
      await page.screenshot({ path: output + '/budgets-1440.png', fullPage: true });
    await food.getByRole('button', { name: 'Edit Food budget', exact: true }).click();
    let d = page.getByRole('dialog', { name: 'Set Food budget', exact: true });
    assert.equal(await d.getByLabel('Monthly limit (NGN)').inputValue(), '2000');
    await d.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Bills & subscriptions', exact: true }).click();
    const card = page.getByRole('article', { name: 'Synthetic whole bill bill', exact: true });
    await card.getByText('₦2,500', { exact: false }).first().waitFor();
    assert.ok(!(await card.textContent()).includes('₦2,500.00'));
    if (width === 1440) await page.screenshot({ path: output + '/bills-1440.png', fullPage: true });
    await card.getByRole('button', { name: 'Edit Synthetic whole bill', exact: true }).click();
    d = page.getByRole('dialog', { name: 'Edit bill', exact: true });
    assert.equal(await d.getByLabel('Expected amount (NGN)', { exact: true }).inputValue(), '2500');
    await d.getByRole('button', { name: 'Keep current plan', exact: true }).click();
    await page.getByRole('button', { name: '$ USD', exact: true }).click();
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await page.getByText('+≈ $15.63', { exact: true }).waitFor();
    await page
      .getByRole('button', { name: /^Inspect ≈ \$/ })
      .first()
      .click();
    d = page.getByRole('dialog', { name: 'Amount details', exact: true });
    await d.getByText('NGN remains canonical.', { exact: false }).waitFor();
    await d.getByRole('button', { name: 'Close details', exact: true }).click();
    await page.getByRole('button', { name: '₦ NGN', exact: true }).click();
    await page.getByRole('button', { name: 'CSV tools', exact: true }).click();
    const csv = page.getByTestId('csv-tools');
    await csv.getByRole('button', { name: 'Import CSV', exact: true }).click();
    d = page.getByRole('dialog', { name: 'Review a CSV statement', exact: true });
    await d
      .getByTestId('statement-file')
      .setInputFiles(ROOT + '/tests/fixtures/csv/synthetic-signed-ngn.csv');
    // Statement controls retain both zero and nonzero kobo. No confirmation/write.
    await d.getByRole('checkbox', { name: /I have checked that this statement/ }).check();
    await d.getByLabel('Statement source key', { exact: true }).fill('synthetic-issue35-review');
    await d.getByRole('button', { name: 'Select valid rows', exact: true }).click();
    assert.equal(await d.getByLabel('Amount NGN', { exact: true }).nth(0).inputValue(), '2500.25');
    assert.equal(await d.getByLabel('Amount NGN', { exact: true }).nth(1).inputValue(), '5000.00');
    await d.getByLabel('Amount NGN', { exact: true }).first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: output + `/statement-${width}.png` });
    await d.getByRole('button', { name: 'Cancel import', exact: true }).click();
    await csv.getByLabel('Export from', { exact: true }).fill('2026-10-01');
    await csv.getByLabel('Export through', { exact: true }).fill('2026-10-31');
    const downloading = page.waitForEvent('download');
    await csv.getByRole('button', { name: 'Export CSV', exact: true }).click();
    const download = await downloading;
    const exported = parseCsv(fs.readFileSync(await download.path(), 'utf8'), ',', 'archive');
    assert.ok(exported.rows.some((r) => r[2] === '2500.75'));
    assert.ok(exported.rows.some((r) => r[2] === '25000.00'));
    evidence.exports.push({
      width,
      count: exported.rows.length,
      exactAmounts: ['2500.75', '25000.00'],
    });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false);
    if (width === 1440) {
      const rocker = page.getByRole('switch', { name: /appearance active/ });
      if ((await rocker.getAttribute('aria-label')) === 'Dark appearance active')
        await rocker.click();
      await page.getByRole('switch', { name: 'Light appearance active', exact: true }).waitFor();
      await page.screenshot({ path: output + '/bright-statement-tools.png', fullPage: true });
      await page.getByRole('switch', { name: /appearance active/ }).click();
      await page.getByRole('switch', { name: 'Dark appearance active', exact: true }).waitFor();
    }
    assert.equal(
      snapshot(),
      before,
      'display, currency, modal inspection and export never mutate financial sources, budgets, bills, imported provenance or rewards',
    );
    evidence.widths.push(width);
    evidence.checks.push(
      `${width}: whole everyday amounts, precise fractional decisions and CSV, explicit approximation/exact keyboard disclosure, input precision, canonical USD switch, zero financial/source/reward mutations`,
    );
    await context.close();
    page = null;
  }
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
  clock(false);
}
