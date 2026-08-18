import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 });
  }

  const update = await request.json();
  const message = update.message;
  const text = String(message?.text || '');
  const match = text.match(/^\/start\s+([A-Za-z0-9_-]+)$/);
  if (!match || !message?.chat?.id) return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const token = match[1];
  const { data: link } = await admin
    .from('telegram_link_tokens')
    .select('id, user_id, expires_at, consumed_at')
    .eq('token', token)
    .maybeSingle();

  if (!link || link.consumed_at || new Date(link.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ ok: true });
  }

  await admin.from('telegram_connections').upsert({
    user_id: link.user_id,
    chat_id: String(message.chat.id),
    username: message.from?.username || null,
    first_name: message.from?.first_name || null,
    is_active: true,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  await admin.from('telegram_link_tokens').update({ consumed_at: new Date().toISOString() }).eq('id', link.id);

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: message.chat.id, text: '✅ Telegram is now connected to CrysTrack reminders.' }),
    }).catch(() => null);
  }

  return NextResponse.json({ ok: true });
}
