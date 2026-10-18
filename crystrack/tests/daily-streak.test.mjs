import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const compiled = ts.transpileModule(fs.readFileSync('src/lib/daily-streak.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  reportDiagnostics: true,
});
assert.deepEqual(compiled.diagnostics || [], []);
const { calculateDailyStreak, streakLocalDay } = await import(
  'data:text/javascript;charset=utf-8,' + encodeURIComponent(compiled.outputText)
);

const day = (date, statuses = ['completed'], evidence = 'verified') => ({
  date, evidence,
  scheduledRoutineIds: statuses.map((_, i) => 'routine-' + i),
  outcomes: statuses.map((status, i) => ({ routineId: 'routine-' + i, status })),
});
const calculate = (snapshots, extra = {}) => calculateDailyStreak({
  timezone: 'Africa/Lagos', now: new Date('2026-10-18T12:00:00Z'),
  coverageStart: '2026-10-16', historyFromBeginning: true, snapshots, ...extra,
});

test('all done earns one day; the open current day is reported separately', () => {
  const result = calculate([day('2026-10-16'), day('2026-10-17'), day('2026-10-18')]);
  assert.deepEqual(result.current, { value: 2, verifiedDays: 2, status: 'complete' });
  assert.deepEqual(result.best, { observed: 2, status: 'complete' });
  assert.equal(result.today.outcome, 'success');
});

test('partial, skipped, unskipped pending, undone pending and missed never earn success', () => {
  for (const status of ['pending', 'skipped', 'missed']) {
    const result = calculate([day('2026-10-16'), day('2026-10-17', ['completed', status])]);
    assert.equal(result.current.value, 0);
    assert.equal(result.best.observed, 1);
  }
  // Latest authoritative snapshots model skip -> pending -> complete -> undo.
  for (const [status, expected] of [['skipped', 0], ['pending', 0], ['completed', 2], ['pending', 0]]) {
    assert.equal(calculate([day('2026-10-16'), day('2026-10-17', [status])]).current.value, expected);
  }
});

test('verified zero-task days neither earn nor break continuity', () => {
  const result = calculate([day('2026-10-16'), day('2026-10-17', []), day('2026-10-18', [])]);
  assert.equal(result.current.value, 1);
  assert.equal(result.best.observed, 1);
  assert.equal(result.today.outcome, 'neutral');
  assert.equal(calculate([day('2026-10-16', []), day('2026-10-17', [])]).current.value, 0);
});

test('unfinished or unavailable today does not break yesterday; missing yesterday is unknown', () => {
  for (const today of [[], [day('2026-10-18', ['pending'])], [day('2026-10-18', ['missed'])]]) {
    assert.equal(calculate([day('2026-10-16'), day('2026-10-17'), ...today]).current.value, 2);
  }
  const missing = calculate([day('2026-10-16')]);
  assert.equal(missing.current.value, null);
  assert.equal(missing.current.status, 'partial');
});

test('multiple missed days break current streak, while best observed is preserved', () => {
  const result = calculate([
    day('2026-10-12'), day('2026-10-13'), day('2026-10-14'),
    day('2026-10-15', ['missed']), day('2026-10-16', ['missed']), day('2026-10-17'),
  ], { coverageStart: '2026-10-12' });
  assert.equal(result.current.value, 1);
  assert.equal(result.best.observed, 3);
});

test('20 routines and identical duplicates count each routine exactly once without mutation', () => {
  const snapshot = day('2026-10-17', Array(20).fill('completed'));
  snapshot.scheduledRoutineIds.push('routine-0');
  snapshot.outcomes.push({ routineId: 'routine-0', status: 'completed' });
  const before = JSON.stringify(snapshot);
  const result = calculate([snapshot, { ...snapshot, date: '2026-10-18' }], { coverageStart: '2026-10-17' });
  assert.equal(result.current.value, 1);
  assert.equal(result.today.completed, 20);
  assert.equal(result.today.scheduled, 20);
  assert.equal(JSON.stringify(snapshot), before);
});

test('conflicting duplicate outcomes and duplicate day records are unknown', () => {
  const conflict = day('2026-10-17');
  conflict.outcomes.push({ routineId: 'routine-0', status: 'pending' });
  for (const snapshots of [[conflict], [day('2026-10-17'), day('2026-10-17')]]) {
    const result = calculate(snapshots, { coverageStart: '2026-10-17' });
    assert.equal(result.current.value, null);
    assert.equal(result.best.observed, 0);
    assert.deepEqual(result.coverage.unknownDates, ['2026-10-17']);
  }
});

test('missing days split observed streaks and mark coverage partial, never neutral', () => {
  const result = calculate([day('2026-10-15'), day('2026-10-17')], { coverageStart: '2026-10-15' });
  assert.deepEqual(result.current, { value: null, verifiedDays: 1, status: 'partial' });
  assert.deepEqual(result.best, { observed: 1, status: 'partial' });
  assert.equal(result.coverage.complete, false);
  assert.deepEqual(result.coverage.unknownDates, ['2026-10-16']);
});

test('incomplete pagination cannot establish completion or an empty neutral day', () => {
  for (const statuses of [[], ['completed']]) {
    const result = calculate([day('2026-10-16'), day('2026-10-17', statuses, 'incomplete')]);
    assert.equal(result.current.value, null);
    assert.equal(result.best.status, 'partial');
  }
  const absent = day('2026-10-17');
  absent.outcomes = [];
  assert.equal(calculate([absent], { coverageStart: '2026-10-17' }).current.value, null);
});

