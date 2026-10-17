import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { goalFields } from '@/lib/goals/validation';
import {
  goalError,
  loadGoals,
  planPayload,
  savedTimezone,
} from '@/lib/goals/service';
export async function GET(request: Request) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(
      await loadGoals(
        db,
        user.id,
        new URL(request.url).searchParams.get('status') === 'all',
      ),
    );
  } catch (error) {
    return goalError(error as Error);
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
    const parsed = goalFields.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Check your goal details, dates, and check-in rhythm.' },
        { status: 400 },
      );
    const body = parsed.data;
    const timezone = await savedTimezone(db, user.id);
    const plan = planPayload(
      {
        progressMode: 'percentage',
        startingValue: 0,
        progressValue: body.startingValue ?? 0,
        checkinConfig: {
          frequency: 'daily',
          days: [],
          time: '20:00',
          channels: ['push'],
        },
        ...body,
      },
      timezone,
    );
    const { data, error } = await db
      .rpc('save_goal_alignment', {
        p_id: null,
        p_revision: null,
        p_plan: plan,
      })
      .single();
    if (error) return goalError(error);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError)
      return NextResponse.json(
        { error: 'Please send valid JSON.' },
        { status: 400 },
      );
    return goalError(error as Error);
  }
}
