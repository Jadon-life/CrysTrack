import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { savedTimezone } from '@/lib/goals/service';
import { academicDeadline } from './time';
import { assignmentStatus, completionLabel } from './workload';
import { dateKeyForInstant } from '@/lib/reminders';
import type { AcademicAssignment } from '@/types/assignments';
export { savedTimezone };
export function assignmentError(error: { code?: string; message?: string }) {
  console.error('Academic assignment operation failed:', error);
  const status =
    error.code === '40001'
      ? 409
      : error.code === 'P0002'
        ? 404
        : error.code === '42501'
          ? 403
          : [
                '22023',
                '23514',
                '23502',
                '22P02',
                '22007',
                '22008',
                '22003',
              ].includes(error.code || '')
            ? 400
            : 500;
  return NextResponse.json(
    {
      error:
        status === 409
          ? 'This item changed. Refresh to pick it back up.'
          : status === 404
            ? 'Assignment not found.'
            : status === 403
              ? 'This assignment is not available to your account.'
              : status === 400
                ? 'Check the assignment details and try again.'
                : 'We could not update your assignments. Please try again.',
    },
    { status },
  );
}
export function assignmentResponse(
  item: AcademicAssignment,
  now: Date,
  timezone: string,
): AcademicAssignment {
  return {
    ...item,
    point_weight: item.point_weight == null ? null : String(item.point_weight),
    priority: item.priority || 'medium',
    status: item.status || 'upcoming',
    subtasks: item.subtasks || [],
    computed_status: assignmentStatus(item, now, timezone),
    completion_label: completionLabel(item.status, item.finished_late),
    timezone,
    days_until: Math.round(
      (Date.parse(dateKeyForInstant(new Date(item.deadline), timezone)) -
        Date.parse(dateKeyForInstant(now, timezone))) /
        86400000,
    ),
  };
}
export function assignmentPayload(
  body: Record<string, unknown>,
  timezone: string,
) {
  const names: Record<string, string> = {
    courseCode: 'course_code',
    academicKind: 'academic_kind',
    pointWeight: 'point_weight',
    estimatedMinutes: 'estimated_minutes',
    reminderConfig: 'reminder_config',
    workStartAt: 'work_start_at',
  };
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body))
    if (key !== 'expectedRevision')
      result[names[key] || key] =
        (key === 'deadline' || key === 'workStartAt') && value != null
          ? academicDeadline(String(value), timezone)
          : key === 'status' && value === 'active'
            ? 'upcoming'
            : value;
  return result;
}
export async function readAssignments(
  db: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  all = false,
) {
  const timezone = await savedTimezone(db, userId);
  let query = db
    .from('assignments')
    .select('*')
    .eq('user_id', userId)
    .order('deadline', { ascending: true });
  if (!all) query = query.neq('status', 'completed').neq('status', 'dropped');
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((item) =>
    assignmentResponse(item, new Date(), timezone),
  );
}
export function invalidAssignment(error?: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : 'Check the title, deadline, course details, and estimates.',
    },
    { status: 400 },
  );
}
