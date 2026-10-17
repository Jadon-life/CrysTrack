import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { boxInput } from '@/lib/rhythm/validation';
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
    const parsed = boxInput.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Check your planning details and try again.' },
        { status: 400 },
      );
    const body = parsed.data;
    const { data, error } = await db
      .rpc('save_task_timebox', {
        p_task: body.taskId,
        p_day: body.day,
        p_start: body.startsAt,
        p_minutes: body.minutes,
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

export async function DELETE(request: Request) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id))
    return NextResponse.json(
      { error: 'Choose a focus block.' },
      { status: 400 },
    );
  const { error } = await db.rpc('remove_task_timebox', { p_id: id });
  if (error) return rhythmError(error);
  invalidateToday(user.id);
  return NextResponse.json({ ok: true });
}
