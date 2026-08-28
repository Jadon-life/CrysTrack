import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd(); const read = (path) => readFileSync(join(root, path), 'utf8');

test('routine archive is a user-scoped soft archive', () => {
  const route = read('src/app/api/tasks/[taskId]/archive/route.ts');
  assert.match(route, /supabase\.auth\.getUser/);
  assert.match(route, /\.eq\('user_id', user\.id\)/);
  assert.match(route, /active:\s*false/);
  assert.doesNotMatch(route, /\.from\('recurring_tasks'\)\s*\.delete/);
});

test('day backgrounds use approved local adaptive WebP assets', () => {
  const env = read('src/lib/environment.ts');
  const midday = 'public/backgrounds/adaptive/05-midday-nature-terrace.webp';
  const afternoon = 'public/backgrounds/adaptive/06-afternoon-dubai.webp';
  assert.match(env, /src: '\/backgrounds\/adaptive\/05-midday-nature-terrace\.webp'/);
  assert.match(env, /src: '\/backgrounds\/adaptive\/06-afternoon-dubai\.webp'/);
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

test('scenic readability polish remains installed', () => {
  const css = read('src/app/globals.css');
  assert.match(css, /BEGIN CrysTrack scenic readability polish/);
});

test('tasks page still exposes the safe archive control', () => {
  const tasks = read('src/app/tasks/page.tsx');
  assert.match(tasks, /archiveTarget/);
  assert.match(tasks, /Archive routine/);
});
