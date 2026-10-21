import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const compile = (path, dependencies = {}) => {
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'module', 'exports', compiled)(
    (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
    module, module.exports,
  );
  return module.exports;
};
const today = compile('src/lib/today-progress.ts');
const { calendarDeadlineDay } = compile('src/lib/calendar-date.ts', { './today-progress': today });

test('deadline instants resolve to the owner scheduling day at opposite UTC boundaries', () => {
  assert.deepEqual(today.dayInTimezone('Africa/Lagos', new Date('2026-10-21T23:30:00Z')), { dateKey: '2026-10-22', weekday: 4 });
  assert.deepEqual(today.dayInTimezone('America/Los_Angeles', new Date('2026-10-21T23:30:00Z')), { dateKey: '2026-10-21', weekday: 3 });
  assert.equal(calendarDeadlineDay('2026-10-21T23:30:00Z', 'Africa/Lagos'), '2026-10-22');
  assert.equal(calendarDeadlineDay('2026-10-21T23:30:00Z', 'America/Los_Angeles'), '2026-10-21');
  assert.equal(calendarDeadlineDay('2026-01-01T00:30:00+00:00', 'America/New_York'), '2025-12-31');
});

test('date-only deadlines retain the civil date, rather than shifting from UTC midnight', () => {
  assert.equal(calendarDeadlineDay('2026-10-21', 'America/Los_Angeles'), '2026-10-21');
  assert.equal(calendarDeadlineDay('2026-10-21', 'Pacific/Auckland'), '2026-10-21');
  assert.equal(calendarDeadlineDay('2026-02-30', 'Africa/Lagos'), null);
  assert.equal(calendarDeadlineDay('2026-13-01', 'Africa/Lagos'), null);
});

test('malformed and offset-less timestamps fail closed rather than use browser timezone', () => {
  for (const input of [null, undefined, '', 'not-a-date', '2026-10-21T23:30:00', '2026-10-21T23:30:00foo', '2026-02-30T99:00:00Z']) {
    assert.equal(calendarDeadlineDay(input, 'Africa/Lagos'), null);
  }
});

test('calendar requests authoritative saved timezone before task read; deadlines share that zone', () => {
  const source = fs.readFileSync('src/app/calendar/page.tsx', 'utf8');
  assert.ok(source.indexOf("fetcher('/api/profile')") < source.indexOf('/api/tasks?date='));
  assert.match(source, /profile\?\.scheduling_timezone/);
  assert.match(source, /dayInTimezone\(zone\)/);
  assert.match(source, /current\.dateKey.*current\.weekday/);
  assert.match(source, /calendarDeadlineDay\(value, timezone\)/);
  assert.match(source, /const today = key === todayKey;/);
  assert.doesNotMatch(source, /dateKey\(new Date\(\)\).*new Date\(\)\.getDay\(\)/);
});
