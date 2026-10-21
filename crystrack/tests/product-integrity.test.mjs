import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = (relative) => path.join(root, relative);
const read = (relative) => fs.readFileSync(file(relative), 'utf8');

const requiredRoutes = [
  'src/app/api/tasks/[taskId]/occurrences/[date]/toggle/route.ts',
  'src/app/api/assignments/[id]/complete/route.ts',
  'src/app/api/goals/[id]/checkins/route.ts',
  'src/app/api/finance/targets/route.ts',
  'src/app/api/finance/entries/route.ts',
];

test('all UI mutation endpoints exist', () => {
  for (const route of requiredRoutes) assert.equal(fs.existsSync(file(route)), true, `${route} is missing`);
});

test('active Today dashboard and insights do not ship demo data', () => {
  const today = read('src/app/page.tsx');
  const insights = read('src/app/api/insights/route.ts');

  assert.equal(today.includes('demoItems'), false);
  assert.equal(today.includes('const summary ='), true);
  assert.equal(today.includes('summary.map'), true);
  assert.equal(insights.includes('You completed 12 tasks'), false);
});

test('tasks bind checkbox and streak to real API state', () => {
  const tasks = read('src/app/tasks/page.tsx');
  assert.equal(tasks.includes('checked={false}'), false);
  assert.equal(tasks.includes('0 day streak'), false);
  assert.equal(tasks.includes('task.today_status'), true);
  assert.equal(tasks.includes('task.streak'), true);
});

test('active Today stat surfaces use discoverable Tailwind classes', () => {
  const today = read('src/app/page.tsx');
  assert.equal(today.includes('tone: \'text-'), true);
  assert.equal(today.includes('bg-${'), false);
  assert.equal(today.includes('<GlassCard key={label}'), true);
});

test('retired dashboard components are not part of the application', () => {
  for (const name of ['focus-timer', 'today-view', 'right-rail', 'quick-stats', 'quick-capture']) {
    assert.equal(fs.existsSync(file(`src/components/dashboard/${name}.tsx`)), false, `Legacy component still present: ${name}`);
  }
});

test('navigation follows the consolidated product model', () => {
  const nav = read('src/components/navigation/nav-items.tsx');
  for (const label of ["'Today'", "'Plan'", "'Wealth'", "'Insights'", "'Calendar'"]) {
    assert.equal(nav.includes(label), true, `Missing navigation label ${label}`);
  }
  assert.equal(nav.includes("label: 'Tasks'"), false);
  assert.equal(nav.includes("label: 'Assignments'"), false);
  assert.equal(nav.includes("label: 'Settings'"), false);
});

test('authenticated app shell fully retires the 3D background', () => {
  const layout = read('src/components/layout/app-layout.tsx');
  const uses = layout.match(/<ThreeBackground \/>/g) || [];
  assert.equal(uses.length, 0, 'ThreeBackground should be fully retired from the app shell');
  assert.equal(layout.includes('<EnvironmentBackground />'), true);
});

test('database repair supplies required integrity primitives', () => {
  const migration = read('src/db/migrations/0001_product_integrity.sql');
  assert.equal(migration.includes('task_occurrence_task_date_unique'), true);
  assert.equal(migration.includes('goal_insight_user_isolation'), true);
  assert.equal(migration.includes('FUNCTION increment_target'), true);
});
