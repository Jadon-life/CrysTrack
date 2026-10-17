import { dateKeyForInstant } from '@/lib/reminders';
import type { GoalMilestone } from '@/types/goals';
const clamp = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value * 10) / 10));
export function milestonePercentage(
  items: Pick<GoalMilestone, 'completedAt'>[],
) {
  return items.length
    ? clamp(
        (items.filter((item) => item.completedAt).length * 100) / items.length,
      )
    : 0;
}
export function routinePercentage(completed: number, target: number) {
  return target > 0 && Number.isFinite(completed)
    ? clamp((completed * 100) / target)
    : 0;
}
export function numericPercentage(
  current: number,
  start: number,
  target: number,
) {
  return [current, start, target].every(Number.isFinite) && target !== start
    ? clamp(((current - start) * 100) / (target - start))
    : null;
}
export function shiftGoalDay(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function goalPacing(
  points: { day: string; percent: number }[],
  now: Date,
  timezone: string,
  deadline: string | null,
  status = 'active',
) {
  if (status === 'paused') return 'Your goal is resting. Ready when you are.';
  if (status === 'let_go' || status === 'abandoned')
    return 'Space made for what matters next.';
  if (status === 'achieved' || status === 'completed')
    return 'A moment worth celebrating.';
  const today = dateKeyForInstant(now, timezone);
  const byDay = new Map<string, number>();
  for (const point of points)
    if (
      point.day <= today &&
      point.day >= shiftGoalDay(today, -30) &&
      Number.isFinite(point.percent)
    )
      byDay.set(point.day, point.percent);
  const samples = [...byDay].sort(([a], [b]) => a.localeCompare(b));
  const first = samples[0],
    last = samples[samples.length - 1];
  if (last && last[1] >= 100)
    return 'Your progress is complete. Take a moment to reflect.';
  const targetText = deadline
    ? ` Target deadline is ${dateKeyForInstant(new Date(deadline), timezone)}.`
    : '';
  if (!first || !last || first === last || last[1] <= first[1])
    return `A little more progress evidence will help estimate your pace.${targetText}`;
  const elapsed = (Date.parse(last[0]) - Date.parse(first[0])) / 86400000;
  const remaining = Math.ceil(
    ((100 - last[1]) * elapsed) / (last[1] - first[1]),
  );
  if (remaining > 36500)
    return `A little more progress evidence will help estimate your pace.${targetText}`;
  return `At current speed, you finish on ${shiftGoalDay(today, remaining)};${targetText || ' you can choose a target deadline when ready.'}`;
}
