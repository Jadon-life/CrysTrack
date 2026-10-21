import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('src/lib/today-progress.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  reportDiagnostics: true,
});
assert.deepEqual(compiled.diagnostics || [], []);
const { dayInTimezone, summarizeToday, nextTodayTaskStatus, groupTodayTasks, dueSoonAssignments } =
  await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(compiled.outputText));

test('saved-timezone date wins over device/server clock near midnight', () => {
  const instant = new Date('2026-10-17T23:55:00Z');
  assert.deepEqual(dayInTimezone('Africa/Lagos', instant), { dateKey: '2026-10-18', weekday: 0 });
  assert.deepEqual(dayInTimezone('America/Los_Angeles', instant), { dateKey: '2026-10-17', weekday: 6 });
  assert.deepEqual(dayInTimezone('UTC', instant), { dateKey: '2026-10-17', weekday: 6 });
});

test('task totals are correct with skips and an empty schedule', () => {
  assert.deepEqual(summarizeToday([]), { total: 0, completed: 0, skipped: 0, remaining: 0, percent: 0, allDone: false });
  assert.deepEqual(summarizeToday([
    { id: '1', scheduled_today: true, today_status: 'completed' },
    { id: '2', scheduled_today: true, today_status: 'skipped' },
    { id: '3', scheduled_today: true, today_status: 'pending' },
    { id: '4', scheduled_today: false, today_status: 'completed' },
  ]), { total: 3, completed: 1, skipped: 1, remaining: 1, percent: 33, allDone: false });
  assert.equal(summarizeToday(Array.from({ length: 20 }, (_, i) => ({ id: String(i), scheduled_today: true, today_status: 'completed' }))).allDone, true);
});

test('completion and deliberate skip reverse safely', () => {
  assert.equal(nextTodayTaskStatus('pending', 'toggle'), 'completed');
  assert.equal(nextTodayTaskStatus('completed', 'toggle'), 'pending');
  assert.equal(nextTodayTaskStatus('pending', 'skip'), 'skipped');
  assert.equal(nextTodayTaskStatus('skipped', 'skip'), 'pending');
  assert.equal(nextTodayTaskStatus('skipped', 'toggle'), null);
  assert.equal(nextTodayTaskStatus('completed', 'skip'), null);
  assert.equal(nextTodayTaskStatus('missed', 'toggle'), null);
});

test('all scheduled tasks appear, grouped by time and sorted within groups', () => {
  const tasks = Array.from({ length: 20 }, (_, i) => ({
    id: String(i),
    title: 'Task ' + i,
    preferred_time: i % 4 === 0 ? null : i % 4 === 1 ? '18:00' : i % 4 === 2 ? '08:00' : '14:30',
  }));
  const groups = groupTodayTasks(tasks);
  assert.deepEqual(groups.map((g) => g.label), ['Morning', 'Afternoon', 'Evening', 'Anytime']);
  assert.equal(groups.reduce((sum, group) => sum + group.tasks.length, 0), 20);
  assert.equal(new Set(groups.flatMap((group) => group.tasks.map((task) => task.id))).size, 20);
});

test('upcoming work only includes due-soon or overdue items, earliest first', () => {
  const data = [
    { deadline: '2026-11-11T00:00:00Z', computed_status: 'upcoming' },
    { deadline: '2026-10-19T00:00:00Z', computed_status: 'due_soon' },
    { deadline: '2026-10-17T00:00:00Z', computed_status: 'overdue' },
    { deadline: '2026-10-18T00:00:00Z', computed_status: 'due_today' },
  ];
  assert.deepEqual(dueSoonAssignments(data).map((d) => d.computed_status), ['overdue', 'due_today', 'due_soon']);
});
