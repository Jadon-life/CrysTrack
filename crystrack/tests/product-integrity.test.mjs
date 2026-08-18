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

test('dashboard and insights no longer ship demo data', () => {
  const today = read('src/components/dashboard/today-view.tsx');
  const rightRail = read('src/components/dashboard/right-rail.tsx');
  const insights = read('src/app/api/insights/route.ts');

  assert.equal(today.includes('demoItems'), false);
  assert.equal(rightRail.includes('Learn JavaScript'), false);
  assert.equal(rightRail.includes('Emergency Fund'), false);
  assert.equal(insights.includes('You completed 12 tasks'), false);
});

test('tasks bind checkbox and streak to real API state', () => {
  const tasks = read('src/app/tasks/page.tsx');
  assert.equal(tasks.includes('checked={false}'), false);
  assert.equal(tasks.includes('0 day streak'), false);
  assert.equal(tasks.includes('task.today_status'), true);
  assert.equal(tasks.includes('task.streak'), true);
});

test('tailwind stat surfaces are statically discoverable', () => {
  const stats = read('src/components/dashboard/quick-stats.tsx');
  assert.equal(stats.includes('bg-${'), false);
  assert.equal(stats.includes('surfaceClass'), true);
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

test('authenticated app shell no longer runs the 3D background globally', () => {
  const layout = read('src/components/layout/app-layout.tsx');
  const uses = layout.match(/<ThreeBackground \/>/g) || [];
  assert.equal(uses.length, 1, 'ThreeBackground should be limited to the auth experience');
  assert.equal(layout.includes('<EnvironmentBackground />'), true);
});

test('database repair supplies required integrity primitives', () => {
  const migration = read('src/db/migrations/0001_product_integrity.sql');
  assert.equal(migration.includes('task_occurrence_task_date_unique'), true);
  assert.equal(migration.includes('goal_insight_user_isolation'), true);
  assert.equal(migration.includes('FUNCTION increment_target'), true);
});
