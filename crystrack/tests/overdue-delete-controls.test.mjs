import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('overdue goals are greyed and cannot be checked in', () => {
  const page = read('src/app/goals/page.tsx');
  const route = read('src/app/api/goals/[id]/checkins/route.ts');

  assert.match(page, /goalIsOverdue/);
  assert.match(page, /Deadline passed — check-ins closed/);
  assert.match(page, /!goalIsOverdue\(goal\) && checkInState\(goal\)\.due/);
  assert.match(route, /Goal deadline has passed; check-ins are closed/);
});

test('overdue assignments remain completable for September crystal rewards', () => {
  const page = read('src/app/assignments/page.tsx');
  const complete = read('src/app/api/assignments/[id]/complete/route.ts');

  assert.match(page, /const overdue = assignment\.computed_status === 'overdue'/);
  assert.match(page, /Ready to finish when you are/);
  assert.match(page, /aria-label=\{`Complete \$\{assignment.title\}`\}/);
  assert.doesNotMatch(complete, /completion is closed|status: 409/);
  assert.match(complete, /\.eq\('user_id', user\.id\)/);
});

test('task retirement preserves history; goal and assignment delete routes remain owner scoped', () => {
  const routes = [
    read('src/app/api/goals/[id]/route.ts'),
    read('src/app/api/assignments/[id]/route.ts'),
  ];

  for (const route of routes) {
    assert.match(route, /export async function DELETE/);
    assert.match(route, /\.eq\('user_id', user\.id\)/);
    assert.match(route, /\.from\('reminders'\)/);
  }

  assert.match(read('src/app/api/tasks/[taskId]/route.ts'), /rpc\('daily_retire_routine'/);
  assert.match(read('src/app/tasks/page.tsx'), /Your recorded history and today’s plan will be kept/);
  assert.match(read('src/app/goals/page.tsx'), /Delete goal permanently/);
  assert.match(read('src/app/assignments/page.tsx'), /Delete assignment permanently/);
});
