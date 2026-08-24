import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function PATCH(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: current, error: lookupError } = await supabase
    .from('assignments')
    .select('id, title, deadline, status')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!current || current.status === 'completed') {
    return NextResponse.json({ error: 'Assignment not found or already completed' }, { status: 404 });
  }
  if (new Date(current.deadline).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Assignment deadline has passed; completion is closed' }, { status: 409 });
  }

  const { data: assignment, error } = await supabase
    .from('assignments')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', user.id)
    .neq('status', 'completed')
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!assignment) return NextResponse.json({ error: 'Assignment not found or already completed' }, { status: 404 });

  await supabase.from('activity_events').insert({
    user_id: user.id,
    type: 'assignment_completed',
    entity_type: 'assignment',
    entity_id: assignment.id,
    metadata_json: { title: assignment.title, status: 'completed' },
  });

  return NextResponse.json(assignment);
}