test('incomplete earlier history qualifies best; a known break can still establish current', () => {
  const truncated = calculate([day('2026-10-16'), day('2026-10-17')], { historyFromBeginning: false });
  assert.equal(truncated.current.value, null);
  assert.equal(truncated.current.verifiedDays, 2);
  assert.equal(truncated.best.status, 'partial');
  const knownBreak = calculate([day('2026-10-16', ['pending']), day('2026-10-17')], { historyFromBeginning: false });
  assert.equal(knownBreak.current.value, 1);
  assert.equal(knownBreak.best.status, 'partial');
});

test('eligibility uses durable daily snapshots, including archived/deleted historical routines', () => {
  const oldSchedule = {
    date: '2026-10-16', evidence: 'verified', scheduledRoutineIds: ['later-deleted', 'later-archived'],
    outcomes: [{ routineId: 'later-deleted', status: 'completed' }, { routineId: 'later-archived', status: 'completed' }],
  };
  const newSchedule = {
    date: '2026-10-17', evidence: 'verified', scheduledRoutineIds: ['new-routine'],
    outcomes: [{ routineId: 'new-routine', status: 'completed' }],
  };
  assert.equal(calculate([oldSchedule, newSchedule]).current.value, 2);
  assert.equal(calculate([{ ...oldSchedule, outcomes: oldSchedule.outcomes.slice(0, 1) }, newSchedule]).current.value, null);
});

test('unexpected routine outcomes are rejected as unknown, not used to fill a schedule', () => {
  const snapshot = day('2026-10-17', []);
  snapshot.outcomes.push({ routineId: 'not-scheduled', status: 'completed' });
  assert.equal(calculate([snapshot], { coverageStart: '2026-10-17' }).current.value, null);
});

test('saved timezone determines local day across midnight without a device-time fallback', () => {
  const now = new Date('2026-10-17T23:55:00Z');
  assert.equal(streakLocalDay(now, 'Africa/Lagos'), '2026-10-18');
  assert.equal(streakLocalDay(now, 'America/Los_Angeles'), '2026-10-17');
  const snapshots = [day('2026-10-16'), day('2026-10-17', ['pending'])];
  assert.equal(calculate(snapshots, { now, timezone: 'Africa/Lagos' }).current.value, 0);
  assert.equal(calculate(snapshots, { now, timezone: 'America/Los_Angeles' }).current.value, 1);
});

test('DST spring/fall, month/year and leap boundaries use calendar keys', () => {
  for (const [now, start, dates] of [
    ['2026-03-09T04:05:00Z', '2026-03-07', ['2026-03-07', '2026-03-08']],
    ['2026-11-02T05:05:00Z', '2026-10-31', ['2026-10-31', '2026-11-01']],
    ['2027-01-01T05:05:00Z', '2026-12-30', ['2026-12-30', '2026-12-31']],
    ['2028-03-01T05:05:00Z', '2028-02-28', ['2028-02-28', '2028-02-29']],
  ]) {
    const result = calculate(dates.map((date) => day(date)), {
      now: new Date(now), timezone: 'America/New_York', coverageStart: start,
    });
    assert.equal(result.current.value, 2);
    assert.deepEqual(result.coverage.unknownDates, []);
  }
});

test('shield stays disabled and never protects factual misses', () => {
  const snapshots = [day('2026-10-16'), day('2026-10-17', ['missed'])];
  const result = calculate(snapshots);
  assert.deepEqual(result.shield, { enabled: false });
  assert.equal(result.current.value, 0);
  assert.deepEqual(calculate(snapshots, { shield: { enabled: false } }), result);
  assert.throws(() => calculate(snapshots, { shield: { enabled: true } }), /not supported/);
});

test('invalid dates, timezones, clock and out-of-range evidence fail explicitly', () => {
  for (const extra of [
    { coverageStart: '2026-02-30' }, { coverageStart: '2026-10-19' },
    { timezone: '' }, { timezone: 'not/a-zone' }, { now: new Date('invalid') },
    { snapshots: [day('2026-10-19')] }, { snapshots: [day('2026-10-15')] },
    { snapshots: [day('2026-02-30')] },
  ]) assert.throws(() => calculate([], extra));
});

test('no closed days reports zero only when the tracked beginning is verified', () => {
  const result = calculate([], { coverageStart: '2026-10-18' });
  assert.equal(result.current.value, 0);
  assert.equal(result.today.outcome, 'unknown');
  assert.equal(calculate([], { coverageStart: '2026-10-18', historyFromBeginning: false }).current.value, null);
});

test('unordered verified history longer than a year is neither truncated nor input-order dependent', () => {
  const snapshots = Array.from({ length: 400 }, (_, index) => {
    const date = new Date('2025-01-01T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + index);
    return day(date.toISOString().slice(0, 10));
  });
  const extra = { coverageStart: '2025-01-01', now: new Date('2026-02-05T12:00:00Z') };
  const result = calculate(snapshots, extra);
  assert.equal(result.current.value, 400);
  assert.equal(result.best.observed, 400);
  assert.deepEqual(calculate([...snapshots].reverse(), extra), result);
});
