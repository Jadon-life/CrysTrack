import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!expected || supplied !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  const origin = configuredUrl || new URL(request.url).origin;
  if (!botToken || !webhookSecret) return NextResponse.json({ error: 'Telegram environment variables are incomplete' }, { status: 503 });

  const webhookUrl = `${origin.replace(/\/$/, '')}/api/telegram/webhook`;
  const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl, secret_token: webhookSecret, allowed_updates: ['message'] }),
  });
  const data = await response.json();
  return NextResponse.json({ ok: response.ok && Boolean(data.ok), webhookUrl, telegram: data }, { status: response.ok ? 200 : 502 });
}
