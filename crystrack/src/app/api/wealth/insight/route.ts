import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { summarizeWealth, sanitizedWealthMetrics } from '@/lib/wealth';
import { analyzeWealthMetricsWithGroq } from '@/lib/ai/wealth-groq';

export const runtime = 'nodejs';

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [entriesResult, debtsResult, expectedResult] = await Promise.all([
    supabase.from('money_entries').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(2000),
    supabase.from('wealth_debts').select('*').eq('user_id', user.id),
    supabase.from('wealth_expected_flows').select('*').eq('user_id', user.id),
  ]);

  const firstError = entriesResult.error || debtsResult.error || expectedResult.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  const summary = summarizeWealth(
    (entriesResult.data || []) as any,
    (debtsResult.data || []) as any,
    (expectedResult.data || []) as any,
  );
  const metrics = sanitizedWealthMetrics(summary);

  try {
    const insight = await analyzeWealthMetricsWithGroq(metrics);
    if (!insight) {
      return NextResponse.json({
        source: 'deterministic',
        insight: {
          headline: 'Spending pattern',
          summary: summary.deterministicRemark,
          observation: 'CrysTrack is using deterministic metrics because AI analysis is not configured.',
          next_action: 'Keep recording actual income, expenses and savings consistently.',
          confidence: summary.dataMonths >= 2 ? 'medium' : 'low',
        },
      });
    }

    return NextResponse.json({ source: 'ai', insight });
  } catch (error: any) {
    return NextResponse.json({
      source: 'deterministic',
      insight: {
        headline: 'Spending pattern',
        summary: summary.deterministicRemark,
        observation: 'AI commentary was unavailable, so CrysTrack kept the local deterministic analysis.',
        next_action: 'Review the category with the largest change against your recent baseline.',
        confidence: summary.dataMonths >= 2 ? 'medium' : 'low',
      },
      aiError: error?.message || 'AI analysis unavailable',
    });
  }
}
