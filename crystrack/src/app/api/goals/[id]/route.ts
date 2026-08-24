import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: goal, error: lookupError } = await supabase
    .from('goals')
    .select('id, title')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

  const { error: deleteError } = await supabase
    .from('goals')
    .delete()
    .eq('id', goal.id)
    .eq('user_id', user.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const cleanup = await Promise.all([
    supabase.from('reminders').delete().eq('user_id', user.id).eq('entity_type', 'goal').eq('entity_id', goal.id),
    supabase.from('activity_events').delete().eq('user_id', user.id).eq('entity_type', 'goal').eq('entity_id', goal.id),
  ]);
  const cleanupWarning = cleanup.some((result) => Boolean(result.error));
  if (cleanupWarning) console.error('Goal deleted, but related non-FK cleanup was incomplete.');

  return NextResponse.json({ ok: true, deletedId: goal.id, cleanupWarning });
}
