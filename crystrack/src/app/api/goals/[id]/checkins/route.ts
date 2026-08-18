import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('id, title, measurable, target_value')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  if (goalError || !goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

  const durationMinutes = body.durationMinutes === '' || body.durationMinutes == null
    ? null
    : Math.max(0, Number(body.durationMinutes) || 0);

  const { data: checkin, error } = await supabase
    .from('goal_checkins')
    .insert({
      goal_id: goal.id,
      user_id: user.id,
      duration_minutes: durationMinutes,
      response_text: body.responseText || null,
      learned_text: body.learnedText || null,
      blockers: body.blockers || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (goal.measurable && body.progressValue !== '' && body.progressValue != null) {
    const requestedProgress = Math.max(0, Number(body.progressValue) || 0);
    const target = Number(goal.target_value || 0);
    const progress = target > 0 ? Math.min(requestedProgress, target) : requestedProgress;
    await supabase.from('goals').update({ progress_value: progress }).eq('id', goal.id).eq('user_id', user.id);
  }

  await supabase.from('activity_events').insert({
    user_id: user.id,
    type: 'goal_checkin',
    entity_type: 'goal',
    entity_id: goal.id,
    metadata_json: { title: goal.title, status: 'active' },
  });

  return NextResponse.json(checkin, { status: 201 });
}
