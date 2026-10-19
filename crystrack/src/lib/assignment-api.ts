import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { assignmentFieldsSchema, resolveLocalDeadline } from './assignments';

export function assignmentError(error: { code?: string } | null) {
  console.error('Assignment transaction failed', { code: error?.code || 'unknown' });
  const code = error?.code;
  const status =
    code === 'PT409' || code === '23505'
      ? 409
      : code === 'P0002'
        ? 404
        : code === '42501'
          ? 403
          : code === '22023' || code?.startsWith('22')
            ? 400
            : 503;
  return NextResponse.json(
    {
      error:
        status === 409
          ? 'Assignment changed. Refresh and review before trying again.'
          : status === 404
            ? 'Assignment not found.'
            : status === 400
              ? 'Please review the assignment details.'
              : 'Assignments are unavailable. Your changes were not confirmed; refresh before retrying.',
    },
    { status, headers: { 'Cache-Control': 'private, no-store' } },
  );
}
export async function mutateAssignment(
  request: Request,
  action: 'create' | 'edit' | 'complete' | 'delete',
  id?: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const raw = z.record(z.unknown()).parse(await request.json());
    if (action === 'complete' || action === 'delete') z.object({ revision: z.number().int().positive().optional() }).strict().parse(raw);
    const envelope = z
      .object({
        id: z.string().uuid().optional(),
        revision: z.number().int().positive().optional(),
        fields: z.unknown().optional(),
      })
      .strict()
      .parse(
        action === 'create'
          ? { id: raw.id, fields: Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'id')) }
          : action === 'edit'
            ? {
                revision: raw.revision,
                fields: Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'revision')),
              }
            : raw,
      );
    const assignmentId = z
      .string()
      .uuid()
      .parse(id || envelope.id || (action === 'create' ? crypto.randomUUID() : undefined));
    let fields = {};
    if (action === 'create' || action === 'edit') {
      const data = assignmentFieldsSchema.parse(envelope.fields);
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('scheduling_timezone,timezone')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) return assignmentError(error);
      const timezone = profile?.scheduling_timezone || profile?.timezone || 'UTC';
      if (data.localDeadline && data.timezone !== timezone)
        return NextResponse.json(
          { error: 'Your scheduling timezone changed. Refresh and review the deadline.' },
          { status: 409 },
        );
      const deadline = data.localDeadline
        ? resolveLocalDeadline(data.localDeadline, timezone)
        : data.deadline;
      fields = {
        title: data.title,
        description: data.description || null,
        deadline,
        priority: data.priority,
        category: data.category || null,
        reminder_config: data.reminderConfig,
        timezone,
      };
    }
    const { data, error } = await supabase.rpc('assignment_mutate', {
      p_action: action,
      p_id: assignmentId,
      p_revision: envelope.revision ?? null,
      p_fields: fields,
    });
    if (error) return assignmentError(error);
    return NextResponse.json(data, {
      status: action === 'create' ? 201 : 200,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return NextResponse.json(
        { error: 'Please review the assignment fields and try again.' },
        { status: 400 },
      );
    if (error instanceof Error && /clocks change|calendar date|valid deadline/.test(error.message))
      return NextResponse.json({ error: error.message }, { status: 400 });
    return assignmentError(null);
  }
}
