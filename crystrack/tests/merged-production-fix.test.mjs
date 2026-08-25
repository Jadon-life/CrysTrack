import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

test('routine archive is a user-scoped soft archive', () => {
  const route = read('src/app/api/tasks/[taskId]/archive/route.ts');
  assert.match(route, /supabase\.auth\.getUser/);
  assert.match(route, /\.eq\('user_id', user\.id\)/);
  assert.match(route, /active:\s*false/);
  assert.match(route, /archived_at:\s*archivedAt/);
  assert.doesNotMatch(route, /\.from\('recurring_tasks'\)\s*\.delete/);
});

test('day backgrounds use bundled local adaptive assets', () => {
  const env = read('src/lib/environment.ts');
  const midday = 'public/backgrounds/adaptive/06-midday-green-hills.jpg';
  const afternoon = 'public/backgrounds/adaptive/07-afternoon-dubai.jpg';

  assert.match(env, /src: '\/backgrounds\/adaptive\/06-midday-green-hills\.jpg'/);
  assert.match(env, /src: '\/backgrounds\/adaptive\/07-afternoon-dubai\.jpg'/);
  assert.ok(existsSync(join(root, midday)));
  assert.ok(existsSync(join(root, afternoon)));
});

test('fallback phase ranges remain unchanged', () => {
  const env = read('src/lib/environment.ts');
  assert.match(env, /hour >= 5 && hour < 10/);
  assert.match(env, /hour >= 10 && hour < 16/);
  assert.match(env, /hour >= 16 && hour < 18/);
  assert.match(env, /hour >= 18 && hour < 21/);
});

test('scenic readability polish is installed', () => {
  const css = read('src/app/globals.css');
  const dashboard = read('src/app/page.tsx');
  const tasks = read('src/app/tasks/page.tsx');
  assert.match(css, /BEGIN CrysTrack scenic readability polish/);
  assert.match(dashboard, /scenic-readable-copy/);
  assert.match(tasks, /scenic-readable-copy/);
  assert.match(tasks, /scenic-readable-strip/);
});

test('tasks page exposes the safe archive control', () => {
  const tasks = read('src/app/tasks/page.tsx');
  assert.match(tasks, /archiveTarget/);
  assert.match(tasks, /Archive routine/);
  assert.match(tasks, /Your completion history will be preserved/);
  assert.match(tasks, /\/api\/tasks\/\$\{archiveTarget\.id\}\/archive/);
});
