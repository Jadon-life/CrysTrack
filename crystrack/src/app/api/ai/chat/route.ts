import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildScopedContext } from '@/lib/ai/scoped-context';
import { chatWithOpenAI, intelligenceChatModel } from '@/lib/ai/intelligence';
import { chatRequestSchema, safeChatText } from '@/lib/ai/privacy';
import {
  beginAi,
  finishAi,
  aiRpc,
  aiJson,
  aiFailure,
  aiHeaders,
  AiPrivacyError,
} from '@/lib/ai/privacy-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AiPrivacyError('AUTH', 401);
    const lease = await beginAi(supabase, 'chat', request.signal); // before sensitive context or any conversation/message write
    const body = chatRequestSchema.parse(await aiJson(request));
    try {
      safeChatText(body.message);
    } catch {
      throw new AiPrivacyError('INPUT', 400);
    }
    let history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (body.conversationId) {
      // Explicit owner filter remains, in addition to RPC ownership and generation enforcement.
      const { data, error } = await supabase
        .from('ai_conversations')
        .select('id')
        .eq('id', body.conversationId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw new AiPrivacyError('UNAVAILABLE');
      if (!data) throw new AiPrivacyError('INPUT', 404);
      history = await aiRpc(supabase, 'ai_chat_history', {
        p_conversation: body.conversationId,
        p_revision: lease.revision,
      });
      history = history.filter((row) => {
        try {
          safeChatText(row.content);
          return true;
        } catch {
          return false;
        }
      });
    }
    const context = await buildScopedContext(supabase, user.id, 'overview', lease.wealthEnabled);
    const answer = await chatWithOpenAI({ context, history, message: body.message }, lease);
    if (!answer) throw new AiPrivacyError('UNCONFIGURED');
    const result = await finishAi(lease, {
      conversationId: body.conversationId || null,
      message: body.message,
      answer,
      title: body.message.replace(/\s+/g, ' ').slice(0, 70),
      model: intelligenceChatModel(),
    });
    return NextResponse.json(result, { headers: aiHeaders });
  } catch (e) {
    return aiFailure(e);
  }
}
