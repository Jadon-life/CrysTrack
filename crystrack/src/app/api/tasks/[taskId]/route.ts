import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function DELETE(
  _request: Request,
  { params }: { params: { taskId: string } },
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const taskId = String(params.taskId || '').trim();
  if (!taskId) return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });

  const { data: task, error: lookupError } = await supabase
    .from('recurring_tasks')
    .select('id, title')
    .eq('id', taskId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const { error: deleteError } = await supabase
    .from('recurring_tasks')
    .delete()
    .eq('id', task.id)
    .eq('user_id', user.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const cleanup = await Promise.all([
    supabase.from('reminders').delete().eq('user_id', user.id).eq('entity_type', 'task').eq('entity_id', task.id),
    supabase.from('activity_events').delete().eq('user_id', user.id).eq('entity_type', 'task').eq('entity_id', task.id),
  ]);
  const cleanupWarning = cleanup.some((result) => Boolean(result.error));
  if (cleanupWarning) console.error('Task deleted, but related non-FK cleanup was incomplete.');

  return NextResponse.json({ ok: true, deletedId: task.id, cleanupWarning });
}
