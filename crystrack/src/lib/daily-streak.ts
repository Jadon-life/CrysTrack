/** Pure calculations over trusted historical snapshots; never current routine schedules. */
export type RoutineOutcome = 'completed' | 'pending' | 'skipped' | 'missed';

export interface DailySnapshot {
  date: string;
  /** Both the historical schedule and all occurrence pages must be verified. */
  evidence: 'verified' | 'incomplete';
  scheduledRoutineIds: readonly string[];
  outcomes: readonly { routineId: string; status: RoutineOutcome }[];
}

export interface DailyStreakInput {
  timezone: string;
  /** Explicit clock keeps calculations deterministic. */
  now: Date;
  coverageStart: string;
  /** True only when coverage starts at the known beginning of tracked history. */
  historyFromBeginning: boolean;
  snapshots: readonly DailySnapshot[];
  shield?: { enabled: false };
}

export interface DailyOutcome {
  date: string;
  outcome: 'success' | 'neutral' | 'incomplete' | 'unknown';
  scheduled: number | null;
  completed: number | null;
}

export interface DailyStreakResult {
  today: DailyOutcome;
  /** Closed days only. Null means earlier evidence could change the value. */
  current: { value: number | null; verifiedDays: number; status: 'complete' | 'partial' };
  /** Lower bound over verified contiguous segments, never an invented lifetime best. */
  best: { observed: number; status: 'complete' | 'partial' };
  coverage: { start: string; through: string; unknownDates: string[]; complete: boolean };
  shield: { enabled: false };
}

function assertDay(date: string) {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid local day key');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('Invalid local day key');
  }
}

/** UTC is used only as a calendar-key container, never to measure local elapsed days. */
function adjacentDay(date: string, step: number) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + step);
  return parsed.toISOString().slice(0, 10);
}

export function streakLocalDay(now: Date, timezone: string): string {
  if (!Number.isFinite(now.getTime()) || !timezone.trim()) throw new Error('Valid clock and saved timezone required');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  const date = `${value('year')}-${value('month')}-${value('day')}`;
  assertDay(date);
  return date;
}

function classify(date: string, snapshots: readonly DailySnapshot[]): DailyOutcome {
  const unknown: DailyOutcome = { date, outcome: 'unknown', scheduled: null, completed: null };
  // Even duplicate day snapshots that look identical lack a unique authoritative version.
  if (snapshots.length !== 1 || snapshots[0].evidence !== 'verified') return unknown;
  const snapshot = snapshots[0];
  const scheduled = new Set(snapshot.scheduledRoutineIds);
  if ([...scheduled].some((id) => !id)) return unknown;
  const statuses = new Map<string, RoutineOutcome>();
  for (const item of snapshot.outcomes) {
    if (!scheduled.has(item.routineId) || !['completed', 'pending', 'skipped', 'missed'].includes(item.status)) return unknown;
    const previous = statuses.get(item.routineId);
    if (previous && previous !== item.status) return unknown;
    statuses.set(item.routineId, item.status);
  }
  // Absence is not evidence of pending: callers must supply explicit outcomes.
  if (statuses.size !== scheduled.size) return unknown;
  const completed = [...statuses.values()].filter((status) => status === 'completed').length;
  return {
    date, scheduled: scheduled.size, completed,
    outcome: scheduled.size === 0 ? 'neutral' : completed === scheduled.size ? 'success' : 'incomplete',
  };
}

export function calculateDailyStreak(input: DailyStreakInput): DailyStreakResult {
  if (input.shield && input.shield.enabled !== false) throw new Error('Streak Shield is not supported');
  const todayKey = streakLocalDay(input.now, input.timezone);
  assertDay(input.coverageStart);
  if (input.coverageStart > todayKey) throw new Error('Coverage starts after today');
  const byDate = new Map<string, DailySnapshot[]>();
  for (const snapshot of input.snapshots) {
    assertDay(snapshot.date);
    if (snapshot.date < input.coverageStart || snapshot.date > todayKey) throw new Error('Snapshot outside coverage');
    byDate.set(snapshot.date, [...(byDate.get(snapshot.date) || []), snapshot]);
  }
  const days: DailyOutcome[] = [];
  for (let date = input.coverageStart; date < todayKey; date = adjacentDay(date, 1)) {
    days.push(classify(date, byDate.get(date) || []));
  }
  const unknownDates = days.filter((day) => day.outcome === 'unknown').map((day) => day.date);
  const complete = input.historyFromBeginning && unknownDates.length === 0;
  let run = 0;
  let observed = 0;
  for (const day of days) {
    if (day.outcome === 'success') run += 1;
    else if (day.outcome !== 'neutral') run = 0;
    observed = Math.max(observed, run);
  }
  let verifiedDays = 0;
  let exact = input.historyFromBeginning;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const outcome = days[i].outcome;
    if (outcome === 'success') verifiedDays += 1;
    if (outcome === 'unknown') { exact = false; break; }
    if (outcome === 'incomplete') { exact = true; break; }
  }
  return {
    today: classify(todayKey, byDate.get(todayKey) || []),
    current: { value: exact ? verifiedDays : null, verifiedDays, status: exact ? 'complete' : 'partial' },
    best: { observed, status: complete ? 'complete' : 'partial' },
    coverage: { start: input.coverageStart, through: adjacentDay(todayKey, -1), unknownDates, complete },
    shield: { enabled: false },
  };
}
