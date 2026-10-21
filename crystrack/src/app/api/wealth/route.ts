import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readWealthReport, wealthReadHeaders } from '@/lib/wealth-report-server';
export const dynamic = 'force-dynamic';
export async function GET() {
  const c = await createClient();
  const {
    data: { user },
  } = await c.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: wealthReadHeaders },
    );
  try {
    return NextResponse.json(await readWealthReport(c, user.id), { headers: wealthReadHeaders });
  } catch {
    console.error('Wealth reporting temporarily unavailable');
    return NextResponse.json(
      {
        error:
          'Wealth is temporarily unavailable. Refresh to verify your balances; no records were changed.',
      },
      { status: 503, headers: wealthReadHeaders },
    );
  }
}
