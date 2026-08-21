import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildIntelligenceContext } from '@/lib/ai/context';
import { chatWithGroq } from '@/lib/ai/intelligence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function conversationTitle(message: string) {
  const compact = message.replace(/\s+/g, ' ').trim();
  return compact.length <= 70 ? compact : `${compact.slice(0, 67)}...`;
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const message = String(body?.message || '').trim();
  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  if (message.length > 4000) return NextResponse.json({ error: 'Message is too long' }, { status: 400 });
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: 'CrysTrack AI is not configured' }, { status: 503 });

  let conversationId = String(body?.conversationId || '').trim();
  let conversation: any = null;

  if (conversationId) {
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('id, title')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    conversation = data;
  } else {
    const { data, error } = await supabase
      .from('ai_conversations')
      .insert({ user_id: user.id, title: conversationTitle(message) })
      .select('id, title')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    conversation = data;
    conversationId = data.id;
  }

  const { data: historyRows, error: historyError } = await supabase
    .from('ai_messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(12);
  if (historyError) return NextResponse.json({ error: historyError.message }, { status: 500 });

  const history = [...(historyRows || [])]
    .reverse()
    .filter((item: any) => item.role === 'user' || item.role === 'assistant')
    .map((item: any) => ({ role: item.role as 'user' | 'assistant', content: String(item.content || '') }));

  const { data: userMessage, error: saveUserError } = await supabase
    .from('ai_messages')
    .insert({ conversation_id: conversationId, user_id: user.id, role: 'user', content: message })
    .select('id, role, content, created_at')
    .single();
  if (saveUserError) return NextResponse.json({ error: saveUserError.message }, { status: 500 });

  try {
    const context = await buildIntelligenceContext(supabase, user.id, 'overview');
    const answer = await chatWithGroq({ context, history, message });
    if (!answer) throw new Error('CrysTrack AI is not configured');

    const { data: assistantMessage, error: saveAssistantError } = await supabase
      .from('ai_messages')
      .insert({ conversation_id: conversationId, user_id: user.id, role: 'assistant', content: answer })
      .select('id, role, content, created_at')
      .single();
    if (saveAssistantError) throw saveAssistantError;

    const nextTitle = conversation.title === 'New conversation' ? conversationTitle(message) : conversation.title;
    await supabase
      .from('ai_conversations')
      .update({ updated_at: new Date().toISOString(), title: nextTitle })
      .eq('id', conversationId)
      .eq('user_id', user.id);

    return NextResponse.json({ conversation: { id: conversationId, title: nextTitle }, userMessage, assistantMessage });
  } catch (error: any) {
    await supabase
      .from('ai_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .eq('user_id', user.id);

    const status = Number(error?.status) === 429 ? 429 : 503;
    const publicMessage = status === 429
      ? 'The free AI quota is temporarily busy. Your message was saved; try again shortly.'
      : 'CrysTrack AI is temporarily unavailable. Your message was saved and no CrysTrack data was changed.';
    return NextResponse.json({ error: publicMessage, conversationId, userMessage }, { status });
  }
}
