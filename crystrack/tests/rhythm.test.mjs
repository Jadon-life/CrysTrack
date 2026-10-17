import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const {
  assignSlot,
  monthCells,
  calendarEvents,
  dailyCapacity,
  weeklyAggregation,
  weekStart,
} = loadTs('src/lib/rhythm/logic.ts');
const { cachedToday, invalidateToday } = loadTs('src/lib/rhythm/cache.ts');
const { ritualInput, boxInput } = loadTs('src/lib/rhythm/validation.ts');
test('slots resolve in saved timezone, allow adjacency, and reject overlapping blocks', () => {
  const first = assignSlot('task', '2026-10-17', 9, 60, 'Africa/Lagos');
  assert.equal(first.startsAt, '2026-10-17T08:00:00.000Z');
  const boxes = [
    {
      task_id: 'other',
      occurrence_day: '2026-10-17',
      starts_at: first.startsAt,
      ends_at: '2026-10-17T09:00:00Z',
    },
  ];
  assert.throws(
    () => assignSlot('task', '2026-10-17', 9, 30, 'Africa/Lagos', boxes),
    /already/,
  );
  assert.equal(
    assignSlot('task', '2026-10-17', 10, 30, 'Africa/Lagos', boxes).minutes,
    30,
  );
  assert.throws(() => assignSlot('task', '2026-10-17', 24, 30, 'UTC'));
  assert.throws(() => assignSlot('task', '2026-10-17', 9, 0, 'UTC'));
});
test('slot moves ignore the same task occurrence but still reject DST gaps', () => {
  const boxes = [
    {
      task_id: 'task',
      occurrence_day: '2026-10-17',
      starts_at: '2026-10-17T08:00:00Z',
      ends_at: '2026-10-17T09:00:00Z',
    },
  ];
  assert.equal(
    assignSlot('task', '2026-10-17', 9, 60, 'Africa/Lagos', boxes).minutes,
    60,
  );
  assert.throws(
    () => assignSlot('task', '2026-03-08', 2, 30, 'America/New_York'),
    /unavailable/,
  );
});
test('calendar month uses exactly the required weeks and handles leap years', () => {
  const days = monthCells('2026-09-17');
  assert.equal(days.length, 35);
  assert.equal(days[0], '2026-08-30');
  assert.equal(days.at(-1), '2026-10-03');
  assert.ok(monthCells('2028-02-01').includes('2028-02-29'));
  assert.equal(weekStart('2026-10-17'), '2026-10-11');
});
test('capacity counts only minutes intersecting the local day', () => {
  const boxes = [
    { starts_at: '2026-10-16T22:30:00Z', ends_at: '2026-10-16T23:30:00Z' },
    { starts_at: '2026-10-17T08:00:00Z', ends_at: '2026-10-17T09:00:00Z' },
  ];
  const result = dailyCapacity(boxes, '2026-10-17', 'Africa/Lagos', 80);
  assert.equal(result.planned, 90);
  assert.equal(result.overloaded, true);
});
test('dashboard weekly aggregation counts completions once and excludes incomplete focus sessions', () => {
  const result = weeklyAggregation(
    [
      {
        task_id: 't',
        status: 'completed',
        completed_at: '2026-10-12T10:00:00Z',
      },
      { task_id: 't', status: 'pending', completed_at: null },
    ],
    [
      {
        status: 'completed',
        completed_at: '2026-10-13T10:00:00Z',
        course_code: 'PHY',
      },
    ],
    [
      {
        status: 'achieved',
        completed_at: '2026-10-14T10:00:00Z',
        category: 'Learning',
      },
    ],
    [
      {
        status: 'completed',
        planned_minutes: 25,
        completed_at: '2026-10-15T10:00:00Z',
      },
      { status: 'running', planned_minutes: 90 },
    ],
    [{ id: 't', category: 'Health' }],
    '2026-10-11',
    '2026-10-17',
    'Africa/Lagos',
  );
  assert.equal(result.completed, 3);
  assert.equal(result.focusedMinutes, 25);
  assert.deepEqual(result.areas, [
    { label: 'Health', count: 1 },
    { label: 'Learning', count: 2 },
  ]);
});
test('unified calendar expands routines, deferrals, milestones, expenses, and reminders', () => {
  const input = {
    tasks: [{ id: 't', title: 'Read', task_schedules: [{ weekday: 6 }] }],
    occurrences: [],
    assignments: [
      {
        id: 'a',
        title: 'Lab',
        status: 'upcoming',
        deadline: '2026-10-17T15:00:00Z',
      },
    ],
    goals: [
      {
        id: 'g',
        title: 'Learn',
        status: 'active',
        milestones: [
          { id: 'm', title: 'Step', dueDate: '2026-10-17', completedAt: null },
        ],
      },
    ],
    flows: [
      {
        id: 'b',
        title: 'Subscription',
        direction: 'expense',
        status: 'active',
        frequency: 'monthly',
        expected_on: '2026-09-17T12:00:00Z',
      },
    ],
    reminders: [
      {
        id: 'r',
        title: 'Reminder',
        scheduled_for: '2026-10-17T13:00:00Z',
        status: 'pending',
      },
    ],
    boxes: [],
    rituals: [],
  };
  let events = calendarEvents(
    input,
    '2026-10-17',
    '2026-10-18',
    'Africa/Lagos',
  );
  assert.deepEqual(
    new Set(events.map((e) => e.type)),
    new Set(['task', 'assignment', 'milestone', 'bill', 'reminder']),
  );
  input.rituals = [
    {
      day: '2026-10-17',
      deferred: [{ type: 'task', id: 't' }],
      deferred_to: '2026-10-18',
    },
  ];
  events = calendarEvents(input, '2026-10-17', '2026-10-18', 'Africa/Lagos');
  assert.equal(events.find((e) => e.type === 'task').day, '2026-10-18');
});
test('monthly expense on the 31st clamps to month end without losing its anchor', () => {
  const input = {
    tasks: [],
    occurrences: [],
    assignments: [],
    goals: [],
    reminders: [],
    boxes: [],
    rituals: [],
    flows: [
      {
        id: 'f',
        title: 'Bill',
        direction: 'expense',
        status: 'active',
        frequency: 'monthly',
        expected_on: '2026-01-31T12:00:00Z',
      },
    ],
  };
  assert.equal(
    calendarEvents(input, '2026-02-01', '2026-03-31', 'UTC')
      .filter((e) => e.type === 'bill')
      .map((e) => e.day)
      .join(','),
    '2026-02-28,2026-03-31',
  );
});
test('Today cache is user scoped and invalidation cannot leak another user’s data', async () => {
  let calls = 0;
  const load = async () => ({ counter: ++calls });
  const a = await cachedToday('a:UTC:day', false, load);
  assert.deepEqual(await cachedToday('a:UTC:day', false, load), a);
  assert.equal((await cachedToday('b:UTC:day', false, load)).counter, 2);
  invalidateToday('a');
  assert.equal((await cachedToday('a:UTC:day', false, load)).counter, 3);
});
test('ritual validation limits Top 3, rejects overlap, and requires a later deferral date', () => {
  const id = '11111111-1111-4111-8111-111111111111',
    ref = { type: 'task', id };
  const base = {
    kind: 'morning',
    day: '2026-10-17',
    topThree: [ref],
    deferred: [],
    deferredTo: '2026-10-18',
    capacityMinutes: 480,
    wins: '',
    reflection: '',
    nextFocus: [],
    expectedRevision: 0,
  };
  assert.equal(ritualInput.safeParse(base).success, true);
  assert.equal(
    ritualInput.safeParse({ ...base, deferred: [ref] }).success,
    false,
  );
  assert.equal(
    ritualInput.safeParse({
      ...base,
      topThree: [],
      deferred: [ref],
      deferredTo: '2026-10-17',
    }).success,
    false,
  );
  assert.equal(
    boxInput.safeParse({
      taskId: id,
      day: '2026-02-30',
      startsAt: '2026-03-02T08:00:00Z',
      minutes: 30,
    }).success,
    false,
  );
});

test('calendar day boundaries handle a midnight DST gap and a 25-hour fall-back day',()=>{
 const {calendarDayBounds}=loadTs('src/lib/rhythm/logic.ts');
 const gap=calendarDayBounds('2026-09-06','America/Santiago');assert.equal(gap.start,'2026-09-06T04:00:00.000Z');assert.equal((Date.parse(gap.end)-Date.parse(gap.start))/3600000,23);
 const fall=calendarDayBounds('2026-11-01','America/New_York');assert.equal((Date.parse(fall.end)-Date.parse(fall.start))/3600000,25);
});
