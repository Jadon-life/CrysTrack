import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, '');
  if (!username) return NextResponse.json({ error: 'Telegram bot is not configured yet' }, { status: 503 });

  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await supabase.from('telegram_link_tokens').delete().eq('user_id', user.id).is('consumed_at', null);
  const { error } = await supabase.from('telegram_link_tokens').insert({ user_id: user.id, token, expires_at: expiresAt });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ url: `https://t.me/${username}?start=${token}`, expiresAt });
}
