import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { assignmentFields } from '@/lib/assignments/validation';
import {
  assignmentError,
  assignmentPayload,
  assignmentResponse,
  invalidAssignment,
  readAssignments,
  savedTimezone,
} from '@/lib/assignments/service';
export async function GET(request: Request) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(
      await readAssignments(
        db,
        user.id,
        new URL(request.url).searchParams.get('status') === 'all',
      ),
    );
  } catch (error) {
    return assignmentError(error as Error);
  }
}
export async function POST(request: Request) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const parsed = assignmentFields.safeParse(await request.json());
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
        p_id: null,
        p_revision: null,
        p_plan: payload,
      })
      .single();
    if (error) return assignmentError(error);
    return NextResponse.json(
      assignmentResponse(data as AcademicAssignment, new Date(), timezone),
      { status: 201 },
    );
  } catch (error) {
    return error instanceof SyntaxError
      ? invalidAssignment()
      : assignmentError(error as Error);
  }
}
import type { AcademicAssignment } from '@/types/assignments';
