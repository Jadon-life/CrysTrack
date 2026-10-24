import { aiProviderConfigured } from '@/lib/ai/privacy-server';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  analyzeDomainWithOpenAI,
  DomainInsightSchema,
  DOMAIN_INSIGHT_POLICY_VERSION,
  intelligenceAnalysisModel,
} from '@/lib/ai/intelligence';
import { fingerprintContext } from '@/lib/ai/context';
import { buildScopedContext } from '@/lib/ai/scoped-context';
import { aiDomainSchema, AI_PRIVACY_POLICY } from '@/lib/ai/privacy';
import {
  readAiPrivacy,
  beginAi,
  finishAi,
  checkAiLease,
  assertAiOrigin,
  aiFailure,
  aiHeaders,
  AiPrivacyError,
} from '@/lib/ai/privacy-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function validatedInsight(value: unknown) {
  const parsed = DomainInsightSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AiPrivacyError('AUTH', 401);
  return { supabase, user };
}
async function latestSaved(
  client: any,
  user: string,
  domain: string,
  revision: number,
  fingerprint?: string,
) {
  let q = client
    .from('ai_domain_insights')
    .select('insight,generated_at,model,data_fingerprint')
    .eq('user_id', user)
    .eq('domain', domain);
  const prefix = AI_PRIVACY_POLICY + ':' + revision + ':';
  q = fingerprint
    ? q.eq('data_fingerprint', prefix + fingerprint)
    : q.like('data_fingerprint', prefix + '%');
  const { data, error } = await q
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new AiPrivacyError('UNAVAILABLE');
  return data;
}
export async function GET(_request: Request, props: { params: Promise<{ domain: string }> }) {
  try {
    const domain = aiDomainSchema.parse((await props.params).domain),
      { supabase, user } = await currentUser(),
      p = await readAiPrivacy(supabase);
    if (!p.enabled || (domain === 'wealth' && !p.wealthEnabled))
      return NextResponse.json(
        {
          insight: null,
          generatedAt: null,
          enabled: p.enabled,
          wealthEnabled: p.wealthEnabled,
          configured: aiProviderConfigured(),
          cached: false,
          source: 'none',
        },
        { headers: aiHeaders },
      );
    const latest = await latestSaved(supabase, user.id, domain, p.revision),
      latestInsight = validatedInsight(latest?.insight);
    if ((await readAiPrivacy(supabase)).revision !== p.revision)
      throw new AiPrivacyError('CHANGED', 409);
    return NextResponse.json(
      {
        insight: latestInsight,
        generatedAt: latest?.generated_at || null,
        model: latest?.model || null,
        enabled: true,
        wealthEnabled: p.wealthEnabled,
        configured: aiProviderConfigured(),
        cached: Boolean(latestInsight),
        source: latestInsight ? 'saved-ai' : 'none',
        warning: latestInsight
          ? 'Saved AI-generated commentary; not fresh analysis. It may be incomplete or incorrect.'
          : '',
      },
      { headers: aiHeaders },
    );
  } catch (e) {
    return aiFailure(e);
  }
}
export async function POST(request: Request, props: { params: Promise<{ domain: string }> }) {
  try {
    const domain = aiDomainSchema.parse((await props.params).domain),
      { supabase, user } = await currentUser();
    assertAiOrigin(request);
    const lease = await beginAi(supabase, domain, request.signal);
    const context = await buildScopedContext(supabase, user.id, domain, lease.wealthEnabled);
    const fingerprint = fingerprintContext({
      policy_version: DOMAIN_INSIGHT_POLICY_VERSION,
      privacy: AI_PRIVACY_POLICY,
      context,
    });
    const latest = await latestSaved(supabase, user.id, domain, lease.revision, fingerprint),
      latestInsight = validatedInsight(latest?.insight);
    const sameFingerprintInsight = latestInsight;
    if (new URL(request.url).searchParams.get('force') !== '1' && sameFingerprintInsight) {
      await checkAiLease(lease);
      return NextResponse.json(
        {
          insight: sameFingerprintInsight,
          generatedAt: latest.generated_at,
          model: latest.model,
          enabled: true,
          configured: true,
          cached: true,
          source: 'saved-ai',
          warning: 'Saved AI-generated commentary; not fresh analysis.',
        },
        { headers: aiHeaders },
      );
    }
    const insight = await analyzeDomainWithOpenAI(domain, context, lease);
    if (!insight) throw new AiPrivacyError('UNCONFIGURED');
    const result = await finishAi(lease, {
      fingerprint,
      insight,
      model: intelligenceAnalysisModel(),
    });
    return NextResponse.json(
      {
        ...result,
        enabled: true,
        configured: true,
        source: 'ai',
        currentSnapshot: domain === 'tasks' ? (context.tasks as any)?.today : null,
        currentDate: context.as_of_date,
      },
      { headers: aiHeaders },
    );
  } catch (e) {
    return aiFailure(e);
  }
}
