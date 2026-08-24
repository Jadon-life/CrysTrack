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

test('overdue assignments have no completion checkbox', () => {
  const page = read('src/app/assignments/page.tsx');
  const complete = read('src/app/api/assignments/[id]/complete/route.ts');

  assert.match(page, /const overdue = assignment\.computed_status === 'overdue'/);
  assert.match(page, /Deadline passed — completion closed/);
  assert.match(complete, /Assignment deadline has passed; completion is closed/);
});

test('task, goal and assignment permanent delete routes exist', () => {
  const routes = [
    read('src/app/api/tasks/[taskId]/route.ts'),
    read('src/app/api/goals/[id]/route.ts'),
    read('src/app/api/assignments/[id]/route.ts'),
  ];

  for (const route of routes) {
    assert.match(route, /export async function DELETE/);
    assert.match(route, /\.eq\('user_id', user\.id\)/);
    assert.match(route, /\.from\('reminders'\)/);
  }

  assert.match(read('src/app/tasks/page.tsx'), /Delete task permanently/);
  assert.match(read('src/app/goals/page.tsx'), /Delete goal permanently/);
  assert.match(read('src/app/assignments/page.tsx'), /Delete assignment permanently/);
});
