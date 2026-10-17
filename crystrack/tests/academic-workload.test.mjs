import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const {
  academicWorkload,
  assignmentStatus,
  completionLabel,
  subtaskPercent,
  workloadSummary,
} = loadTs('src/lib/assignments/workload.ts');
const { academicDeadline, localDateTimeValue } = loadTs(
  'src/lib/assignments/time.ts',
);
const { assignmentFields, assignmentPatch } = loadTs(
  'src/lib/assignments/validation.ts',
);
const now = new Date('2026-10-17T12:00:00Z');
const item = (deadline, estimated_minutes, status = 'upcoming') => ({
  deadline,
  estimated_minutes,
  status,
});
test('late completion labeling respects persisted completion status', () => {
  assert.equal(completionLabel('completed', true), 'Finished Late');
  assert.equal(completionLabel('completed', false), 'Finished');
  assert.equal(completionLabel('dropped', false), 'Dropped');
  assert.equal(completionLabel('overdue', true), null);
  assert.equal(
    assignmentStatus(
      { deadline: '2020-01-01T00:00:00Z', status: 'completed' },
      now,
      'Africa/Lagos',
    ),
    'completed',
  );
  assert.equal(
    assignmentStatus(
      { deadline: '2020-01-01T00:00:00Z', status: 'dropped' },
      now,
      'Africa/Lagos',
    ),
    'dropped',
  );
});
test('due today follows local calendar day rather than a rolling 24 hours', () => {
  const instant = new Date('2026-10-17T23:30:00Z'),
    assignment = item('2026-10-18T01:00:00Z', 60);
  assert.equal(
    assignmentStatus(assignment, instant, 'Africa/Lagos'),
    'due_today',
  );
  assert.equal(
    assignmentStatus(assignment, instant, 'America/New_York'),
    'due_today',
  );
  assert.equal(
    assignmentStatus(
      item('2026-10-18T08:00:00Z', 60),
      instant,
      'America/New_York',
    ),
    'due_soon',
  );
  assert.equal(
    assignmentStatus(item('2026-10-17T23:29:59Z', 60), instant, 'Africa/Lagos'),
    'overdue',
  );
});
test('seven-day workload totals integer minutes and warns when planning guides are exceeded', () => {
  const result = academicWorkload(
    [
      item('2026-10-18T12:00:00Z', 180),
      item('2026-10-19T12:00:00Z', 240),
      item('2026-10-20T12:00:00Z', 240),
    ],
    now,
    'Africa/Lagos',
  );
  assert.equal(result.count, 3);
  assert.equal(result.minutes, 660);
  assert.equal(result.warning, true);
  assert.match(workloadSummary(result), /3 items.*11 hours/);
});
test('workload excludes overdue, finished, dropped, invalid, and eighth-day deadlines', () => {
  const result = academicWorkload(
    [
      item('2026-10-16T12:00:00Z', 90),
      item('2026-10-18T12:00:00Z', 60, 'completed'),
      item('2026-10-18T12:00:00Z', 60, 'dropped'),
      item('2026-10-24T00:00:00Z', 60),
      item('bad', 60),
      item('2026-10-17T12:00:00Z', 30),
    ],
    now,
    'UTC',
  );
  assert.equal(result.count, 1);
  assert.equal(result.minutes, 30);
  assert.equal(result.overdueCount, 1);
});
test('missing estimates are counted separately and zero is a valid estimate', () => {
  const result = academicWorkload(
    [
      item('2026-10-18T12:00:00Z', null),
      item('2026-10-18T13:00:00Z', 0),
      item('2026-10-18T14:00:00Z', 90),
    ],
    now,
    'UTC',
  );
  assert.equal(result.count, 3);
  assert.equal(result.minutes, 90);
  assert.equal(result.unestimated, 1);
  assert.equal(result.warning, false);
});
test('daily overload can warn while weekly total is below its limit', () => {
  assert.equal(
    academicWorkload([item('2026-10-18T12:00:00Z', 241)], now, 'UTC').warning,
    true,
  );
  assert.equal(
    academicWorkload([item('2026-10-18T12:00:00Z', 240)], now, 'UTC').warning,
    false,
  );
});
test('workload bucket boundaries use saved-zone days across DST and UTC rollover', () => {
  const result = academicWorkload(
    [
      item('2026-11-01T05:30:00Z', 60),
      item('2026-11-01T06:30:00Z', 60),
      item('2026-11-07T04:59:59Z', 30),
      item('2026-11-08T05:00:00Z', 90),
    ],
    new Date('2026-11-01T04:00:00Z'),
    'America/New_York',
  );
  assert.equal(result.days.length, 7);
  assert.equal(result.days[0].minutes, 120);
  assert.equal(result.minutes, 150);
  const rollover = academicWorkload(
    [item('2026-10-18T00:00:00Z', 60)],
    new Date('2026-10-17T23:30:00Z'),
    'Africa/Lagos',
  );
  assert.equal(rollover.days[0].day, '2026-10-18');
  assert.equal(rollover.days[0].minutes, 60);
});
test('local deadlines round-trip through the saved timezone and reject nonexistent times', () => {
  assert.equal(
    academicDeadline('2026-10-17T14:30', 'Africa/Lagos'),
    '2026-10-17T13:30:00.000Z',
  );
  assert.equal(
    localDateTimeValue('2026-10-17T13:30:00Z', 'Africa/Lagos'),
    '2026-10-17T14:30',
  );
  assert.throws(
    () => academicDeadline('2026-03-08T02:30', 'America/New_York'),
    /unavailable/,
  );
  assert.equal(
    academicDeadline('2026-11-01T01:30', 'America/New_York'),
    '2026-11-01T05:30:00.000Z',
  );
  assert.equal(
    academicDeadline('2026-11-01T01:30:00-05:00', 'America/New_York'),
    '2026-11-01T06:30:00.000Z',
  );
  assert.equal(
    academicDeadline('2026-10-17', 'Africa/Lagos'),
    '2026-10-17T22:59:59.999Z',
  );
});
test('validation rejects owner injection, invalid dates, duplicate steps, and negative estimates', () => {
  const base = { title: 'Lab', deadline: '2026-10-20T12:00' };
  for (const data of [
    { ...base, user_id: 'other' },
    { ...base, deadline: '2026-02-30T12:00' },
    { ...base, deadline: '2026-10-20T25:00' },
    { ...base, estimatedMinutes: -1 },
    { ...base, pointWeight: 101 },
  ])
    assert.equal(assignmentFields.safeParse(data).success, false);
  assert.equal(assignmentPatch.safeParse({ title: 'Edited' }).success, false);
  assert.equal(
    assignmentPatch.safeParse({ expectedRevision: 1 }).success,
    false,
  );
  assert.equal(
    assignmentPatch.safeParse({ expectedRevision: 1, status: 'dropped' })
      .success,
    true,
  );
  const step = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'First step',
    completed: false,
  };
  assert.equal(
    assignmentFields.safeParse({ ...base, subtasks: [step, step] }).success,
    false,
  );
});
test('subtask progress handles empty, fractional, full, and undone lists', () => {
  assert.equal(subtaskPercent([]), 0);
  assert.equal(
    subtaskPercent([
      { completed: true },
      { completed: false },
      { completed: false },
    ]),
    33.3,
  );
  assert.equal(subtaskPercent([{ completed: true }]), 100);
  assert.equal(subtaskPercent([{ completed: false }]), 0);
});
