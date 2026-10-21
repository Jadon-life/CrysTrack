import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { dailyFailure } from '@/lib/daily-records-server';
import { weekGridSchema, weekQuerySchema } from '@/lib/week-grid';

export async function GET(request: Request) {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const search = new URL(request.url).searchParams;
    const params = weekQuerySchema.parse(Object.fromEntries(search));
    const { data, error } = await client.rpc('daily_read_week', {
      p_from: params.from ?? null,
      p_after: params.after ?? null,
      p_limit: 25,
      p_filter: params.filter,
      p_revision: params.revision ?? null,
    });
    if (error) throw error;
    return NextResponse.json(weekGridSchema.parse(data), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return dailyFailure(error, 'read-task-week');
  }
}
