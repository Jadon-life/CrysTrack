import { aiProviderConfigured } from '@/lib/ai/privacy-server';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzeGoal } from '@/lib/goals/analyze-goal';
import { readAiPrivacy, beginAi, finishAi, assertAiOrigin, aiJson, aiFailure } from '@/lib/ai/privacy-server';
import { goalCheckinWindow } from '@/lib/goals/checkin-occurrence';

export const runtime = 'nodejs';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    const measurement=z.union([z.string().max(64),z.number().finite(),z.null()]).optional();
    const text=z.string().max(6000).nullable().optional();
    body=z.object({progressValue:measurement,durationMinutes:measurement,responseText:text,learnedText:text,blockers:text}).strict().parse(await aiJson(request));
  } catch(e) { return aiFailure(e); }
  const [{ data: goal, error: goalError }, { data: profile }] = await Promise.all([
    supabase
      .from('goals')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single(),
    supabase
      .from('profiles')
      .select('timezone, scheduling_timezone')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);
  if (goalError || !goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  if (goal.deadline && new Date(goal.deadline).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Goal deadline has passed; check-ins are closed' }, { status: 409 });
  }

  const timezone = profile?.scheduling_timezone || profile?.timezone || 'UTC';
  const window = goalCheckinWindow(goal.checkin_config, new Date(), timezone);
  if (!window.available || !window.occurrenceKey || !window.startDate || !window.endDate) {
    return NextResponse.json({ error: 'No check-in is scheduled for this goal today' }, { status: 409 });
  }

  const { data: existing, error: existingError } = await supabase
    .from('goal_checkins')
    .select('id')
    .eq('goal_id', goal.id)
    .eq('user_id', user.id)
    .eq('occurrence_key', window.occurrenceKey)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (existing) return NextResponse.json({ error: 'This goal occurrence has already been checked in' }, { status: 409 });

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
      occurrence_key: window.occurrenceKey,
      occurrence_start_date: window.startDate,
      occurrence_end_date: window.endDate,
    })
    .select()
    .single();

  if (error?.code === '23505') return NextResponse.json({ error: 'This goal occurrence has already been checked in' }, { status: 409 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (progressValue != null) {
    const { error: progressError } = await supabase
      .from('goals')
      .update({ progress_value: progressValue })
      .eq('id', goal.id)
      .eq('user_id', user.id);
    if (progressError) console.error('Goal progress update failed after saved check-in:', progressError);
  }

  let analysis: any = null;
  const aiConfigured = aiProviderConfigured();
  let aiStatus = 'off';
  try {
    assertAiOrigin(request);
    const permission = await readAiPrivacy(supabase);
    if (permission.enabled && goal.ai_coaching && aiConfigured) {
      const lease = await beginAi(supabase, 'goal', request.signal);
      const { data: refreshedGoal } = await supabase.from('goals').select('*').eq('id', goal.id).eq('user_id', user.id).single();
      const { data: checkins, error: readError } = await supabase.from('goal_checkins').select('created_at,duration_minutes,progress_value,progress_percent').eq('goal_id',goal.id).eq('user_id',user.id).order('created_at',{ascending:false}).limit(20);
      if (readError) throw new Error('AI_CONTEXT_UNAVAILABLE');
      const proposed = await analyzeGoal(refreshedGoal || goal, checkins || [], lease);
      if (proposed) {
        const result = await finishAi(lease, {goalId:goal.id,checkinId:checkin.id,analysis:proposed,model:process.env.OPENROUTER_ANALYSIS_MODEL||'nvidia/nemotron-3-super-120b-a12b:free'});
        analysis = result.analysis;
        aiStatus = 'generated';
      }
    } else if (permission.enabled) aiStatus = aiConfigured ? 'not-requested' : 'unconfigured';
  } catch {
    // Check-in/reward transaction already succeeded. Never expose upstream/DB error objects.
    console.error('Optional goal AI not confirmed', {code:'AI_UNAVAILABLE_OR_CHANGED'});
    aiStatus = 'unavailable';
  }

  await supabase.from('activity_events').insert({
    user_id: user.id,
    type: 'goal_checkin',
    entity_type: 'goal',
    entity_id: goal.id,
    metadata_json: {
      title: goal.title,
      status: 'active',
      progress_value: progressValue,
      ai_status: analysis?.status || null,
      occurrence_key: window.occurrenceKey,
    },
  });

  return NextResponse.json({ checkin: { ...checkin, ai_analysis: analysis }, analysis, aiConfigured, aiStatus }, { status: 201 });
}
