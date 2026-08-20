import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

async function sendTelegramMessage(chatId: string | number, text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 });
  }

  let update: any;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = update?.message;
  const text = String(message?.text || '');
  const match = text.match(/^\/start\s+([A-Za-z0-9_-]+)$/);
  if (!match || !message?.chat?.id) return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const token = match[1];
  const { data: link, error: linkError } = await admin
    .from('telegram_link_tokens')
    .select('id, user_id, expires_at, consumed_at')
    .eq('token', token)
    .maybeSingle();

  if (linkError) {
    console.error('Telegram link-token lookup failed:', linkError);
    await sendTelegramMessage(message.chat.id, 'CrysTrack could not verify this connection. Return to CrysTrack Settings and try Connect Telegram again.');
    return NextResponse.json({ ok: true });
  }

  if (!link || link.consumed_at || new Date(link.expires_at).getTime() < Date.now()) {
    await sendTelegramMessage(message.chat.id, 'This CrysTrack connection link has expired. Return to CrysTrack Settings and generate a new Telegram connection.');
    return NextResponse.json({ ok: true });
  }

  const { data: connection, error: connectionError } = await admin.rpc('link_telegram_connection', {
    p_user_id: link.user_id,
    p_chat_id: String(message.chat.id),
    p_username: message.from?.username || null,
    p_first_name: message.from?.first_name || null,
  });

  if (connectionError || !connection) {
    console.error('Telegram connection persistence failed:', connectionError);
    await sendTelegramMessage(message.chat.id, 'CrysTrack received your Telegram request but could not save the connection. Please return to Settings and try again.');
    return NextResponse.json({ ok: true });
  }

  const { error: consumeError } = await admin
    .from('telegram_link_tokens')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', link.id)
    .is('consumed_at', null);

  if (consumeError) console.error('Telegram link-token consume failed after successful connection:', consumeError);

  await sendTelegramMessage(message.chat.id, '✅ Telegram is now connected to CrysTrack reminders.');
  return NextResponse.json({ ok: true });
}
