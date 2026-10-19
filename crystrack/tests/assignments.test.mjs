import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const loaded = { exports: {} };
new Function(
  'require',
  'module',
  'exports',
  ts.transpileModule(fs.readFileSync('src/lib/assignments.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
)(createRequire(import.meta.url), loaded, loaded.exports);
const {
  resolveLocalDeadline: resolve,
  localInput,
  assignmentState: state,
  assignmentFieldsSchema: schema,
} = loaded.exports;
test('deadline input uses saved zone rather than machine clock; leap days round trip', () => {
  assert.equal(resolve('2028-02-29T23:30', 'Africa/Lagos'), '2028-02-29T22:30:00.000Z');
  assert.equal(localInput('2026-09-28T23:30:00Z', 'Asia/Kathmandu'), '2026-09-29T05:15');
  assert.throws(() => resolve('2027-02-29T10:00', 'UTC'));
  assert.throws(() => resolve('2028-02-30T10:00', 'UTC'));
});
test('DST gaps and folds are rejected, including half-hour transitions', () => {
  for (const [value, zone] of [
    ['2026-03-08T02:30', 'America/New_York'],
    ['2026-11-01T01:30', 'America/New_York'],
    ['2026-10-04T02:15', 'Australia/Lord_Howe'],
    ['2026-04-05T01:45', 'Australia/Lord_Howe'],
  ])
    assert.throws(() => resolve(value, zone), /clocks change/);
  assert.equal(resolve('2026-03-08T03:30', 'America/New_York'), '2026-03-08T07:30:00.000Z');
  assert.equal(resolve('2026-11-01T02:30', 'America/New_York'), '2026-11-01T07:30:00.000Z');
});
test('today is a saved-zone calendar day, not the next 24 hours; now remains due', () => {
  const now = '2026-09-28T22:30:00Z';
  assert.equal(state('2026-09-28T22:30:00Z', null, now, 'Africa/Lagos'), 'due_today');
  assert.equal(state('2026-09-28T23:30:00Z', null, now, 'Africa/Lagos'), 'due_soon');
  assert.equal(state('2026-09-28T22:29:59Z', null, now, 'Africa/Lagos'), 'overdue');
  assert.equal(state('2026-10-01T10:00:00Z', null, now, 'Africa/Lagos'), 'upcoming');
});
test('Finished Late compares instants, equality on time, regardless of display dates', () => {
  assert.equal(
    state('2026-11-01T01:30:00-04:00', '2026-11-01T01:15:00-05:00', '2026-12-01', 'America/New_York'),
    'finished_late',
  );
  assert.equal(
    state('2026-09-28T23:30:00Z', '2026-09-29T00:30:00+01:00', '2026-12-01', 'Africa/Lagos'),
    'completed_on_time',
  );
});
test('strict bounded fields reject client rewards/identity and invalid reminders', () => {
  const valid = {
    title: ' Synthetic ',
    localDeadline: '2026-09-28T12:00',
    timezone: 'Africa/Lagos',
    reminderConfig: { enabled: true, channels: ['push', 'push'], offsetMinutes: [120, 0, 120] },
  };
  const parsed = schema.parse(valid);
  assert.equal(parsed.title, 'Synthetic');
  assert.deepEqual(parsed.reminderConfig.offsetMinutes, [120, 0]);
  assert.deepEqual(parsed.reminderConfig.channels, ['push']);
  for (const extra of [{ shards: 30 }, { user_id: 'other' }, { completed_at: '2026-09-28' }])
    assert.equal(schema.safeParse({ ...valid, ...extra }).success, false);
  assert.equal(schema.safeParse({ ...valid, deadline: '2026-09-28T12:00:00Z' }).success, false);
  assert.equal(
    schema.safeParse({
      ...valid,
      reminderConfig: { enabled: true, channels: ['email'], offsetMinutes: [-1] },
    }).success,
    false,
  );
});
