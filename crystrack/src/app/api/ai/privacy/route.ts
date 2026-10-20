import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  readAiPrivacy,
  aiFailure,
  aiHeaders,
  aiJson,
  aiRpc,
  AiPrivacyError,
} from '@/lib/ai/privacy-server';
import { aiPrivacySchema, privacyChangeSchema, privacyClearSchema } from '@/lib/ai/privacy';
export const dynamic = 'force-dynamic';
async function owner() {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new AiPrivacyError('AUTH', 401);
  return client;
}
export async function GET() {
  try {
    return NextResponse.json(
      {
        ...(await readAiPrivacy(await owner())),
        configured: Boolean(process.env.OPENROUTER_API_KEY),
      },
      { headers: aiHeaders },
    );
  } catch (e) {
    return aiFailure(e);
  }
}
export async function PUT(request: Request) {
  try {
    const client = await owner(),
      body = privacyChangeSchema.parse(await aiJson(request));
    const state = aiPrivacySchema.parse(
      await aiRpc(client, 'ai_privacy_mutate', {
        p_action: 'consent',
        p_expected_revision: body.expectedRevision,
        p_request_id: body.requestId,
        p_enabled: body.enabled,
        p_wealth: body.wealthEnabled,
        p_policy: body.policy,
      }),
    );
    return NextResponse.json(
      { ...state, configured: Boolean(process.env.OPENROUTER_API_KEY) },
      { headers: aiHeaders },
    );
  } catch (e) {
    return aiFailure(e);
  }
}
export async function DELETE(request: Request) {
  try {
    const client = await owner(),
      body = privacyClearSchema.parse(await aiJson(request));
    const state = aiPrivacySchema.parse(
      await aiRpc(client, 'ai_privacy_mutate', {
        p_action: 'clear',
        p_expected_revision: body.expectedRevision,
        p_request_id: body.requestId,
        p_confirm: true,
      }),
    );
    return NextResponse.json(
      { ...state, configured: Boolean(process.env.OPENROUTER_API_KEY), cleared: true },
      { headers: aiHeaders },
    );
  } catch (e) {
    return aiFailure(e);
  }
}
