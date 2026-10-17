import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { loadToday, rhythmError, savedTimezone } from '@/lib/rhythm/service';
import { cachedToday } from '@/lib/rhythm/cache';
import { dateKeyForInstant } from '@/lib/reminders';
export async function GET(request: Request) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const zone = await savedTimezone(db, user.id);
    const key = `${user.id}:${zone}:${dateKeyForInstant(new Date(), zone)}`;
    const data = await cachedToday(
      key,
      new URL(request.url).searchParams.get('fresh') === '1',
      () => loadToday(db, user.id, zone),
    );
    return NextResponse.json(
      {
        ...data,
        asOf: new Date().toISOString(),
        focus: data.focus
          ? { ...data.focus, as_of: new Date().toISOString() }
          : null,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return rhythmError(error);
  }
}
