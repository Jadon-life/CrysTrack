import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.min(25, Math.max(1, Number(url.searchParams.get('limit') || 10)));
  const now = new Date().toISOString();

  const [{ data: pending, error: pendingError }, { data: recent, error: recentError }] = await Promise.all([
    supabase
      .from('reminders')
      .select('id, entity_type, entity_id, scheduled_for, status, title, kind, metadata_json')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .gte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
      .limit(limit),
    supabase
      .from('reminder_deliveries')
      .select('id, entity_type, entity_id, scheduled_for, status, payload, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(Math.min(5, limit)),
  ]);

  if (pendingError && pendingError.code !== '42P01') return NextResponse.json({ error: pendingError.message }, { status: 500 });
  if (recentError && recentError.code !== '42P01') return NextResponse.json({ error: recentError.message }, { status: 500 });

  const output = [
    ...(pending || []).map((item: any) => ({ ...item, metadata: item.metadata_json })),
    ...(recent || []).map((item: any) => ({
      id: item.id,
      entity_type: item.entity_type,
      entity_id: item.entity_id,
      scheduled_for: item.scheduled_for,
      status: item.status,
      title: item.payload?.title,
      metadata: item.payload,
    })),
  ].slice(0, limit);

  return NextResponse.json(output);
}
