import { createClient } from '@/lib/supabase/server';
import { dailyContext, dailyWindow, dailyFailure } from '@/lib/daily-records-server';
import { dayKeySchema } from '@/lib/daily-records';
import { NextResponse } from 'next/server';

const DAY_MS = 24 * 60 * 60 * 1000;

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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
  const context = await dailyContext(supabase);
  const url = new URL(request.url);
  const requestedDate = url.searchParams.get('date');
  const todayKey = requestedDate ? dayKeySchema.parse(requestedDate) : context.day;
  const todayDate = dateKeyToDate(todayKey)!;
  const window = await dailyWindow(supabase,todayKey,todayKey);
  const frozen = window.records[0]?.routines || [];

  const { data: tasks, error: taskError } = await supabase
    .from('recurring_tasks')
    .select('*, task_schedules(*)')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (taskError) throw taskError;
  const taskList = [...(tasks || [])];
  for (const row of frozen) {
    if (!taskList.some(task => task.id === row.routine_key)) taskList.push({id:row.routine_key,user_id:user.id,task_schedules:[],title:row.title});
  }
  if (!taskList.length) return NextResponse.json([]);

  const taskIds = taskList.map((task: any) => task.id);
  const historyStart = new Date((todayDate?.getTime() || Date.now()) - 370 * DAY_MS).toISOString();
  const { data: occurrences, error: occurrenceError } = await supabase
    .from('task_occurrences')
    .select('id, task_id, date, status, completed_at')
    .in('task_id', taskIds)
    .gte('date', historyStart)
    .order('date', { ascending: false });

  if (occurrenceError) throw occurrenceError;

  const byTask = new Map<string, any[]>();
  for (const occurrence of occurrences || []) {
    const list = byTask.get(occurrence.task_id) || [];
    list.push(occurrence);
    byTask.set(occurrence.task_id, list);
  }

  return NextResponse.json(taskList.map((task: any) => {
    const taskOccurrences = byTask.get(task.id) || [];
    const weekdays = (task.task_schedules || []).map((schedule: any) => schedule.weekday);
    const todayOccurrence = taskOccurrences.find((occurrence: any) => occurrenceDateKey(occurrence.date) === todayKey);
    const daily = frozen.find(row => row.routine_key === task.id);
    const scheduledToday = Boolean(daily); // Missing historical eligibility remains unknown.
    const snapshot = daily ? {title:daily.title,description:daily.description,preferred_time:daily.preferred_time,category:daily.category} : {};
    return {
      ...task, ...snapshot,
      daily_revision: daily?.revision || null,
      daily_day: context.day,
      scheduling_timezone: context.timezone,
      scheduled_today: scheduledToday,
      today_status: scheduledToday ? (daily?.status || todayOccurrence?.status || 'pending') : 'not_scheduled',
      today_occurrence_id: daily?.compatibility_occurrence_id || todayOccurrence?.id || null,
      streak: calculateStreak(weekdays, taskOccurrences, todayKey),
    };
  }));
  } catch (error) { return dailyFailure(error,'read-tasks'); }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
  const body = await request.json();
  const { data, error } = await supabase.rpc('daily_create_routine', {p_payload: {
    title:body.title, description:body.description || null, preferredTime:body.preferredTime || null,
    category:body.category || null, schedules:body.schedules, reminderConfig:normaliseReminderConfig(body.reminderConfig),
  }});
  if (error) throw error;
  return NextResponse.json(data,{status:201});
  } catch (error) { return dailyFailure(error,'create-routine'); }
}
