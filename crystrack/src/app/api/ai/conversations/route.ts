import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  beginAi,
  finishAi,
  aiJson,
  aiFailure,
  aiHeaders,
  AiPrivacyError,
} from '@/lib/ai/privacy-server';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const supabase = await createClient(),
      {
        data: { user },
      } = await supabase.auth.getUser();
    if (!user) throw new AiPrivacyError('AUTH', 401);
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('id,title,created_at,updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) throw new AiPrivacyError('UNAVAILABLE');
    return NextResponse.json(data || [], { headers: aiHeaders });
  } catch (e) {
    return aiFailure(e);
  }
}
export async function POST(request: Request) {
  try {
    const supabase = await createClient(),
      {
        data: { user },
      } = await supabase.auth.getUser();
    if (!user) throw new AiPrivacyError('AUTH', 401);
    const lease = await beginAi(supabase, 'conversation', request.signal),
      body = z
        .object({ title: z.string().trim().min(1).max(180).optional() })
        .strict()
        .parse(await aiJson(request));
    const result = await finishAi(lease, { title: body.title || 'New conversation' });
    return NextResponse.json(result.conversation, { status: 201, headers: aiHeaders });
  } catch (e) {
    return aiFailure(e);
  }
}
