import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

test('top navigation follows the approved information architecture', () => {
  const nav = read('src/components/navigation/nav-items.tsx');
  for (const label of ['Today', 'Plan', 'Wealth', 'Insights', 'Calendar']) assert.match(nav, new RegExp(`label: '${label}'`));
  for (const label of ['Tasks','Goals','Assignments','Settings']) assert.match(nav,new RegExp("label: '"+label+"'"));
  const layout = read('src/components/layout/app-layout.tsx');
  assert.match(layout, /<FloatingAppShell/);
  assert.match(read('src/components/workspace/floating-app-shell.tsx'), /<TopNavigation/);
  assert.match(layout, /<EnvironmentBackground/);
});

test('environment keeps local scenes while live weather and location services remain enabled', () => {
  const environment = read('src/lib/environment.ts');
  assert.match(environment, /api\.open-meteo\.com\/v1\/forecast/);
  assert.match(environment, /reverse-geocode-client|bigdatacloud/i);
  assert.match(environment, /export async function loadEnvironment/);
  assert.match(environment, /fallbackEnvironment\(\)/);
  for (const phase of ['morning', 'day', 'golden', 'evening', 'night']) assert.match(environment, new RegExp(`'${phase}'`));
  for (const minute of [0,300,390,540,750,960,1110,1230]) assert.match(environment, new RegExp(`slotStartMinute: ${minute}`));
  assert.doesNotMatch(environment, /\/api\/backgrounds\//);
  const theme = read('src/lib/theme.ts');
  for (const color of ['#EA6113', '#F88F22', '#FBB931']) assert.match(theme, new RegExp(color));
});

test('glass surfaces remain while the actual background image is explicitly unblurred', () => {
  const css = read('src/app/globals.css');
  const renderer = read('src/components/layout/environment-background.tsx');
  assert.match(css, /\.crys-glass-card/);
  assert.match(css, /backdrop-filter: blur\(16px\)/);
  assert.match(css, /--theme-glass-tint/);
  assert.match(renderer, /filter: 'none'/);
  assert.match(renderer, /transform: 'none'/);
});

test('task accountability distinguishes completed, missed and skipped', () => {
  const migration = read('src/db/migrations/0002_adaptive_experience.sql');
  assert.match(migration, /task_status ADD VALUE IF NOT EXISTS 'skipped'/);
  assert.match(migration, /activity_type ADD VALUE IF NOT EXISTS 'task_skipped'/);
  assert.ok(existsSync(join(root, 'src/app/api/tasks/[taskId]/occurrences/[date]/skip/route.ts')));
});

test('reminders remain server-dispatched with delivery safeguards', () => {
  const dispatcher = read('src/app/api/reminders/dispatch/route.ts');
  assert.match(dispatcher, /CRON_SECRET/);
  assert.match(dispatcher, /deliveryKey/);
  assert.match(dispatcher, /MAX_DELIVERY_ATTEMPTS/);
  const sw = read('public/sw.js');
  assert.match(sw, /addEventListener\('push'/);
});

test('goal intelligence remains intact', () => {
  const provider = read('src/lib/ai/goal-openrouter.ts');
  assert.match(provider, /json_schema/);
  assert.match(provider, /insufficient_evidence/);
  const analyzer = read('src/lib/goals/analyze-goal.ts');
  assert.match(analyzer, /numericProgress/);
});

test('PWA and production configuration remain present', () => {
  assert.ok(existsSync(join(root, 'src/app/manifest.ts')));
  assert.ok(existsSync(join(root, 'public/sw.js')));
  assert.ok(existsSync(join(root, 'postcss.config.js')));
});

test('dashboard greeting follows local clock rather than solar phase', () => {
  const dashboard = read('src/app/page.tsx');

  assert.match(
    dashboard,
    /function greetingForLocalTime\(localTime: string\)/,
  );

  assert.match(
    dashboard,
    /localTime\.slice\(11,\s*13\)/,
  );

  assert.match(
    dashboard,
    /hour >= 5 && hour < 12/,
  );

  assert.match(
    dashboard,
    /hour >= 12 && hour < 17/,
  );

  assert.match(
    dashboard,
    /hour >= 17 && hour < 21/,
  );

  assert.match(
    dashboard,
    /localClock\(new Date\(\),\s*data.timezone\)/,
  );

  assert.doesNotMatch(
    dashboard,
    /greetingForPhase\(environment\.phase\)/,
  );
});
