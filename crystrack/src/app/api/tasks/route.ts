import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateKeyToDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function occurrenceDateKey(value: string) {
  return value.slice(0, 10);
}

function calculateStreak(
  weekdays: number[],
  occurrences: Array<{ date: string; status: string }>,
  todayKey: string,
) {
  const start = dateKeyToDate(todayKey);
  if (!start || weekdays.length === 0) return 0;

  const completed = new Set(
    occurrences.filter((occurrence) => occurrence.status === 'completed').map((occurrence) => occurrenceDateKey(occurrence.date)),
  );

  let streak = 0;
  let cursor = new Date(start.getTime());
  if (weekdays.includes(cursor.getUTCDay()) && !completed.has(todayKey)) cursor = new Date(cursor.getTime() - DAY_MS);

  for (let checked = 0; checked < 366; checked += 1) {
    if (!weekdays.includes(cursor.getUTCDay())) {
      cursor = new Date(cursor.getTime() - DAY_MS);
      continue;
    }
    const key = cursor.toISOString().slice(0, 10);
    if (!completed.has(key)) break;
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return streak;
}

function normaliseReminderConfig(value: any) {
  const channels = Array.isArray(value?.channels)
    ? Array.from(new Set(value.channels.filter((channel: unknown) => channel === 'push' || channel === 'telegram')))
    : ['push'];
  return {
    enabled: value?.enabled !== false,
    channels: channels.length ? channels : ['push'],
    beforeMinutes: Math.min(180, Math.max(0, Number(value?.beforeMinutes ?? 15) || 0)),
    atPreferredTime: value?.atPreferredTime !== false,
    followUpMinutes: Array.isArray(value?.followUpMinutes)
      ? value.followUpMinutes.map(Number).filter((minutes: number) => Number.isFinite(minutes) && minutes > 0 && minutes <= 720).slice(0, 4)
      : [120],
    endOfDayReminder: value?.endOfDayReminder !== false,
  };
}

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const requestedDate = url.searchParams.get('date');
  const todayKey = requestedDate && DATE_RE.test(requestedDate) ? requestedDate : new Date().toISOString().slice(0, 10);
  const todayDate = dateKeyToDate(todayKey) || new Date();
  const requestedWeekday = Number(url.searchParams.get('weekday'));
  const todayWeekday = Number.isInteger(requestedWeekday) && requestedWeekday >= 0 && requestedWeekday <= 6
    ? requestedWeekday
    : todayDate.getUTCDay();

  const { data: tasks, error: taskError } = await supabase
    .from('recurring_tasks')
    .select('*, task_schedules(*)')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (taskError) return NextResponse.json({ error: taskError.message }, { status: 500 });
  if (!tasks?.length) return NextResponse.json([]);

  const taskIds = tasks.map((task: any) => task.id);
  const historyStart = new Date((todayDate?.getTime() || Date.now()) - 370 * DAY_MS).toISOString();
  const { data: occurrences, error: occurrenceError } = await supabase
    .from('task_occurrences')
    .select('id, task_id, date, status, completed_at')
    .in('task_id', taskIds)
    .gte('date', historyStart)
    .order('date', { ascending: false });

  if (occurrenceError) return NextResponse.json({ error: occurrenceError.message }, { status: 500 });

  const byTask = new Map<string, any[]>();
  for (const occurrence of occurrences || []) {
    const list = byTask.get(occurrence.task_id) || [];
    list.push(occurrence);
    byTask.set(occurrence.task_id, list);
  }

  return NextResponse.json(tasks.map((task: any) => {
    const taskOccurrences = byTask.get(task.id) || [];
    const weekdays = (task.task_schedules || []).map((schedule: any) => schedule.weekday);
    const todayOccurrence = taskOccurrences.find((occurrence: any) => occurrenceDateKey(occurrence.date) === todayKey);
    const scheduledToday = weekdays.includes(todayWeekday);
    return {
      ...task,
      scheduled_today: scheduledToday,
      today_status: scheduledToday ? (todayOccurrence?.status || 'pending') : 'not_scheduled',
      today_occurrence_id: todayOccurrence?.id || null,
      streak: calculateStreak(weekdays, taskOccurrences, todayKey),
    };
  }));
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const title = String(body.title || '').trim();
  const schedules: number[] = Array.isArray(body.schedules)
    ? Array.from(new Set<number>(body.schedules.map((day: unknown) => Number(day)))).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];

  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  if (!schedules.length) return NextResponse.json({ error: 'Select at least one valid day' }, { status: 400 });

  const { data: task, error } = await supabase
    .from('recurring_tasks')
    .insert({
      user_id: user.id,
      title,
      description: body.description || null,
      preferred_time: body.preferredTime || null,
      category: body.category || null,
      reminder_config: normaliseReminderConfig(body.reminderConfig),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const scheduleRows = schedules.map((weekday) => ({ task_id: task.id, weekday }));
  const { error: scheduleError } = await supabase.from('task_schedules').insert(scheduleRows);
  if (scheduleError) {
    await supabase.from('recurring_tasks').delete().eq('id', task.id).eq('user_id', user.id);
    return NextResponse.json({ error: scheduleError.message }, { status: 500 });
  }

  return NextResponse.json({ ...task, task_schedules: scheduleRows }, { status: 201 });
}
