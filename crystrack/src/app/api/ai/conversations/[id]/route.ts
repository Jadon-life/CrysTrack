import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { readAiPrivacy, aiRpc, aiHeaders, aiFailure, assertAiOrigin } from '@/lib/ai/privacy-server';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({error:'Conversation not found'},{status:404,headers:aiHeaders});
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: conversation, error: conversationError } = await supabase
    .from('ai_conversations')
    .select('id, title, created_at, updated_at')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (conversationError) return NextResponse.json({ error: 'Local AI history is unavailable' }, { status: 503,headers:aiHeaders });
  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  const { data: messages, error: messageError } = await supabase
    .from('ai_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', params.id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(250);

  if (messageError) return NextResponse.json({ error: 'Local AI history is unavailable' }, { status: 503,headers:aiHeaders });
  return NextResponse.json({ conversation, messages: messages || [],source:'saved-local',notice:'Local saved conversation, not new provider processing. Old history is never automatically re-sent after permissions change.' },{headers:aiHeaders});
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({error:'Conversation not found'},{status:404,headers:aiHeaders});
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    assertAiOrigin(_request);
    const p=await readAiPrivacy(supabase);
    await aiRpc(supabase,'ai_privacy_mutate',{p_action:'delete_conversation',p_expected_revision:p.revision,p_request_id:randomUUID(),p_confirm:true,p_conversation:params.id});
    return NextResponse.json({ok:true},{headers:aiHeaders});
  } catch(e) { return aiFailure(e); }
}
