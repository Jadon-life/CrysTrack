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
const { parseCsv, isLedgerArchive } = load('src/lib/csv/statement.ts');
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
const output = ROOT + '/.preview-test/csv';
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
try {
  localSql(
    "CREATE OR REPLACE FUNCTION crystrack_csv.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$SELECT '2026-10-19T12:00Z'::timestamptz$$",
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
  for (const width of [375, 430, 768, 1280, 1440]) {
    const email = 'csv-browser-' + randomUUID() + '@example.invalid',
      password = randomUUID() + 'Aa1!';
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Synthetic CSV Explorer' },
    });
    assert.equal(error, null);
    const uid = data.user.id;
    localSql(
      `INSERT INTO profiles(user_id,timezone,scheduling_timezone,display_name) VALUES('${uid}','Africa/Lagos','Africa/Lagos','Synthetic CSV Explorer')`,
    );
    const owner = (s) =>
      localSql(
        `BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${uid}","role":"authenticated"}';${s};COMMIT;`,
      );
    owner('SELECT sep28_crystal_state()');
    owner(
      `INSERT INTO money_entries(user_id,type,flow_kind,amount,date,source,category,note) VALUES('${uid}','expense','expense',2500.25,'2026-10-01T00:00:00+01','Synthetic lunch, campus','Food',NULL),('${uid}','income','income',1.01,'2026-10-02','=Synthetic formula','Other','Synthetic private note')`,
    );
    const count = (t) => scalar(`SELECT count(*) FROM ${t} WHERE user_id='${uid}'`);
    const base = scalar(
      `SELECT jsonb_agg(to_jsonb(t) ORDER BY id)::text FROM money_entries t WHERE user_id='${uid}' AND import_batch_id IS NULL`,
    );
    const crystals = JSON.parse(owner('SELECT sep28_crystal_state()').split('\n').at(-1)).total;
    const context = await browser.newContext({
      viewport: { width, height: 1050 },
      locale: 'en-GB',
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
          updatedAt: '2026-10-19T12:00Z',
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
    await page.getByRole('button', { name: 'CSV tools', exact: true }).click();
    const section = page.getByTestId('csv-tools');
    await section.getByRole('button', { name: 'Import CSV', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Review a CSV statement', exact: true });
    async function selectFile(name = 'synthetic-signed-ngn.csv') {
      await dialog
        .getByTestId('statement-file')
        .setInputFiles(ROOT + '/tests/fixtures/csv/' + name);
      await dialog.getByLabel('Statement source key', { exact: true }).fill('synthetic-current');
      await dialog.getByRole('heading', { name: 'Column mapping', exact: true }).waitFor();
      await dialog.getByRole('checkbox', { name: /I have checked that this statement/ }).check();
    }
    await selectFile();
    await dialog.getByLabel('Map date', { exact: true }).selectOption('');
    assert.equal(
      await dialog.getByRole('button', { name: 'Select valid rows', exact: true }).isDisabled(),
      true,
    );
    await dialog.getByLabel('Map date', { exact: true }).selectOption('0');
    await dialog.getByLabel('Map amount', { exact: true }).selectOption('7');
    assert.equal(
      await dialog.getByRole('button', { name: 'Select valid rows', exact: true }).isDisabled(),
      true,
    );
    await dialog.getByLabel('Map amount', { exact: true }).selectOption('2');
    async function reviewSelected() {
      await dialog.getByRole('button', { name: 'Select valid rows', exact: true }).click();
      const row2 = dialog.getByRole('article', { name: 'Statement row 2', exact: true });
      await row2.getByLabel('description', { exact: true }).fill('Synthetic corrected income');
      await row2.getByLabel('Category', { exact: true }).selectOption('Business');
      await dialog.getByRole('checkbox', { name: 'Include row 3', exact: true }).uncheck();
      await dialog.getByRole('button', { name: 'Check selected rows', exact: true }).click();
      await dialog
        .getByRole('heading', { name: 'Authoritative duplicate review', exact: true })
        .waitFor();
      assert.equal(
        await dialog.getByRole('button', { name: 'Confirm import', exact: true }).isDisabled(),
        true,
      );
      await dialog.getByRole('checkbox', { name: /Keep this intended transaction/ }).check();
      await dialog.getByRole('button', { name: 'Check selected rows', exact: true }).click();
      await dialog
        .getByRole('heading', { name: 'Authoritative duplicate review', exact: true })
        .waitFor();
    }
    await reviewSelected();
    assert.equal(count('money_entries'), '2');
    assert.equal(count('wealth_csv_batches'), '0');
    await page.addScriptTag({ path: ROOT + '/node_modules/axe-core/axe.min.js' });
    const a11y = await page.evaluate(async () => {
      const r = await window.axe.run('[role=dialog]', {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      });
      return {
        violations: r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target),
        })),
        manualReview: r.incomplete.map((v) => v.id),
      };
    });
    assert.deepEqual(a11y.violations, []);
    evidence.accessibility.push({ width, ...a11y });
    assert.ok(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.keyboard.press('Tab');
    assert.ok(await dialog.evaluate((el) => el.contains(document.activeElement)));
    await dialog.evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({ path: output + '/review-' + width + '.png', fullPage: false });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement?.id === 'csv-import-button');
    assert.equal(count('money_entries'), '2');
    await section.getByRole('button', { name: 'Import CSV', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Review a CSV statement', exact: true });
    await selectFile();
    await reviewSelected();
    await dialog.getByRole('checkbox', { name: /I reviewed every chosen row/ }).check();
    let captured = null,
      settle;
    const settled = new Promise((r) => (settle = r));
    if (width === 430 || width === 1440) {
      await page.route('**/api/wealth/csv/imports', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        captured = route.request().postDataJSON();
        try {
          const r = await route.fetch();
          assert.equal(r.status(), 200);
          await route.abort('failed');
        } finally {
          settle();
        }
      });
    }
    await dialog.getByRole('button', { name: 'Confirm import', exact: true }).click();
    if (width === 430 || width === 1440) {
      await settled;
      await page.unroute('**/api/wealth/csv/imports');
      await dialog.getByRole('button', { name: 'Retry exact import', exact: true }).waitFor();
      assert.equal(count('money_entries'), '4');
      const saved = await page.evaluate(() => Object.entries(sessionStorage));
      assert.ok(
        saved.some(([k, v]) => k.startsWith('crystrack-csv-pending:') && v === captured.batchId),
      );
      assert.ok(!JSON.stringify(saved).includes('Synthetic lunch'));
      if (width === 430) {
        await page.reload();
        await page.getByRole('button', { name: 'CSV tools', exact: true }).click();
        await section.getByRole('button', { name: 'Check import receipt', exact: true }).click();
      } else await dialog.getByRole('button', { name: 'Retry exact import', exact: true }).click();
    }
    await section
      .getByRole('status')
      .filter({ hasText: 'Confirmed import: 2 transactions' })
      .waitFor();
    assert.equal(count('money_entries'), '4');
    assert.equal(count('wealth_csv_batches'), '1');
    assert.equal(count('wealth_csv_rows'), '2');
    assert.equal(
      JSON.parse(owner('SELECT sep28_crystal_state()').split('\n').at(-1)).total,
      crystals,
    );
    assert.equal(
      scalar(
        `SELECT jsonb_agg(to_jsonb(t) ORDER BY id)::text FROM money_entries t WHERE user_id='${uid}' AND import_batch_id IS NULL`,
      ),
      base,
    );
    if (captured) {
      const replay = await page.request.post(origin + '/api/wealth/csv/imports', {
        data: captured,
      });
      assert.equal(replay.status(), 200);
      assert.equal(count('money_entries'), '4');
      const bad = await page.request.post(origin + '/api/wealth/csv/imports', {
        data: { ...captured, user_id: 'forged' },
      });
      assert.equal(bad.status(), 400);
    }
    await section.getByRole('button', { name: 'Import CSV', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Review a CSV statement', exact: true });
    await selectFile();
    await dialog.getByRole('button', { name: 'Select valid rows', exact: true }).click();
    await dialog.getByRole('checkbox', { name: 'Include row 3', exact: true }).uncheck();
    await dialog.getByRole('button', { name: 'Check selected rows', exact: true }).click();
    await dialog.getByText('2 blocked duplicates', { exact: false }).waitFor();
    assert.equal(
      await dialog.getByRole('button', { name: 'Confirm import', exact: true }).isDisabled(),
      true,
    );
    await dialog.getByRole('button', { name: 'Cancel import', exact: true }).click();
    if (width === 1440) {
      localSql(
        `INSERT INTO money_entries(user_id,type,flow_kind,amount,date,source,category) SELECT '${uid}','income','income',0.01,'2026-10-03','Synthetic complete export','Other' FROM generate_series(1,2001)`,
      );
    }
    await section.getByLabel('Export from', { exact: true }).fill('2026-10-01');
    await section.getByLabel('Export through', { exact: true }).fill('2026-10-31');
    if (width === 1280)
      await section
        .getByRole('checkbox', { name: 'Include private notes in my download', exact: true })
        .check();
    const downloading = page.waitForEvent('download');
    await section.getByRole('button', { name: 'Export CSV', exact: true }).click();
    const download = await downloading;
    assert.equal(download.suggestedFilename(), 'crystrack-ledger-2026-10-01-2026-10-31.csv');
    const bytes = fs.readFileSync(await download.path()),
      csv = bytes.toString('utf8'),
      opened = parseCsv(csv, ',', 'archive');
    assert.equal(opened.rows.length, width === 1440 ? 2005 : 4);
    assert.ok(isLedgerArchive(opened.headers));
    assert.ok(csv.includes("'=Synthetic formula"));
    assert.equal(csv.includes('Synthetic private note'), width === 1280);
    assert.ok(opened.rows.every((r) => r[3] === 'NGN'));
    evidence.exports.push({
      width,
      count: opened.rows.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      notes: width === 1280,
    });
    if (width === 375) {
      await section.getByRole('button', { name: 'Import CSV', exact: true }).click();
      dialog = page.getByRole('dialog', { name: 'Review a CSV statement', exact: true });
      await selectFile('synthetic-debit-credit-ngn.csv');
      assert.equal(
        await dialog.getByRole('button', { name: 'Select valid rows', exact: true }).isDisabled(),
        false,
      );
      assert.match(await dialog.getByRole('status').textContent(), /0 valid/);
      await dialog.getByLabel('Date convention', { exact: true }).selectOption('dmy');
      await dialog.getByRole('button', { name: 'Select valid rows', exact: true }).click();
      assert.match(await dialog.getByRole('status').textContent(), /2 chosen/);
      await dialog.getByRole('button', { name: 'Cancel import', exact: true }).click();
      assert.equal(count('money_entries'), '4');
    }
    await page.addScriptTag({ path: ROOT + '/node_modules/axe-core/axe.min.js' });
    const sectionAxe = await page.evaluate(async () => {
      const r = await window.axe.run('[data-testid="csv-tools"]', {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact }));
    });
    assert.deepEqual(sectionAxe, []);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: output + '/confirmed-' + width + '.png', fullPage: true });
    if (width === 1440) {
      const rocker = page.getByRole('switch', { name: /appearance active/ });
      if ((await rocker.getAttribute('aria-label')) === 'Dark appearance active')
        await rocker.click();
      await page.getByRole('switch', { name: 'Light appearance active', exact: true }).waitFor();
      await page.clock.setSystemTime(new Date('2026-10-19T16:00Z'));
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForFunction(() => document.documentElement.dataset.phase === 'day');
      await page.waitForFunction(() => {
        const i = document.querySelector('.environment-stability-image');
        return i?.complete && i.naturalWidth > 0;
      });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: output + '/csv-light-bright.png', fullPage: true });
      evidence.brightContrast = await page.evaluate(() => {
        const s = document.querySelector('[data-testid="csv-reading-surface"]'),
          rgba = (x) => x.match(/[\d.]+/g).map(Number),
          b = rgba(getComputedStyle(s).backgroundColor),
          a = b[3] ?? 1,
          bg = b.slice(0, 3).map((v) => v * a + 255 * (1 - a)),
          lum = (rgb) =>
            rgb
              .map((v) => {
                v /= 255;
                return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
              })
              .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
        return ['h2', 'p', 'button'].map((q) => {
          const x = lum(rgba(getComputedStyle(s.querySelector(q)).color)),
            y = lum(bg);
          return { selector: q, ratio: (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) };
        });
      });
      assert.ok(evidence.brightContrast.every((v) => v.ratio >= 4.5));
      await rocker.click();
      await page.getByRole('switch', { name: 'Dark appearance active', exact: true }).waitFor();
    }
    evidence.widths.push(width);
    evidence.checks.push(
      width +
        ': real local sign-in, mapping/balance denial, correction/category/exclusion, duplicate acknowledgement, cancel zero writes, explicit atomic confirmation, protected replay/refresh, no extra shards/old changes, export and reopen, keyboard/focus/axe/overflow',
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
  localSql(
    "CREATE OR REPLACE FUNCTION crystrack_csv.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$SELECT clock_timestamp()$$",
  );
}
