import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('overdue goals retain recovery controls and cannot be checked in', () => {
  const page = read('src/app/goals/page.tsx');
  const route = read('src/app/api/goals/[id]/checkins/route.ts');

  assert.match(page, /goalIsOverdue/);
  assert.match(page, /Deadline passed — check-ins closed/);
  assert.match(page, /!goalIsOverdue\(goal\)\s*&&\s*checkInState\(goal\)\.due/);
  assert.match(route, /Goal deadline has passed; check-ins are closed/);
});

test('overdue assignments expose a finish action and one-tap resolution controls', () => {
  const page = read('src/app/assignments/page.tsx');
  const card = read('src/components/assignments/assignment-card.tsx');
  const complete = read('src/app/api/assignments/[id]/complete/route.ts');
  assert.match(page, /Finish Late/);
  assert.match(page, /Reschedule/);
  assert.match(page, /Drop/);
  assert.match(card, /onChange=\{onFinish\}/);
  assert.match(complete, /finish_academic_assignment/);
  assert.doesNotMatch(complete, /completion is closed/);
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
  assert.match(read('src/components/assignments/assignment-card.tsx'), /Delete assignment permanently/);
});
