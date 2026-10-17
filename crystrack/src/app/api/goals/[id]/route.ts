import { goalPatch } from '@/lib/goals/validation';
import { goalError, planPayload, savedTimezone } from '@/lib/goals/service';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function DELETE(
  _request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: goal, error: lookupError } = await supabase
    .from('goals')
    .select('id, title')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (lookupError) return goalError(lookupError);
  if (!goal)
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

  const { error: deleteError } = await supabase
    .from('goals')
    .delete()
    .eq('id', goal.id)
    .eq('user_id', user.id);
  if (deleteError) return goalError(deleteError);

  const cleanup = await Promise.all([
    supabase
      .from('reminders')
      .delete()
      .eq('user_id', user.id)
      .eq('entity_type', 'goal')
      .eq('entity_id', goal.id),
    supabase
      .from('activity_events')
      .delete()
      .eq('user_id', user.id)
      .eq('entity_type', 'goal')
      .eq('entity_id', goal.id),
  ]);
  const cleanupWarning = cleanup.some((result) => Boolean(result.error));
  if (cleanupWarning)
    console.error('Goal deleted, but related non-FK cleanup was incomplete.');

  return NextResponse.json({ ok: true, deletedId: goal.id, cleanupWarning });
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const parsed = goalPatch.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Check your goal details and refresh before trying again.' },
        { status: 400 },
      );
    const body = parsed.data;
    const timezone = await savedTimezone(supabase, user.id);
    const { data, error } = await supabase
      .rpc('save_goal_alignment', {
        p_id: id,
        p_revision: body.expectedRevision,
        p_plan: planPayload(body, timezone),
      })
      .single();
    if (error) return goalError(error);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof SyntaxError)
      return NextResponse.json(
        { error: 'Please send valid JSON.' },
        { status: 400 },
      );
    return goalError(error as Error);
  }
}
