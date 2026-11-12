import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { analyzeGoal, type SharedGoalEvidence } from '@/lib/goals/analyze-goal';
import { safeChatText } from '@/lib/ai/privacy';
import { OPENROUTER_FREE_MODEL } from '@/lib/ai/provider';
import {
  beginAi,
  finishAi,
  assertAiOrigin,
  aiFailure,
  aiJson,
  aiHeaders,
  AiPrivacyError,
} from '@/lib/ai/privacy-server';
// One-off shared text is rejected, not silently cleaned or sent, when it contains secrets.
function shareText(value: unknown, limit: number) {
  try { return safeChatText(String(value || '').slice(0, limit)); }
  catch { throw new AiPrivacyError('INPUT', 400); }
}
export const runtime = 'nodejs';
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const client = await createClient(),
      {
        data: { user },
      } = await client.auth.getUser();
    if (!user) throw new AiPrivacyError('AUTH', 401);
    assertAiOrigin(request);
    const options = z.object({ sharePrivateEvidence: z.boolean().optional() }).strict().parse(await aiJson(request));
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
      .select(options.sharePrivateEvidence
        ? 'created_at,duration_minutes,progress_percent,progress_value,response_text,learned_text,blockers'
        : 'created_at,duration_minutes,progress_percent,progress_value')
      .eq('goal_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (readError) throw new AiPrivacyError('UNAVAILABLE');
    const shared: SharedGoalEvidence | null = options.sharePrivateEvidence ? {
      title: shareText(goal.title, 180),
      description: shareText(goal.description, 1200),
      recent_checkins: (checkins || []).slice(0, 6).map((checkin: any) => ({
        date: String(checkin.created_at || '').slice(0, 10),
        did: shareText(checkin.response_text, 900),
        learned: shareText(checkin.learned_text, 900),
        blockers: shareText(checkin.blockers, 500),
      })),
    } : null;
    const analysis = await analyzeGoal(goal, checkins || [], lease, shared);
    if (!analysis) throw new AiPrivacyError('UNCONFIGURED');
    return NextResponse.json(
      await finishAi(lease, {
        goalId: id,
        analysis,
        model: OPENROUTER_FREE_MODEL,
      }),
      { headers: aiHeaders },
    );
  } catch (e) {
    return aiFailure(e);
  }
}
