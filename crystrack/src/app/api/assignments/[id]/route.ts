import { assignmentPatch } from '@/lib/assignments/validation';
import {
  assignmentError,
  assignmentPayload,
  assignmentResponse,
  invalidAssignment,
  savedTimezone,
} from '@/lib/assignments/service';
import type { AcademicAssignment } from '@/types/assignments';
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

  const { data: assignment, error: lookupError } = await supabase
    .from('assignments')
    .select('id, title')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (lookupError) return assignmentError(lookupError);
  if (!assignment)
    return NextResponse.json(
      { error: 'Assignment not found' },
      { status: 404 },
    );

  const { error: deleteError } = await supabase
    .from('assignments')
    .delete()
    .eq('id', assignment.id)
    .eq('user_id', user.id);
  if (deleteError) return assignmentError(deleteError);

  const cleanup = await Promise.all([
    supabase
      .from('reminders')
      .delete()
      .eq('user_id', user.id)
      .eq('entity_type', 'assignment')
      .eq('entity_id', assignment.id),
    supabase
      .from('activity_events')
      .delete()
      .eq('user_id', user.id)
      .eq('entity_type', 'assignment')
      .eq('entity_id', assignment.id),
  ]);
  const cleanupWarning = cleanup.some((result) => Boolean(result.error));
  if (cleanupWarning)
    console.error(
      'Assignment deleted, but related non-FK cleanup was incomplete.',
    );

  return NextResponse.json({
    ok: true,
    deletedId: assignment.id,
    cleanupWarning,
  });
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const parsed = assignmentPatch.safeParse(await request.json());
    if (!parsed.success) return invalidAssignment();
    const timezone = await savedTimezone(db, user.id);
    let payload;
    try {
      payload = assignmentPayload(parsed.data, timezone);
    } catch (error) {
      return invalidAssignment(error);
    }
    const { data, error } = await db
      .rpc('save_academic_assignment', {
        p_id: id,
        p_revision: parsed.data.expectedRevision,
        p_plan: payload,
      })
      .single();
    if (error) return assignmentError(error);
    return NextResponse.json(
      assignmentResponse(data as AcademicAssignment, new Date(), timezone),
    );
  } catch (error) {
    return error instanceof SyntaxError
      ? invalidAssignment()
      : assignmentError(error as Error);
  }
}
