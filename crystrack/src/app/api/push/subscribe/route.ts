import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const endpoint = String(body.endpoint || '');
  const keys = body.keys || {};
  if (!endpoint || !keys.p256dh || !keys.auth) return NextResponse.json({ error: 'Invalid push subscription' }, { status: 400 });

  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: user.id,
      endpoint,
      keys_p256dh: keys.p256dh,
      keys_auth: keys.auth,
      is_active: true,
      last_seen_at: new Date().toISOString(),
      device_label: request.headers.get('user-agent')?.slice(0, 255) || 'Browser',
    }, { onConflict: 'endpoint' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const endpoint = String(body.endpoint || '');
  if (!endpoint) return NextResponse.json({ error: 'Endpoint is required' }, { status: 400 });

  const { error } = await supabase
    .from('push_subscriptions')
    .update({ is_active: false, last_seen_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('endpoint', endpoint);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
