import { occurrences as financeOccurrences } from '@/lib/finance/logic';
import { dateKeyForInstant, weekdayForDateKey } from '@/lib/reminders';
import { academicDeadline, shiftAcademicDay } from '@/lib/assignments/time';
import type { CalendarEvent, Timebox, DailyRitual } from '@/types/rhythm';
export function weekStart(day: string) {
  return shiftAcademicDay(day, -weekdayForDateKey(day));
}
export function monthCells(day: string) {
  const first = day.slice(0, 7) + '-01';
  const last = new Date(`${first}T12:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const cellCount =
    Math.ceil((weekdayForDateKey(first) + last.getUTCDate()) / 7) * 7;
  return Array.from({ length: cellCount }, (_, i) =>
    shiftAcademicDay(first, i - weekdayForDateKey(first)),
  );
}
export function assignSlot(
  taskId: string,
  day: string,
  hour: number,
  minutes: number,
  timezone: string,
  existing: Timebox[] = [],
) {
  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minutes) ||
    minutes < 5 ||
    minutes > 480
  )
    throw new Error('Choose a valid hour and a block of 5–480 minutes.');
  const start = academicDeadline(
      `${day}T${String(hour).padStart(2, '0')}:00`,
      timezone,
    ),
    end = new Date(Date.parse(start) + minutes * 60000).toISOString();
  if (
    existing.some(
      (b) =>
        !(b.task_id === taskId && b.occurrence_day === day) &&
        Date.parse(start) < Date.parse(b.ends_at) &&
        Date.parse(end) > Date.parse(b.starts_at),
    )
  )
    throw new Error(
      'This slot already has a focus block. Choose another time.',
    );
  return { taskId, day, startsAt: start, minutes };
}
export function calendarDayBounds(day:string,timezone:string){
 return {start:new Date(Date.parse(academicDeadline(shiftAcademicDay(day,-1),timezone))+1).toISOString(),end:new Date(Date.parse(academicDeadline(day,timezone))+1).toISOString()};
}
export function dailyCapacity(boxes:Timebox[],day:string,timezone:string,capacity=480){
 const bounds=calendarDayBounds(day,timezone),start=Date.parse(bounds.start),end=Date.parse(bounds.end);
 const minutes=boxes.reduce((sum,b)=>sum+Math.max(0,(Math.min(end,Date.parse(b.ends_at))-Math.max(start,Date.parse(b.starts_at)))/60000),0);
 return{planned:Math.round(minutes),available:capacity,overloaded:minutes>capacity};
}
export function weeklyAggregation(
  occurrences: any[],
  assignments: any[],
  goals: any[],
  sessions: any[],
  tasks: any[],
  start: string,
  end: string,
  timezone: string,
) {
  const inWeek = (value: string | null) =>
    Boolean(
      value &&
      dateKeyForInstant(new Date(value), timezone) >= start &&
      dateKeyForInstant(new Date(value), timezone) <= end,
    );
  const done = occurrences.filter(
    (o) => o.status === 'completed' && inWeek(o.completed_at),
  );
  const areas = new Map<string, number>();
  for (const o of done) {
    const label =
      tasks.find((t) => t.id === o.task_id)?.category || 'Everyday life';
    areas.set(label, (areas.get(label) || 0) + 1);
  }
  const finishedAssignments = assignments.filter(
    (a) => a.status === 'completed' && inWeek(a.completed_at),
  );
  for (const a of finishedAssignments) {
    const label = a.course_code ? 'Learning' : a.category || 'Learning';
    areas.set(label, (areas.get(label) || 0) + 1);
  }
  const achieved = goals.filter(
    (g) =>
      ['completed', 'achieved'].includes(g.status) && inWeek(g.completed_at),
  );
  for (const g of achieved) {
    const label = g.category || 'Personal goals';
    areas.set(label, (areas.get(label) || 0) + 1);
  }
  return {
    completed: done.length + finishedAssignments.length + achieved.length,
    focusedMinutes: sessions
      .filter((s) => s.status === 'completed' && inWeek(s.completed_at))
      .reduce((n, s) => n + s.planned_minutes, 0),
    areas: [...areas].map(([label, count]) => ({ label, count })),
  };
}
export function calendarEvents(
  input: {
    tasks: any[];
    occurrences: any[];
    assignments: any[];
    goals: any[];
    flows: any[];
    bills?: import('@/types/finance').RecurringBill[];
    reminders: any[];
    boxes: Timebox[];
    rituals: DailyRitual[];
  },
  start: string,
  end: string,
  timezone: string,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const inRange = (day: string) => day >= start && day <= end;
  for (let day = start; day <= end; day = shiftAcademicDay(day, 1)) {
    for (const task of input.tasks) {
      const origin = input.rituals.find((r) => r.day === day);
      const deferred = origin?.deferred?.some(
        (r) => r.type === 'task' && r.id === task.id,
      );
      const arriving = input.rituals.some(
        (r) =>
          r.deferred_to === day &&
          r.deferred?.some((ref) => ref.type === 'task' && ref.id === task.id),
      );
      const box = input.boxes.find(
        (b) => b.task_id === task.id && b.occurrence_day === day,
      );
      const scheduled = (task.task_schedules || []).some(
        (s: any) =>
          s.weekday === weekdayForDateKey(day) &&
          (!s.start_date || s.start_date.slice(0, 10) <= day) &&
          (!s.end_date || s.end_date.slice(0, 10) >= day),
      );
      if (!deferred && (scheduled || arriving || box))
        events.push({
          id: `task:${task.id}:${day}`,
          type: 'task',
          title: task.title,
          day,
          starts_at: box?.starts_at || null,
          ends_at: box?.ends_at || null,
          href: '/tasks',
          completed: input.occurrences.some(
            (o) =>
              o.task_id === task.id &&
              o.date.slice(0, 10) === day &&
              o.status === 'completed',
          ),
          task_id: task.id,
          box_id: box?.id,
        });
    }
  }
  for (const a of input.assignments)
    if (!['completed', 'dropped'].includes(a.status)) {
      const day = dateKeyForInstant(new Date(a.deadline), timezone);
      if (inRange(day))
        events.push({
          id: `assignment:${a.id}`,
          type: 'assignment',
          title: a.title,
          day,
          starts_at: a.deadline,
          ends_at: null,
          href: '/assignments',
          completed: false,
        });
    }
  for (const g of input.goals)
    if (g.status === 'active')
      for (const m of g.milestones || [])
        if (m.dueDate && inRange(m.dueDate))
          events.push({
            id: `milestone:${g.id}:${m.id}`,
            type: 'milestone',
            title: `${g.title} · ${m.title}`,
            day: m.dueDate,
            starts_at: null,
            ends_at: null,
            href: '/goals',
            completed: Boolean(m.completedAt),
          });
  for (const r of input.reminders) {
    const day = dateKeyForInstant(new Date(r.scheduled_for), timezone);
    if (inRange(day))
      events.push({
        id: `reminder:${r.id}`,
        type: 'reminder',
        title: r.title || 'A gentle reminder',
        day,
        starts_at: r.scheduled_for,
        ends_at: null,
        href: '/calendar',
        completed: r.status === 'sent',
      });
  }
  for (const f of input.flows)
    if (f.status === 'active' && f.direction === 'expense' && f.expected_on) {
      const anchor = dateKeyForInstant(new Date(f.expected_on), timezone);
      for (let day = start; day <= end; day = shiftAcademicDay(day, 1)) {
        if (day < anchor) continue;
        const months =
          (Number(day.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 +
          Number(day.slice(5, 7)) -
          Number(anchor.slice(5, 7));
        const last = new Date(`${day.slice(0, 7)}-01T12:00:00Z`);
        last.setUTCMonth(last.getUTCMonth() + 1);
        last.setUTCDate(0);
        const aligned =
          Number(day.slice(8)) ===
          Math.min(Number(anchor.slice(8)), last.getUTCDate());
        const match =
          f.frequency === 'weekly'
            ? ((Date.parse(day) - Date.parse(anchor)) / 86400000) % 7 === 0
            : ['monthly', 'quarterly', 'yearly'].includes(f.frequency)
              ? aligned &&
                (f.frequency === 'monthly' ||
                  months % (f.frequency === 'quarterly' ? 3 : 12) === 0)
              : day === anchor;
        if (match)
          events.push({
            id: `bill:${f.id}:${day}`,
            type: 'bill',
            title: f.title || f.label || 'Recurring expense',
            day,
            starts_at: null,
            ends_at: null,
            href: '/finance',
            completed: false,
          });
      }
    }
  for(const bill of input.bills||[])if(bill.active)for(const day of financeOccurrences(bill.next_due,bill.frequency,start,end))events.push({id:`wealth-bill:${bill.id}:${day}`,type:'bill',title:bill.title,day,starts_at:null,ends_at:null,href:'/finance',completed:!!bill.last_paid_on&&day<=bill.last_paid_on});
  return events;
}
