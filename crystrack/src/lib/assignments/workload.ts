import { dateKeyForInstant } from '@/lib/reminders';
import { shiftAcademicDay } from './time';
import type {
  AcademicAssignment,
  AcademicWorkload,
  AssignmentStatus,
} from '@/types/assignments';
export function assignmentStatus(
  item: Pick<AcademicAssignment, 'deadline' | 'status'>,
  now: Date,
  timezone: string,
): AssignmentStatus {
  if (item.status === 'completed' || item.status === 'dropped')
    return item.status;
  const due = Date.parse(item.deadline);
  if (due < now.getTime()) return 'overdue';
  const today = dateKeyForInstant(now, timezone),
    day = dateKeyForInstant(new Date(due), timezone);
  if (day === today) return 'due_today';
  return day <= shiftAcademicDay(today, 3) ? 'due_soon' : 'upcoming';
}
export function completionLabel(status: string, late: boolean) {
  return status === 'completed'
    ? late
      ? 'Finished Late'
      : 'Finished'
    : status === 'dropped'
      ? 'Dropped'
      : null;
}
export function subtaskPercent(items: { completed: boolean }[]) {
  return items.length
    ? Math.round(
        (items.filter((i) => i.completed).length * 1000) / items.length,
      ) / 10
    : 0;
}
export function academicWorkload(
  items: Pick<
    AcademicAssignment,
    'deadline' | 'status' | 'estimated_minutes'
  >[],
  now: Date,
  timezone: string,
  weeklyLimitMinutes = 600,
  dailyLimitMinutes = 240,
): AcademicWorkload {
  const today = dateKeyForInstant(now, timezone);
  const days = Array.from({ length: 7 }, (_, i) => ({
    day: shiftAcademicDay(today, i),
    minutes: 0,
    count: 0,
    unestimated: 0,
  }));
  let overdueCount = 0;
  for (const item of items) {
    if (['completed', 'dropped'].includes(item.status)) continue;
    const deadline = new Date(item.deadline);
    if (!Number.isFinite(deadline.getTime())) continue;
    if (deadline.getTime() < now.getTime()) {
      overdueCount++;
      continue;
    }
    const bucket = days.find(
      (d) => d.day === dateKeyForInstant(deadline, timezone),
    );
    if (!bucket) continue;
    bucket.count++;
    if (
      item.estimated_minutes == null ||
      !Number.isInteger(item.estimated_minutes) ||
      item.estimated_minutes < 0
    )
      bucket.unestimated++;
    else bucket.minutes += item.estimated_minutes;
  }
  const count = days.reduce((n, d) => n + d.count, 0),
    minutes = days.reduce((n, d) => n + d.minutes, 0),
    unestimated = days.reduce((n, d) => n + d.unestimated, 0);
  return {
    days,
    count,
    minutes,
    unestimated,
    overdueCount,
    weeklyLimitMinutes,
    dailyLimitMinutes,
    warning:
      minutes > weeklyLimitMinutes ||
      days.some((d) => d.minutes > dailyLimitMinutes),
  };
}
export function workloadSummary(workload: AcademicWorkload) {
  return `${workload.count} item${workload.count === 1 ? '' : 's'} due in the next 7 days totaling ${Number((workload.minutes / 60).toFixed(2))} hours`;
}
