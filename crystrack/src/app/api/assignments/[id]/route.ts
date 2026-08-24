import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: assignment, error: lookupError } = await supabase
    .from('assignments')
    .select('id, title')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

  const { error: deleteError } = await supabase
    .from('assignments')
    .delete()
    .eq('id', assignment.id)
    .eq('user_id', user.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const cleanup = await Promise.all([
    supabase.from('reminders').delete().eq('user_id', user.id).eq('entity_type', 'assignment').eq('entity_id', assignment.id),
    supabase.from('activity_events').delete().eq('user_id', user.id).eq('entity_type', 'assignment').eq('entity_id', assignment.id),
  ]);
  const cleanupWarning = cleanup.some((result) => Boolean(result.error));
  if (cleanupWarning) console.error('Assignment deleted, but related non-FK cleanup was incomplete.');

  return NextResponse.json({ ok: true, deletedId: assignment.id, cleanupWarning });
}
