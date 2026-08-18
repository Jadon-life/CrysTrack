import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const DAY_MS = 24 * 60 * 60 * 1000;

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function occurrenceDateKey(value: string) {
  return value.slice(0, 10);
}

function calculateStreak(
  weekdays: number[],
  occurrences: Array<{ date: string; status: string }>,
  today = new Date(),
) {
  if (weekdays.length === 0) return 0;

  const completed = new Set(
    occurrences
      .filter((o) => o.status === 'completed')
      .map((o) => occurrenceDateKey(o.date)),
  );

  let streak = 0;
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // A current scheduled day should not break the streak before the user has had a chance to complete it.
  if (weekdays.includes(cursor.getDay()) && !completed.has(localDateKey(cursor))) {
    cursor = new Date(cursor.getTime() - DAY_MS);
  }

  for (let checked = 0; checked < 366; checked += 1) {
    if (!weekdays.includes(cursor.getDay())) {
      cursor = new Date(cursor.getTime() - DAY_MS);
      continue;
    }

    if (!completed.has(localDateKey(cursor))) break;
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }

  return streak;
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
  const historyStart = new Date(Date.now() - 370 * DAY_MS).toISOString();

  const { data: occurrences, error: occurrenceError } = await supabase
    .from('task_occurrences')
    .select('id, task_id, date, status, completed_at')
    .in('task_id', taskIds)
    .gte('date', historyStart)
    .order('date', { ascending: false });

  if (occurrenceError) return NextResponse.json({ error: occurrenceError.message }, { status: 500 });

  const todayKey = localDateKey();
  const todayWeekday = new Date().getDay();
  const byTask = new Map<string, any[]>();
  for (const occurrence of occurrences || []) {
    const list = byTask.get(occurrence.task_id) || [];
    list.push(occurrence);
    byTask.set(occurrence.task_id, list);
  }

  const enriched = tasks.map((task: any) => {
    const taskOccurrences = byTask.get(task.id) || [];
    const weekdays = (task.task_schedules || []).map((schedule: any) => schedule.weekday);
    const todayOccurrence = taskOccurrences.find((occurrence: any) => occurrenceDateKey(occurrence.date) === todayKey);
    const scheduledToday = weekdays.includes(todayWeekday);

    return {
      ...task,
      scheduled_today: scheduledToday,
      today_status: scheduledToday ? (todayOccurrence?.status || 'pending') : 'not_scheduled',
      streak: calculateStreak(weekdays, taskOccurrences),
    };
  });

  return NextResponse.json(enriched);
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const title = String(body.title || '').trim();
  const schedules: number[] = Array.isArray(body.schedules)
    ? Array.from(new Set<number>(body.schedules.map((day: unknown) => Number(day))))
        .filter((day: number) => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];

  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  if (schedules.length === 0) return NextResponse.json({ error: 'Select at least one valid day' }, { status: 400 });

  const { data: task, error } = await supabase
    .from('recurring_tasks')
    .insert({
      user_id: user.id,
      title,
      description: body.description || null,
      preferred_time: body.preferredTime || null,
      category: body.category || null,
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
