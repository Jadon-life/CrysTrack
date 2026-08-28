import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd(); const read = (path) => readFileSync(join(root, path), 'utf8');

test('dashboard remains the compact production dashboard', () => {
  const dashboard = read('src/app/page.tsx');
  for (const marker of ["Today&apos;s plan",'Goal check-ins','Wealth Overview','Assignments & reminders','Today note','Recent activity','MiniCalendar']) assert.match(dashboard, new RegExp(marker));
  assert.doesNotMatch(dashboard, /dashboard-bottom-rail/);
});

test('previous CrysTrack logo remains restored', () => {
  const navigation = read('src/components/navigation/top-navigation.tsx');
  assert.match(navigation, /Diamond/);
  assert.match(navigation, /topnav-brandmark/);
});

test('adaptive background uses the static eight-scene stability renderer', () => {
  const environment = read('src/lib/environment.ts');
  assert.match(environment, /ENVIRONMENT_BACKGROUND_POOL/);
  assert.match(environment, /slotStartMinute: 1230/);
  const component = read('src/components/layout/environment-background.tsx');
  assert.match(component, /selectEnvironmentBackground\(environment, new Date\(clock\)\)/);
  assert.match(component, /data-background-rotation="8-photo-static-v10"/);
  assert.doesNotMatch(component, /pointermove|environment-background__scene|new Image\(|setInterval/);
});

test('routine schedule area keeps dedicated readability treatment', () => {
  const tasks = read('src/app/tasks/page.tsx');
  const css = read('src/app/globals.css');
  assert.match(tasks, /routine-readable-section/);
  assert.match(css, /\.routine-readable-section/);
});

test('Wealth backend remains real, not hardcoded', () => {
  const dashboard = read('src/app/page.tsx');
  assert.match(dashboard, /fetcher\('\/api\/wealth'\)/);
  assert.match(dashboard, /wealthSummary\.availableBalance/);
  assert.doesNotMatch(dashboard, /availableBalance:\s*0/);
});
