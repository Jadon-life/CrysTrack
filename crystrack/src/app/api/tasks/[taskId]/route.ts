import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function DELETE(_request: Request, props: { params: Promise<{ taskId: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
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

  // 0006 stores goal routine links in task_ids; preserve those references.
  const links = await supabase.from('goals').select('id').eq('user_id',user.id).contains('task_ids',[task.id]).limit(1);
  if(links.error){console.error('Routine link lookup failed',links.error.code);return NextResponse.json({error:'We could not check linked goals. Please try again.'},{status:500});}
  if(links.data?.length)return NextResponse.json({error:'This routine supports a goal. Archive it, or unlink it from the goal before deleting it.'},{status:409});

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
