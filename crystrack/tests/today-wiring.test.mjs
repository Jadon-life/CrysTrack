import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Today uses its existing toggle and skip APIs without truncating the scheduled list', () => {
  const src = fs.readFileSync('src/app/page.tsx', 'utf8');
  assert.doesNotMatch(src, /todayTasks\.slice\(0,\s*7\)/);
  assert.match(src, /todayGroups\.map/);
  assert.match(src, /changeTask\(task, 'toggle'\)/);
  assert.match(src, /changeTask\(task, 'skip'\)/);
  assert.match(src, /undoLastTaskAction/);
  assert.match(src, /const progress = summarizeToday\(tasks\)/);
  assert.match(src, /role="img"/);
  assert.match(src, /aria-pressed/);
});

test('Today obtains profile timezone and keeps finance APIs unchanged', () => {
  const src = fs.readFileSync('src/app/page.tsx', 'utf8');
  assert.match(src, /fetcher\('\/api\/profile'\)/);
  assert.match(src, /dayInTimezone\(timezone\)/);
  assert.match(src, /dueSoonAssignments\(assignments\)/);
  assert.match(src, /href=\{href\}/);
  assert.match(src, /Daily reminder/);
  assert.doesNotMatch(src, /👋/);
});
