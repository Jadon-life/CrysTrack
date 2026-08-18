import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

test('top navigation follows the approved information architecture', () => {
  const nav = read('src/components/navigation/nav-items.tsx');
  for (const label of ['Today', 'Plan', 'Money', 'Insights', 'Calendar']) assert.match(nav, new RegExp(`label: '${label}'`));
  assert.doesNotMatch(nav, /label: 'Settings'/);
  const layout = read('src/components/layout/app-layout.tsx');
  assert.match(layout, /<TopNavigation/);
  assert.match(layout, /<EnvironmentBackground/);
});

test('adaptive environment uses real weather, solar phases, location and five responsive background states', () => {
  const environment = read('src/lib/environment.ts');
  assert.match(environment, /api\.open-meteo\.com/);
  assert.match(environment, /reverse-geocode-client/);
  for (const phase of ['morning', 'day', 'golden', 'evening', 'night']) assert.match(environment, new RegExp(`${phase}:`));
  assert.match(environment, /3840w/);
  const theme = read('src/lib/theme.ts');
  for (const color of ['#EA6113', '#F88F22', '#FBB931']) assert.match(theme, new RegExp(color));
});

test('glass surfaces preserve readability instead of blurring the full page', () => {
  const css = read('src/app/globals.css');
  assert.match(css, /\.crys-glass-card/);
  assert.match(css, /backdrop-filter: blur\(16px\)/);
  assert.match(css, /--theme-glass-tint/);
  assert.doesNotMatch(css, /environment-background__image[^}]*blur\(/s);
});

test('task accountability distinguishes completed, missed and skipped', () => {
  const migration = read('src/db/migrations/0002_adaptive_experience.sql');
  assert.match(migration, /task_status ADD VALUE IF NOT EXISTS 'skipped'/);
  assert.match(migration, /activity_type ADD VALUE IF NOT EXISTS 'task_skipped'/);
  assert.ok(existsSync(join(root, 'src/app/api/tasks/[taskId]/occurrences/[date]/skip/route.ts')));
  const history = read('src/app/history/page.tsx');
  assert.match(history, /Completed/);
  assert.match(history, /Missed/);
  assert.match(history, /Skipped/);
});

test('reminders are server-dispatched with DND, push, Telegram and delivery deduplication', () => {
  const dispatcher = read('src/app/api/reminders/dispatch/route.ts');
  assert.match(dispatcher, /CRON_SECRET/);
  assert.match(dispatcher, /VAPID_PRIVATE_KEY/);
  assert.match(dispatcher, /TELEGRAM_BOT_TOKEN/);
  assert.match(dispatcher, /isWithinDnd/);
  assert.match(dispatcher, /deliveryKey/);
  const sw = read('public/sw.js');
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /showNotification/);
});

test('goal intelligence is hybrid, structured and conservative with health evidence', () => {
  const groq = read('src/lib/ai/groq.ts');
  assert.match(groq, /json_schema/);
  assert.match(groq, /insufficient_evidence/);
  assert.match(groq, /Never invent measurements/);
  assert.match(groq, /fitness\/body\/weight\/health-related goals/);
  const analyzer = read('src/lib/goals/analyze-goal.ts');
  assert.match(analyzer, /numericProgress/);
  assert.match(analyzer, /deterministicGoalContext/);
});

test('PWA and production configuration are present', () => {
  assert.ok(existsSync(join(root, 'src/app/manifest.ts')));
  assert.ok(existsSync(join(root, 'public/sw.js')));
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.devDependencies['tailwindcss-animate'], '^1.0.7');
  assert.ok(existsSync(join(root, 'postcss.config.js')));
});
