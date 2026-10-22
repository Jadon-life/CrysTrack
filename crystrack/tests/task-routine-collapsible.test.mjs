import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('All routines management is a collapsed-by-default, keyboard-accessible disclosure', () => {
  const source = fs.readFileSync('src/app/tasks/page.tsx', 'utf8');
  assert.match(source, /<details className="group overflow-hidden/);
  assert.match(source, /<summary className="flex min-h-16/);
  assert.match(source, /All routines/);
  assert.match(source, /group-open:rotate-180/);
  assert.doesNotMatch(source, /<details[^>]+open(?:\s|>|=)/);
});

test('archive, delete, and day filters remain in the expanded management area', () => {
  const source = fs.readFileSync('src/app/tasks/page.tsx', 'utf8');
  const start = source.indexOf('<summary className="flex min-h-16');
  const end = source.indexOf('</details>', start);
  assert.ok(start >= 0 && end > start, 'Routines disclosure exists');
  const contents = source.slice(start, end);
  assert.match(contents, /setFilterDay/);
  assert.match(contents, /filteredTasks\.map/);
  assert.match(contents, /setArchiveTarget\(task\)/);
  assert.match(contents, /void deleteTask\(task\)/);
  assert.match(source, /<Button variant="primary" onClick=\{\(\) => setShowCreate\(true\)\}/);
});

test('Tasks uses the compact Today checklist and keeps scheduling separate', () => {
  const source = fs.readFileSync('src/app/tasks/page.tsx', 'utf8');
  assert.match(source, /groupTodayTasks\(todayTasks\)/);
  assert.match(source, /summarizeToday\(tasks\)/);
  assert.match(source, /todayGroups\.map/);
  assert.match(source, /max-h-\[34rem\]/);
  assert.match(source, /All scheduled routines are complete/);
  assert.match(source, /toggleTaskCompletion\(task\.id\)/);
  assert.match(source, /toggleTaskSkip\(task\.id\)/);
  assert.match(source, /task\.streak/);
  assert.match(source, /aria-label=\{task\.today_status/);
});

test('newly created routines appear immediately without rewriting today\'s frozen plan', () => {
  const source = fs.readFileSync('src/app/tasks/page.tsx', 'utf8');
  assert.match(source, /function createdOnDay\(iso: string, timezone: string, dayKey: string\)/);
  assert.match(source, /Intl\.DateTimeFormat\('en-US',/);
  assert.match(source, /timeZone: timezone/);
  assert.match(source, /const newlyCreated = useMemo/);
  assert.match(source, /!task\.scheduled_today && task\.created_at/);
  assert.match(source, /createdOnDay\(task\.created_at, task\.scheduling_timezone \|\| 'UTC', schedulingDay\)/);
  assert.match(source, /setTaskView\('today'\);\s*await loadTasks\(\);/);
  assert.match(source, /newlyCreated\.map\(\(task: any\)/);
  assert.match(source, /Routines added today/);
  assert.match(source, /They start on their next matching scheduled day/);
  assert.ok(source.indexOf('Routines added today') < source.indexOf('<section className="routine-readable-section">'),
    'Saved routines are presented before the collapsed management disclosure');
  assert.match(source, /const todayTasks = useMemo\(\s*\(\) => tasks\.filter\(\(task: any\) => task\.scheduled_today\)/);
  assert.match(source, /summarizeToday\(tasks\)/);
});
