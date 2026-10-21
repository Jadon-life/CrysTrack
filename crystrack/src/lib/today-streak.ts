import { z } from 'zod';
import { dailyContextSchema, dayKeySchema } from './daily-records';
import { calculateDailyStreak, streakLocalDay } from './daily-streak';

export const savedDailyContextSchema = dailyContextSchema.refine(context => {
  try { streakLocalDay(new Date(0), context.timezone); return true; } catch { return false; }
}, 'Invalid saved scheduling timezone');
const snapshotSchema = z.object({
  date: dayKeySchema, evidence: z.enum(['verified', 'incomplete']),
  scheduledRoutineIds: z.array(z.string().uuid()),
  outcomes: z.array(z.object({ routineId: z.string().uuid(), status: z.enum(['completed', 'pending', 'skipped', 'missed']) })),
}).strict().refine(snapshot => new Set(snapshot.scheduledRoutineIds).size === snapshot.scheduledRoutineIds.length &&
  new Set(snapshot.outcomes.map(outcome => outcome.routineId)).size === snapshot.outcomes.length, 'Duplicate routine evidence');
const windowSchema = z.object({ context: savedDailyContextSchema, snapshots: z.array(snapshotSchema) }).strict();

/** Calendar arithmetic, not elapsed 24-hour intervals in a DST zone. */
export function stepDailyKey(day: string, amount: number) {
  dayKeySchema.parse(day);
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return dayKeySchema.parse(date.toISOString().slice(0, 10));
}

/** The server's saved-zone day is authoritative, including in a fixed-date synthetic demo. */
function instantInDay(day: string, timezone: string) {
  const instant = new Date(`${day}T12:00:00Z`);
  for (let attempt = 0; streakLocalDay(instant, timezone) !== day && attempt < 4; attempt++) {
    instant.setTime(instant.getTime() + (streakLocalDay(instant, timezone) < day ? 1 : -1) * 12 * 3600000);
  }
  if (streakLocalDay(instant, timezone) !== day) throw new Error('Unrepresentable saved day');
  return instant;
}

class DailyBoundaryChanged extends Error {}

export function presentTodayStreak(rawContext: unknown, rawWindow: unknown) {
  const context = savedDailyContextSchema.parse(rawContext);
  const window = windowSchema.parse(rawWindow);
  if (JSON.stringify(window.context) !== JSON.stringify(context)) throw new DailyBoundaryChanged('Daily context changed; retry');
  const from = stepDailyKey(context.day, -6);
  const result = calculateDailyStreak({ timezone: context.timezone, now: instantInDay(context.day, context.timezone),
    coverageStart: from, historyFromBeginning: false, snapshots: window.snapshots });
  const days = Array.from({length: 7}, (_, index) => {
    const date = stepDailyKey(from, index);
    const outcome = calculateDailyStreak({ timezone: context.timezone, now: instantInDay(date, context.timezone),
      coverageStart: date, historyFromBeginning: false, snapshots: window.snapshots.filter(snapshot => snapshot.date === date) }).today;
    const today = date === context.day;
    return { ...outcome, state: today ? 'today' as const : outcome.outcome,
      label: today ? (outcome.outcome === 'unknown' ? 'Today in progress · history not yet verified' :
        outcome.outcome === 'neutral' ? 'Today in progress · no tasks scheduled' :
        `Today in progress · ${outcome.completed} of ${outcome.scheduled} completed`) :
        ({ success: 'Completed day', incomplete: 'Incomplete day', neutral: 'Verified no tasks', unknown: 'History not yet verified' }[outcome.outcome]) };
  });
  return { context, result, days, currentLabel: result.current.value === null ? 'Not yet verified' :
    `${result.current.value} ${result.current.value === 1 ? 'day' : 'days'}`,
    bestLabel: result.best.observed > 0 ? `At least ${result.best.observed} ${result.best.observed === 1 ? 'day' : 'days'}` :
      days.slice(0, -1).some(day => day.state !== 'unknown') ? 'No completed days observed' : 'Not yet verified' };
}
export type TodayStreakView = ReturnType<typeof presentTodayStreak>;

/** Only the assembled daily endpoint supplies history. Never use tasks or local caches. */
export async function loadTodayStreak(read: (url: string) => Promise<unknown>) {
  for (let attempt = 0; ; attempt++) {
    const context = savedDailyContextSchema.parse(await read('/api/daily-records/context'));
    try {
      return presentTodayStreak(context, await read(`/api/daily-records?from=${stepDailyKey(context.day, -6)}&to=${context.day}`));
    } catch (error) {
      // A midnight/timezone transition between these two reads gets one fresh pair.
      if (!(error instanceof DailyBoundaryChanged) || attempt >= 1) throw error;
    }
  }
}

/** Latest request wins even if an aborted transport still resolves. */
export function latestDailyRead() {
  let generation = 0;
  let controller: AbortController | undefined;
  return {
    start() { controller?.abort(); controller = new AbortController(); const id = ++generation;
      return { signal: controller.signal, isCurrent: () => id === generation }; },
    cancel() { generation++; controller?.abort(); },
  };
}

/** One bounded wake-up at saved-zone midnight; no dashboard polling. */
export function nextDailyBoundary(timezone: string, now = new Date()) {
  const day = streakLocalDay(now, timezone);
  let low = now.getTime(), high = low + 48 * 3600000;
  while (high - low > 1000) {
    const middle = Math.floor((low + high) / 2);
    if (streakLocalDay(new Date(middle), timezone) === day) low = middle; else high = middle;
  }
  return high - now.getTime() + 1000;
}
