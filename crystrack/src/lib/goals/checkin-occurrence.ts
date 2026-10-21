import { dateKeyForInstant, localClock, weekdayForDateKey } from '@/lib/reminders';

export interface GoalCheckinConfigLike {
  frequency?: string | null;
  days?: unknown;
  time?: string | null;
}

export interface GoalCheckinWindow {
  frequency: 'daily' | 'weekly' | 'specific';
  occurrenceKey: string | null;
  startDate: string | null;
  endDate: string | null;
  available: boolean;
  scheduledToday: boolean;
  nextStartDate: string;
}

function shiftDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalisedDays(config: GoalCheckinConfigLike) {
  const days = Array.isArray(config.days)
    ? config.days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];
  return Array.from(new Set(days));
}

function nextSpecificDate(dateKey: string, weekday: number, days: number[]) {
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = shiftDateKey(dateKey, offset);
    if (days.includes(weekdayForDateKey(candidate))) return candidate;
  }
  return shiftDateKey(dateKey, 1);
}

export function goalCheckinWindow(
  config: GoalCheckinConfigLike | null | undefined,
  now: Date,
  timezone: string,
): GoalCheckinWindow {
  const safeConfig = config || {};
  const frequency = safeConfig.frequency === 'daily' || safeConfig.frequency === 'specific'
    ? safeConfig.frequency
    : 'weekly';
  const clock = localClock(now, timezone || 'UTC');
  const dateKey = clock.dateKey;
  const days = normalisedDays(safeConfig);

  if (frequency === 'daily') {
    return {
      frequency,
      occurrenceKey: `daily:${dateKey}`,
      startDate: dateKey,
      endDate: dateKey,
      available: true,
      scheduledToday: true,
      nextStartDate: shiftDateKey(dateKey, 1),
    };
  }

  if (frequency === 'specific') {
    const scheduledToday = days.includes(clock.weekday);
    return {
      frequency,
      occurrenceKey: scheduledToday ? `specific:${dateKey}` : null,
      startDate: scheduledToday ? dateKey : null,
      endDate: scheduledToday ? dateKey : null,
      available: scheduledToday,
      scheduledToday,
      nextStartDate: nextSpecificDate(dateKey, clock.weekday, days),
    };
  }

  const selectedWeekday = days[0] ?? clock.weekday;
  const daysBack = (clock.weekday - selectedWeekday + 7) % 7;
  const startDate = shiftDateKey(dateKey, -daysBack);
  const endDate = shiftDateKey(startDate, 6);

  return {
    frequency: 'weekly',
    occurrenceKey: `weekly:${startDate}`,
    startDate,
    endDate,
    available: true,
    scheduledToday: clock.weekday === selectedWeekday,
    nextStartDate: shiftDateKey(startDate, 7),
  };
}

export function goalCheckinState(
  config: GoalCheckinConfigLike | null | undefined,
  checkins: Array<{ occurrence_key?: string | null }>,
  now: Date,
  timezone: string,
) {
  const window = goalCheckinWindow(config, now, timezone);
  const completed = Boolean(
    window.occurrenceKey
      && checkins.some((checkin) => checkin.occurrence_key === window.occurrenceKey),
  );

  return {
    frequency: window.frequency,
    occurrenceKey: window.occurrenceKey,
    occurrenceStartDate: window.startDate,
    occurrenceEndDate: window.endDate,
    nextOccurrenceStartDate: window.nextStartDate,
    scheduledToday: window.scheduledToday,
    completed,
    available: window.available && !completed,
    due: window.available && !completed,
    status: completed ? 'completed' : window.available ? 'due' : 'not_scheduled',
  } as const;
}

export function goalCheckinAccountability(
  goal: { created_at?: string | null; checkin_config?: GoalCheckinConfigLike | null },
  checkins: Array<{ occurrence_key?: string | null; occurrence_start_date?: string | null; created_at?: string | null }>,
  now: Date,
  timezone: string,
  lookbackDays = 30,
) {
  const today = dateKeyForInstant(now, timezone || 'UTC');
  const createdKey = goal.created_at ? dateKeyForInstant(new Date(goal.created_at), timezone || 'UTC') : today;
  const startCandidate = shiftDateKey(today, -(Math.max(1, lookbackDays) - 1));
  const start = createdKey > startCandidate ? createdKey : startCandidate;
  const completedStarts = new Set(
    checkins
      .map((item) => item.occurrence_start_date || null)
      .filter((value): value is string => Boolean(value)),
  );
  const config = goal.checkin_config || {};
  const frequency = config.frequency === 'daily' || config.frequency === 'specific' ? config.frequency : 'weekly';
  const days = normalisedDays(config);

  let scheduled = 0;
  let completed = 0;
  let missed = 0;

  if (frequency === 'weekly') {
    const selected = days[0] ?? weekdayForDateKey(start);
    let cursor = start;
    while (weekdayForDateKey(cursor) !== selected && cursor <= today) cursor = shiftDateKey(cursor, 1);
    while (cursor < today) {
      const periodEnd = shiftDateKey(cursor, 6);
      if (periodEnd >= today) break;
      scheduled += 1;
      if (completedStarts.has(cursor)) completed += 1;
      else missed += 1;
      cursor = shiftDateKey(cursor, 7);
    }
  } else {
    let cursor = start;
    while (cursor < today) {
      const isScheduled = frequency === 'daily' || days.includes(weekdayForDateKey(cursor));
      if (isScheduled) {
        scheduled += 1;
        if (completedStarts.has(cursor)) completed += 1;
        else missed += 1;
      }
      cursor = shiftDateKey(cursor, 1);
    }
  }

  return { scheduled, completed, missed };
}
