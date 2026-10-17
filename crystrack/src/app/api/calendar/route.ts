import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { rhythmRows, rhythmError, savedTimezone } from '@/lib/rhythm/service';
import { calendarEvents } from '@/lib/rhythm/logic';
export async function GET(request: Request) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const params = new URL(request.url).searchParams,
    start = params.get('start') || '',
    end = params.get('end') || '';
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    new Date(start).toISOString().slice(0, 10) !== start ||
    new Date(end).toISOString().slice(0, 10) !== end ||
    Date.parse(end) < Date.parse(start) ||
    (Date.parse(end) - Date.parse(start)) / 86400000 > 42
  )
    return NextResponse.json(
      { error: 'Choose a range of up to 43 calendar days.' },
      { status: 400 },
    );
  try {
    const timezone = await savedTimezone(db, user.id);
    const raw = await rhythmRows(db, user.id, start, end, timezone);
    return NextResponse.json({
      timezone,
      events: calendarEvents(raw, start, end, timezone),
      tasks: raw.tasks,
      boxes: raw.boxes,
    });
  } catch (error) {
    return rhythmError(error);
  }
}
