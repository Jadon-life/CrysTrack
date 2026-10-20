import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { analyzeGoal } from '@/lib/goals/analyze-goal';
import {
  beginAi,
  finishAi,
  assertAiOrigin,
  aiFailure,
  aiHeaders,
  AiPrivacyError,
} from '@/lib/ai/privacy-server';
export const runtime = 'nodejs';
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const client = await createClient(),
      {
        data: { user },
      } = await client.auth.getUser();
    if (!user) throw new AiPrivacyError('AUTH', 401);
    assertAiOrigin(request);
    const lease = await beginAi(client, 'goal', request.signal),
      id = z
        .string()
        .uuid()
        .parse((await props.params).id);
    const { data: goal, error } = await client
      .from('goals')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (error) throw new AiPrivacyError('UNAVAILABLE');
    if (!goal) throw new AiPrivacyError('INPUT', 404);
    const { data: checkins, error: readError } = await client
      .from('goal_checkins')
      .select('created_at,duration_minutes,progress_percent,progress_value')
      .eq('goal_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (readError) throw new AiPrivacyError('UNAVAILABLE');
    const analysis = await analyzeGoal(goal, checkins || [], lease);
    if (!analysis) throw new AiPrivacyError('UNCONFIGURED');
    return NextResponse.json(
      await finishAi(lease, {
        goalId: id,
        analysis,
        model: process.env.OPENROUTER_ANALYSIS_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free',
      }),
      { headers: aiHeaders },
    );
  } catch (e) {
    return aiFailure(e);
  }
}
