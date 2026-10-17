import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import {
  assignmentError,
  assignmentResponse,
  savedTimezone,
} from '@/lib/assignments/service';
import type { AcademicAssignment } from '@/types/assignments';
export async function PATCH(
  _request: Request,
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
    const timezone = await savedTimezone(db, user.id);
    // The database locks the current row, allows overdue completion, and records Finished Late atomically.
    const { data, error } = await db
      .rpc('finish_academic_assignment', { p_id: id })
      .single();
    if (error) return assignmentError(error);
    return NextResponse.json(
      assignmentResponse(data as AcademicAssignment, new Date(), timezone),
    );
  } catch (error) {
    return assignmentError(error as Error);
  }
}
