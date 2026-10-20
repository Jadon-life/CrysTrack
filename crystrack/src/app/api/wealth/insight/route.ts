import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizedExactMetrics } from '@/lib/wealth-report';
import { readWealthReport, wealthReadHeaders } from '@/lib/wealth-report-server';
import { analyzeWealthMetricsWithOpenRouter } from '@/lib/ai/wealth-openrouter';

export const runtime = 'nodejs';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let summary;
  try {
    summary = (await readWealthReport(supabase, user.id)).summary;
  } catch {
    return NextResponse.json(
      { error: 'Wealth is temporarily unavailable. No balances are assumed.' },
      { status: 503, headers: wealthReadHeaders },
    );
  }
  const metrics = sanitizedExactMetrics(summary);

  try {
    const insight = await analyzeWealthMetricsWithOpenRouter(metrics);
    if (!insight) {
      return NextResponse.json({
        source: 'deterministic',
        insight: {
          headline: 'Spending pattern',
          summary: summary.deterministicRemark,
          observation:
            'CrysTrack is using deterministic metrics because AI analysis is not configured.',
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
        observation:
          'AI commentary was unavailable, so CrysTrack kept the local deterministic analysis.',
        next_action: 'Review the category with the largest change against your recent baseline.',
        confidence: summary.dataMonths >= 2 ? 'medium' : 'low',
      },
    });
  }
}
