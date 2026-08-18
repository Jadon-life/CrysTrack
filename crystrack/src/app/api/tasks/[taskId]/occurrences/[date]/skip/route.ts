import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(_request: Request, { params }: { params: { taskId: string; date: string } }) {
  if (!DATE_RE.test(params.date)) return NextResponse.json({ error: 'Invalid occurrence date' }, { status: 400 });
  const occurrenceDate = new Date(`${params.date}T00:00:00.000Z`);
  if (Number.isNaN(occurrenceDate.getTime())) return NextResponse.json({ error: 'Invalid occurrence date' }, { status: 400 });

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: task } = await supabase
    .from('recurring_tasks')
    .select('id, title, task_schedules(weekday)')
    .eq('id', params.taskId)
    .eq('user_id', user.id)
    .is('archived_at', null)
    .single();
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  if (!(task.task_schedules || []).some((schedule: any) => schedule.weekday === occurrenceDate.getUTCDay())) {
    return NextResponse.json({ error: 'Task is not scheduled for this day' }, { status: 409 });
  }

  const start = occurrenceDate.toISOString();
  const end = new Date(occurrenceDate.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabase.from('task_occurrences').select('*').eq('task_id', task.id).gte('date', start).lt('date', end).maybeSingle();
  if (existing?.status === 'completed') return NextResponse.json({ error: 'Completed tasks cannot be skipped' }, { status: 409 });
  if (existing?.status === 'missed') return NextResponse.json({ error: 'Missed tasks cannot be changed after the day closes' }, { status: 409 });

  const skipping = existing?.status !== 'skipped';
  const payload = { status: skipping ? 'skipped' : 'pending', completed_at: null };
  const { data: occurrence, error } = existing
    ? await supabase.from('task_occurrences').update(payload).eq('id', existing.id).select().single()
    : await supabase.from('task_occurrences').insert({ task_id: task.id, date: start, ...payload }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (skipping) {
    await supabase.from('activity_events').insert({
      user_id: user.id,
      type: 'task_skipped',
      entity_type: 'task',
      entity_id: task.id,
      metadata_json: { title: task.title, status: 'skipped', date: params.date },
    });
  } else {
    await supabase.from('activity_events').delete()
      .eq('user_id', user.id)
      .eq('type', 'task_skipped')
      .eq('entity_type', 'task')
      .eq('entity_id', task.id)
      .contains('metadata_json', { date: params.date });
  }

  return NextResponse.json(occurrence);
}
