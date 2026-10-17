import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const {
  milestonePercentage,
  routinePercentage,
  numericPercentage,
  goalPacing,
  shiftGoalDay,
} = loadTs('src/lib/goals/progress.ts');
const { toKobo, fromKobo, moneyPercent, formatMoney } =
  loadTs('src/lib/money.ts');
const { goalFields, goalPatch } = loadTs('src/lib/goals/validation.ts');
const { goalCheckinState } = loadTs('src/lib/goals/checkin-occurrence.ts');
const { deadlineInstant, planPayload } = loadTs('src/lib/goals/service.ts', {
  '@/lib/supabase/server': {},
});
const now = new Date('2026-10-17T12:00:00Z');
test('milestones count completed steps with equal weight and support undo', () => {
  const steps = [
    { completedAt: '2026-10-16T10:00:00Z' },
    { completedAt: null },
    { completedAt: null },
  ];
  assert.equal(milestonePercentage(steps), 33.3);
  steps[1].completedAt = '2026-10-17T11:00:00Z';
  assert.equal(milestonePercentage(steps), 66.7);
  steps[0].completedAt = null;
  assert.equal(milestonePercentage(steps), 33.3);
  assert.equal(milestonePercentage([]), 0);
  assert.equal(
    milestonePercentage(
      steps.map(() => ({ completedAt: '2026-10-17T00:00:00Z' })),
    ),
    100,
  );
});
test('routine effort is capped and supports uncompletion', () => {
  assert.equal(routinePercentage(3, 10), 30);
  assert.equal(routinePercentage(2, 10), 20);
  assert.equal(routinePercentage(40, 10), 100);
  assert.equal(routinePercentage(-1, 10), 0);
  assert.equal(routinePercentage(2, 0), 0);
});
test('measured progress supports increasing and decreasing goals', () => {
  assert.equal(numericPercentage(80, 100, 60), 50);
  assert.equal(numericPercentage(5, 0, 10), 50);
  assert.equal(numericPercentage(30, 0, 10), 100);
  assert.equal(numericPercentage(1, 1, 1), null);
});
test('pacing projects from distinct local days and includes the saved-zone target', () => {
  assert.match(
    goalPacing(
      [
        { day: '2026-10-10', percent: 0 },
        { day: '2026-10-17', percent: 50 },
      ],
      now,
      'Africa/Lagos',
      '2026-10-30T23:30:00Z',
    ),
    /finish on 2026-10-24; Target deadline is 2026-10-31/,
  );
});
test('pacing does not invent estimates from one day, stalls, reversals, or future evidence', () => {
  for (const points of [
    [
      { day: '2026-10-17', percent: 20 },
      { day: '2026-10-17', percent: 50 },
    ],
    [
      { day: '2026-10-10', percent: 50 },
      { day: '2026-10-17', percent: 40 },
    ],
    [
      { day: '2026-10-10', percent: 50 },
      { day: '2026-10-17', percent: 50 },
    ],
    [{ day: '2026-10-18', percent: 50 }],
  ])
    assert.match(
      goalPacing(points, now, 'UTC', null),
      /more progress evidence/,
    );
  assert.match(goalPacing([], now, 'UTC', null, 'paused'), /resting/);
  assert.match(goalPacing([], now, 'UTC', null, 'let_go'), /Space made/);
  assert.match(
    goalPacing([{ day: '2026-10-17', percent: 100 }], now, 'UTC', null),
    /complete/,
  );
});
test('calendar pacing remains stable over daylight saving time and date rollover', () => {
  assert.equal(shiftGoalDay('2026-03-08', 1), '2026-03-09');
  assert.match(
    goalPacing(
      [
        { day: '2026-03-07', percent: 0 },
        { day: '2026-03-09', percent: 50 },
      ],
      new Date('2026-03-10T03:30:00Z'),
      'America/New_York',
      null,
    ),
    /finish on 2026-03-11/,
  );
});
test('due today uses the saved timezone and weekly selected weekday', () => {
  const config = { frequency: 'specific', days: [0] };
  const instant = new Date('2026-10-17T23:30:00Z');
  assert.equal(goalCheckinState(config, [], instant, 'Africa/Lagos').due, true);
  assert.equal(
    goalCheckinState(config, [], instant, 'America/New_York').due,
    false,
  );
  assert.equal(
    goalCheckinState({ frequency: 'weekly', days: [1] }, [], now, 'UTC').due,
    false,
  );
  assert.equal(
    goalCheckinState({ frequency: 'weekly', days: [1] }, [], now, 'UTC')
      .available,
    true,
  );
  assert.equal(
    goalCheckinState(
      config,
      [{ occurrence_key: 'specific:2026-10-18' }],
      instant,
      'Africa/Lagos',
    ).due,
    false,
  );
});
test('date-only deadlines resolve to the final saved-zone instant across DST', () => {
  assert.equal(
    deadlineInstant('2026-10-17', 'Africa/Lagos'),
    '2026-10-17T22:59:59.999Z',
  );
  assert.equal(
    deadlineInstant('2026-03-08', 'America/New_York'),
    '2026-03-09T03:59:59.999Z',
  );
  assert.equal(
    deadlineInstant('2026-11-01', 'America/New_York'),
    '2026-11-02T04:59:59.999Z',
  );
  assert.deepEqual(
    planPayload(
      { deadline: '2026-10-17', whyMatters: 'A reason', expectedRevision: 4 },
      'Africa/Lagos',
    ),
    { deadline: '2026-10-17T22:59:59.999Z', why_matters: 'A reason' },
  );
});
test('money arithmetic preserves exact kobo at the DECIMAL boundary', () => {
  assert.equal(fromKobo(toKobo('0.10') + toKobo('0.20')), '0.30');
  assert.equal(fromKobo(toKobo('9999999999.99')), '9999999999.99');
  assert.equal(moneyPercent('0.10', '0.30'), 33.33);
  assert.equal(moneyPercent('4', '2'), 100);
  assert.equal(moneyPercent('0', '0'), 0);
  assert.equal(formatMoney('1234.56'), '₦1,234.56');
  for (const bad of ['1.001', 'NaN', '-1', '10000000000', '1e2'])
    assert.throws(() => toKobo(bad));
});
test('goal validation rejects invalid dates, duplicate IDs, untrusted fields, stale edit shapes', () => {
  assert.equal(
    goalFields.safeParse({ title: 'A goal', deadline: '2026-02-30' }).success,
    false,
  );
  assert.equal(
    goalFields.safeParse({ title: 'A goal', user_id: 'someone' }).success,
    false,
  );
  assert.equal(goalPatch.safeParse({ title: 'Edited' }).success, false);
  assert.equal(goalPatch.safeParse({ expectedRevision: 0 }).success, false);
  assert.equal(
    goalPatch.safeParse({ expectedRevision: 2, title: 'Edited' }).success,
    true,
  );
  const id = '11111111-1111-4111-8111-111111111111';
  assert.equal(
    goalFields.safeParse({ title: 'Goal', taskIds: [id, id] }).success,
    false,
  );
  assert.equal(
    goalFields.safeParse({
      title: 'Goal',
      checkinConfig: {
        frequency: 'weekly',
        days: [],
        time: '20:00',
        channels: ['push'],
      },
    }).success,
    false,
  );
});
