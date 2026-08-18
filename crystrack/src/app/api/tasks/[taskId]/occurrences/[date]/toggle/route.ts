import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateKey(value: string) {
  if (!DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(_request: Request, { params }: { params: { taskId: string; date: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const occurrenceDate = parseDateKey(params.date);
  if (!occurrenceDate) return NextResponse.json({ error: 'Invalid occurrence date' }, { status: 400 });

  const { data: task, error: taskError } = await supabase
    .from('recurring_tasks')
    .select('id, title, task_schedules(weekday)')
    .eq('id', params.taskId)
    .eq('user_id', user.id)
    .is('archived_at', null)
    .single();
  if (taskError || !task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const weekday = occurrenceDate.getUTCDay();
  if (!(task.task_schedules || []).some((schedule: any) => schedule.weekday === weekday)) {
    return NextResponse.json({ error: 'Task is not scheduled for this day' }, { status: 409 });
  }

  const dateIso = occurrenceDate.toISOString();
  const nextDate = new Date(occurrenceDate.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const { data: existing, error: occurrenceError } = await supabase
    .from('task_occurrences')
    .select('*')
    .eq('task_id', task.id)
    .gte('date', dateIso)
    .lt('date', nextDate)
    .maybeSingle();
  if (occurrenceError) return NextResponse.json({ error: occurrenceError.message }, { status: 500 });
  if (existing?.status === 'skipped' || existing?.status === 'missed') {
    return NextResponse.json({ error: `This task is already ${existing.status}` }, { status: 409 });
  }

  const completing = existing?.status !== 'completed';
  const payload = { status: completing ? 'completed' : 'pending', completed_at: completing ? new Date().toISOString() : null };
  const { data: occurrence, error } = existing
    ? await supabase.from('task_occurrences').update(payload).eq('id', existing.id).select().single()
    : await supabase.from('task_occurrences').insert({ task_id: task.id, date: dateIso, ...payload }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (completing) {
    await supabase.from('activity_events').insert({
      user_id: user.id,
      type: 'task_completed',
      entity_type: 'task',
      entity_id: task.id,
      metadata_json: { title: task.title, status: 'completed', date: params.date },
    });
  } else {
    await supabase.from('activity_events').delete()
      .eq('user_id', user.id)
      .eq('type', 'task_completed')
      .eq('entity_type', 'task')
      .eq('entity_id', task.id)
      .contains('metadata_json', { date: params.date });
  }

  return NextResponse.json(occurrence);
}
