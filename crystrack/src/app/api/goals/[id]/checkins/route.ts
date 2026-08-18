import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { analyzeGoal } from '@/lib/goals/analyze-goal';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();
  if (goalError || !goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

  let progressValue: number | null = null;
  let progressPercent: number | null = null;
  if ((goal.progress_mode === 'percentage' || goal.measurable) && body.progressValue !== '' && body.progressValue != null) {
    progressValue = Number(body.progressValue);
    if (!Number.isFinite(progressValue)) return NextResponse.json({ error: 'Progress value is invalid' }, { status: 400 });

    const start = goal.starting_value == null ? 0 : Number(goal.starting_value);
    const target = Number(goal.target_value);
    if (Number.isFinite(target) && target !== start) {
      const min = Math.min(start, target);
      const max = Math.max(start, target);
      progressValue = Math.min(max, Math.max(min, progressValue));
      progressPercent = Math.max(0, Math.min(100, ((progressValue - start) / (target - start)) * 100));
    }
    await supabase.from('goals').update({ progress_value: progressValue }).eq('id', goal.id).eq('user_id', user.id);
  }

  const durationMinutes = body.durationMinutes === '' || body.durationMinutes == null ? null : Math.max(0, Number(body.durationMinutes) || 0);
  const { data: checkin, error } = await supabase
    .from('goal_checkins')
    .insert({
      goal_id: goal.id,
      user_id: user.id,
      duration_minutes: durationMinutes,
      response_text: body.responseText || null,
      learned_text: body.learnedText || null,
      blockers: body.blockers || null,
      progress_value: progressValue,
      progress_percent: progressPercent,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let analysis = null;
  let aiConfigured = Boolean(process.env.GROQ_API_KEY);
  if (goal.progress_mode === 'ai' || goal.ai_coaching) {
    const { data: refreshedGoal } = await supabase.from('goals').select('*').eq('id', goal.id).single();
    const { data: checkins } = await supabase.from('goal_checkins').select('*').eq('goal_id', goal.id).eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
    try {
      analysis = await analyzeGoal(refreshedGoal || goal, checkins || []);
      if (analysis) {
        await supabase.from('goal_checkins').update({ ai_analysis: analysis }).eq('id', checkin.id);
        await supabase.from('goal_insights').insert({
          goal_id: goal.id,
          summary: analysis.summary,
          risk_level: analysis.status,
          estimate_text: analysis.confidence,
          recommendations: analysis.next_action,
          model_version: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        });
      }
    } catch (aiError: any) {
      analysis = { status: 'unavailable', summary: aiError?.message || 'AI analysis is temporarily unavailable.' };
    }
  }

  await supabase.from('activity_events').insert({
    user_id: user.id,
    type: 'goal_checkin',
    entity_type: 'goal',
    entity_id: goal.id,
    metadata_json: { title: goal.title, status: 'active', progress_value: progressValue, ai_status: analysis?.status || null },
  });

  return NextResponse.json({ checkin: { ...checkin, ai_analysis: analysis }, analysis, aiConfigured }, { status: 201 });
}
