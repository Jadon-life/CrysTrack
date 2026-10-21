import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const native = createRequire(import.meta.url),
  cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const loadedModule = { exports: {} };
  cache.set(file, loadedModule);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'module', 'exports', source)(
    (name) => (name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : native(name)),
    loadedModule,
    loadedModule.exports,
  );
  return loadedModule.exports;
}
const { weekStart, weekDays, weekGridSchema, weekQuerySchema, weekDayLabel } = load('src/lib/week-grid.ts');
const id = '00000000-0000-4000-8000-000000000001';
function view() {
  const dates = weekDays('2026-10-18');
  return {
    context: { day: '2026-10-22', timezone: 'Africa/Lagos', revision: 1, captureStartsOn: '2026-10-01' },
    from: dates[0],
    to: dates[6],
    minimum: '2025-10-19',
    maximum: '2026-12-13',
    revision: '0'.repeat(32),
    nextCursor: null,
    days: dates.map((day) => ({
      day,
      timezone: 'Africa/Lagos',
      mode: day < '2026-10-22' ? 'past' : day === '2026-10-22' ? 'today' : 'future',
      evidence: day < '2026-10-22' ? 'missing' : day === '2026-10-22' ? 'incomplete' : 'planned',
      count: null,
    })),
    rows: [
      {
        id,
        title: 'Current name',
        active: true,
        nameSource: 'current',
        cells: dates.map((day) => ({
          day,
          state: day < '2026-10-22' ? 'unverified' : day === '2026-10-22' ? 'pending' : 'planned',
          title: day < '2026-10-22' ? null : 'Current name',
          editable: day === '2026-10-22',
          revision: day === '2026-10-22' ? 1 : null,
        })),
      },
    ],
  };
}
test('Sunday calendar weeks cross leap days, years and DST without elapsed-hour arithmetic', () => {
  assert.equal(weekStart('2028-02-29'), '2028-02-27');
  assert.deepEqual(weekDays('2028-02-27'), [
    '2028-02-27',
    '2028-02-28',
    '2028-02-29',
    '2028-03-01',
    '2028-03-02',
    '2028-03-03',
    '2028-03-04',
  ]);
  assert.equal(weekStart('2027-01-01'), '2026-12-27');
  assert.equal(weekDays('2026-03-08')[6], '2026-03-14');
  assert.throws(() => weekStart('2027-02-29'));
});
test('unknown and partial history cannot be displayed as a success, pending, or zero', () => {
  const data = view();
  assert.ok(weekGridSchema.safeParse(data).success);
  for (const state of ['completed', 'pending', 'skipped', 'missed', 'not_scheduled']) {
    const bad = view();
    bad.rows[0].cells[0].state = state;
    assert.equal(weekGridSchema.safeParse(bad).success, false);
  }
  const zero = view();
  zero.days[0].count = 0;
  assert.equal(weekGridSchema.safeParse(zero).success, false);
  assert.equal(weekDayLabel(data.days[0]), 'History unverified');
});
test('verified empty is neutral; a captured closed-day pending outcome remains pending', () => {
  const data = view();
  data.days[0].evidence = 'verified';
  data.days[0].count = 0;
  data.rows[0].cells[0].state = 'not_scheduled';
  assert.ok(weekGridSchema.safeParse(data).success);
  assert.equal(weekDayLabel(data.days[0]), 'Verified empty');
  data.days[0].count = 1;
  data.rows[0].cells[0].state = 'pending';
  assert.ok(weekGridSchema.safeParse(data).success);
});
test('only current open membership is writable; future plans never become outcomes', () => {
  for (const i of [0, 5, 6]) {
    const data = view();
    data.rows[0].cells[i].editable = true;
    data.rows[0].cells[i].revision = 1;
    assert.equal(weekGridSchema.safeParse(data).success, false);
  }
  for (const state of ['completed', 'skipped', 'missed', 'pending']) {
    const data = view();
    data.rows[0].cells[6].state = state;
    assert.equal(weekGridSchema.safeParse(data).success, false);
  }
  const data = view();
  assert.equal(weekDayLabel(data.days[4]), 'Open · partial evidence');
  assert.equal(weekDayLabel(data.days[6]), 'Planned · editable');
});
test('malformed/duplicate/shifted pages, impossible zones and unpinned cursors fail closed', () => {
  for (const mutate of [
    (v) => v.rows.push(v.rows[0]),
    (v) => v.days.reverse(),
    (v) => v.rows[0].cells.reverse(),
    (v) => (v.days[0].timezone = 'Not/AZone'),
    (v) => (v.from = '2026-10-19'),
    (v) => v.rows[0].cells.pop(),
  ]) {
    const data = view();
    mutate(data);
    assert.equal(weekGridSchema.safeParse(data).success, false);
  }
  assert.equal(weekQuerySchema.safeParse({ after: id }).success, false);
  assert.equal(
    weekQuerySchema.safeParse({ from: '2026-10-18', after: id, revision: '0'.repeat(32) }).success,
    true,
  );
  assert.equal(weekQuerySchema.safeParse({ userId: id }).success, false);
});
