import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  _request: Request,
  { params }: { params: { taskId: string } },
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const taskId = String(params.taskId || '').trim();
  if (!taskId) {
    return NextResponse.json({ error: 'Routine ID is required' }, { status: 400 });
  }

  const { data: task, error: taskError } = await supabase
    .from('recurring_tasks')
    .select('id, title, active, archived_at')
    .eq('id', taskId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (taskError) {
    return NextResponse.json({ error: taskError.message }, { status: 500 });
  }

  if (!task) {
    return NextResponse.json({ error: 'Routine not found' }, { status: 404 });
  }

  if (task.archived_at || task.active === false) {
    return NextResponse.json({
      ok: true,
      alreadyArchived: true,
      task,
    });
  }

  const archivedAt = new Date().toISOString();

  const { data: archivedTask, error: archiveError } = await supabase
    .from('recurring_tasks')
    .update({
      active: false,
      archived_at: archivedAt,
    })
    .eq('id', taskId)
    .eq('user_id', user.id)
    .select('id, title, active, archived_at')
    .single();

  if (archiveError) {
    return NextResponse.json({ error: archiveError.message }, { status: 500 });
  }

  const { error: reminderError } = await supabase
    .from('reminders')
    .update({ status: 'cancelled' })
    .eq('user_id', user.id)
    .eq('entity_type', 'task')
    .eq('entity_id', taskId)
    .eq('status', 'pending');

  if (reminderError) {
    console.error('Routine archived, but pending reminder cleanup failed:', reminderError);
  }

  return NextResponse.json({
    ok: true,
    task: archivedTask,
    reminderCleanupWarning: Boolean(reminderError),
  });
}
