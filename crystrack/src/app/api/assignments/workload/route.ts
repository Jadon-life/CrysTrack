import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import {
  assignmentError,
  readAssignments,
  savedTimezone,
} from '@/lib/assignments/service';
import { academicWorkload } from '@/lib/assignments/workload';
export async function GET() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const [items, timezone] = await Promise.all([
      readAssignments(db, user.id),
      savedTimezone(db, user.id),
    ]);
    const now = new Date();
    return NextResponse.json({
      ...academicWorkload(items, now, timezone),
      timezone,
      asOf: now.toISOString(),
    });
  } catch (error) {
    return assignmentError(error as Error);
  }
}
