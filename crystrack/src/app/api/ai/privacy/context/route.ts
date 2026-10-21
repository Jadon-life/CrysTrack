import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { aiDomainSchema } from '@/lib/ai/privacy';
import { readAiPrivacy, aiFailure, aiHeaders, AiPrivacyError } from '@/lib/ai/privacy-server';
import { buildScopedContext } from '@/lib/ai/scoped-context';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const client = await createClient(),
      {
        data: { user },
      } = await client.auth.getUser();
    if (!user) throw new AiPrivacyError('AUTH', 401);
    const domain = aiDomainSchema.parse(
      new URL(request.url).searchParams.get('domain') || 'overview',
    );
    const state = await readAiPrivacy(client);
    const context = await buildScopedContext(
      client,
      user.id,
      domain,
      state.enabled && state.wealthEnabled,
    );
    // Reading the preview never creates a provider lease or transmits to OpenRouter.
    return NextResponse.json(
      {
        context,
        revision: state.revision,
        notice:
          'Actual bounded automatic context. Chat text and eligible same-permission history are added only when you send a message. This preview sends nothing to an AI provider.',
      },
      { headers: aiHeaders },
    );
  } catch (e) {
    return aiFailure(e);
  }
}
