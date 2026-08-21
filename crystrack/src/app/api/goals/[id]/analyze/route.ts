import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeGoal } from '@/lib/goals/analyze-goal';

export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: goal } = await supabase.from('goals').select('*').eq('id', params.id).eq('user_id', user.id).eq('status', 'active').single();
  if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  const { data: checkins } = await supabase.from('goal_checkins').select('*').eq('goal_id', goal.id).eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);

  try {
    const analysis = await analyzeGoal(goal, checkins || []);
    if (!analysis) return NextResponse.json({ configured: false, analysis: null });

    await supabase.from('goal_insights').insert({
      goal_id: goal.id,
      summary: analysis.summary,
      risk_level: analysis.status,
      estimate_text: analysis.confidence,
      recommendations: analysis.next_action,
      model_version: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    });
    return NextResponse.json({ configured: true, analysis });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Goal analysis failed' }, { status: 502 });
  }
}
