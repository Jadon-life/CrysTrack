import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { focusInput } from '@/lib/rhythm/validation';
import { rhythmError } from '@/lib/rhythm/service';
import { invalidateToday } from '@/lib/rhythm/cache';
export async function POST(request: Request) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const parsed = focusInput.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Check your planning details and try again.' },
        { status: 400 },
      );
    const body = parsed.data;
    const { data, error } = await db
      .rpc('control_task_focus', {
        p_action: body.action,
        p_id: body.id,
        p_task: 'taskId' in body ? body.taskId : null,
        p_minutes: 'minutes' in body ? body.minutes : null,
      })
      .single();
    if (error) return rhythmError(error);
    invalidateToday(user.id);
    return NextResponse.json({
      ...(data as Record<string, unknown>),
      as_of: new Date().toISOString(),
    });
  } catch (error) {
    return error instanceof SyntaxError
      ? NextResponse.json(
          { error: 'Send valid planning details.' },
          { status: 400 },
        )
      : rhythmError(error);
  }
}
