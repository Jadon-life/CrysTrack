/** Pure Today-dashboard calculations. No database access or clock assumptions. */
export interface TodayTask {
  id: string;
  title: string;
  preferred_time?: string | null;
  today_status?: string | null;
  scheduled_today?: boolean;
}

export interface TodayAssignment {
  deadline: string;
  computed_status?: string | null;
}

export type TodayMutation = 'toggle' | 'skip';

export function dayInTimezone(timezone: string, now = new Date()): { dateKey: string; weekday: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
  }
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const dateKey = [value('year'), value('month'), value('day')].join('-');
  const weekday = new Date(dateKey + 'T12:00:00Z').getUTCDay();
  return { dateKey, weekday };
}

export function summarizeToday(tasks: TodayTask[]) {
  const scheduled = tasks.filter((task) => task.scheduled_today);
  const total = scheduled.length;
  const completed = scheduled.filter((task) => task.today_status === 'completed').length;
  const skipped = scheduled.filter((task) => task.today_status === 'skipped').length;
  return {
    total,
    completed,
    skipped,
    remaining: total - completed - skipped,
    percent: total ? Math.round((completed / total) * 100) : 0,
    allDone: total > 0 && completed === total,
  };
}

export function nextTodayTaskStatus(status: string | null | undefined, action: TodayMutation) {
  if (status === 'missed') return null;
  if (action === 'toggle') {
    if (status === 'skipped') return null;
    return status === 'completed' ? 'pending' : 'completed';
  }
  if (status === 'completed') return null;
  return status === 'skipped' ? 'pending' : 'skipped';
}

export function groupTodayTasks<T extends TodayTask>(tasks: T[]) {
  const groups = [
    { key: 'morning', label: 'Morning', tasks: [] as T[] },
    { key: 'afternoon', label: 'Afternoon', tasks: [] as T[] },
    { key: 'evening', label: 'Evening', tasks: [] as T[] },
    { key: 'anytime', label: 'Anytime', tasks: [] as T[] },
  ];
  for (const task of tasks) {
    const time = task.preferred_time || '';
    const match = /^([01]\d|2[0-3]):[0-5]\d/.exec(time);
    if (!match) { groups[3].tasks.push(task); continue; }
    const hour = Number(match[1]);
    const index = hour < 12 ? 0 : hour < 17 ? 1 : 2;
    groups[index].tasks.push(task);
  }
  for (const group of groups) {
    group.tasks.sort((a, b) =>
      (a.preferred_time || '99:99').localeCompare(b.preferred_time || '99:99'));
  }
  return groups.filter((group) => group.tasks.length > 0);
}

export function dueSoonAssignments<T extends TodayAssignment>(assignments: T[], limit = 4) {
  return assignments
    .filter((assignment) => ['overdue', 'due_today', 'due_soon'].includes(assignment.computed_status || ''))
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, limit);
}
