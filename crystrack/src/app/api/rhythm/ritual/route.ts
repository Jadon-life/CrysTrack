import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { ritualInput } from '@/lib/rhythm/validation';
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
    const parsed = ritualInput.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Check your planning details and try again.' },
        { status: 400 },
      );
    const body = parsed.data;
    const { data, error } = await db
      .rpc('save_daily_ritual', { p_plan: body })
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
