import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const insights = [
    {
      id: '1',
      type: 'summary',
      title: 'Weekly Summary',
      summary: 'You completed 12 tasks this week and saved $500. Great progress!',
      riskLevel: 'low',
      recommendations: ['Keep up the morning workout streak', 'Consider increasing your reading time'],
      generatedAt: new Date().toISOString(),
    },
  ];

  return NextResponse.json(insights);
}
