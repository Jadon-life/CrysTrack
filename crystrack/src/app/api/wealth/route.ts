import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { summarizeWealth } from '@/lib/wealth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [entriesResult, targetsResult, debtsResult, expectedResult] = await Promise.all([
    supabase
      .from('money_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(2000),
    supabase
      .from('finance_targets')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    supabase
      .from('wealth_debts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('wealth_expected_flows')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  const firstError = entriesResult.error || targetsResult.error || debtsResult.error || expectedResult.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  const entries = entriesResult.data || [];
  const targets = targetsResult.data || [];
  const debts = debtsResult.data || [];
  const expectedFlows = expectedResult.data || [];
  const summary = summarizeWealth(entries as any, debts as any, expectedFlows as any);

  return NextResponse.json({ entries, targets, debts, expectedFlows, summary });
}
