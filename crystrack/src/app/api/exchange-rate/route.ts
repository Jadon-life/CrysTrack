import { NextResponse } from 'next/server';
import { EXPERIENCE_CONFIG } from '@/config/experience';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY?.trim();
  const endpoint = apiKey
    ? `https://v6.exchangerate-api.com/v6/${encodeURIComponent(apiKey)}/latest/USD`
    : EXPERIENCE_CONFIG.wealth.exchangeRate.openEndpoint;

  try {
    const response = await fetch(endpoint, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Exchange-rate provider returned ${response.status}` }, { status: 502 });
    }

    const data = await response.json();
    const usdNgn = Number(data?.rates?.NGN ?? data?.conversion_rates?.NGN);
    if (!Number.isFinite(usdNgn) || usdNgn <= 0) {
      return NextResponse.json({ error: 'NGN rate was missing from the exchange-rate response' }, { status: 502 });
    }

    return NextResponse.json({
      base: 'USD',
      quote: 'NGN',
      usdNgn,
      ngnUsd: 1 / usdNgn,
      updatedAt: data.time_last_update_utc || data.time_last_update_unix
        ? (data.time_last_update_utc || new Date(Number(data.time_last_update_unix) * 1000).toISOString())
        : new Date().toISOString(),
      nextUpdateAt: data.time_next_update_utc || (data.time_next_update_unix
        ? new Date(Number(data.time_next_update_unix) * 1000).toISOString()
        : null),
      provider: EXPERIENCE_CONFIG.wealth.exchangeRate.provider,
      openAccess: !apiKey,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Exchange-rate lookup failed' }, { status: 502 });
  }
}
