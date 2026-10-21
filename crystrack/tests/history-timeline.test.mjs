import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('src/lib/history-timeline.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  reportDiagnostics: true,
});
assert.deepEqual(compiled.diagnostics || [], []);
const { groupHistoryByMonth, eventDateKey } =
  await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(compiled.outputText));

const record = (id, date, entity_type = 'goal', extra = {}) => ({
  id, created_at: date, entity_type, type: entity_type + '_updated', metadata_json: extra,
});

test('History groups by month then day in reverse date order, retaining all records', () => {
  const data = [
    record('jan', '2026-01-05T17:00:00Z'),
    record('oct15', '2026-10-15T10:00:00Z'),
    record('oct16', '2026-10-16T10:00:00Z'),
    record('feb', '2026-02-28T17:00:00Z'),
    record('oct16-2', '2026-10-16T09:00:00Z'),
  ];
  const grouped = groupHistoryByMonth(data, 'UTC');
  assert.deepEqual(grouped.map((month) => month.key), ['2026-10', '2026-02', '2026-01']);
  assert.deepEqual(grouped[0].days.map((day) => day.key), ['2026-10-16', '2026-10-15']);
  assert.equal(grouped[0].count, 3);
  assert.deepEqual(grouped[0].days[0].items.map((item) => item.id), ['oct16', 'oct16-2']);
  assert.equal(grouped.reduce((count, month) => count + month.count, 0), data.length);
});

test('History respects user timezone and task scheduled day', () => {
  const atMidnight = record('late', '2026-10-17T23:30:00Z');
  assert.equal(eventDateKey(atMidnight, 'Africa/Lagos'), '2026-10-18');
  assert.equal(eventDateKey(atMidnight, 'America/Los_Angeles'), '2026-10-17');
  const task = record('done', '2026-10-18T00:01:00Z', 'task', { date: '2026-10-17' });
  assert.equal(eventDateKey(task, 'Africa/Lagos'), '2026-10-17');
});

test('Invalid timestamps remain visible in an unknown-date section', () => {
  const result = groupHistoryByMonth([record('x', 'invalid'), record('y', '2026-08-01T13:00:00Z')], 'UTC');
  assert.equal(result.reduce((sum, month) => sum + month.count, 0), 2);
  assert.equal(result[1].key, 'unknown');
});
