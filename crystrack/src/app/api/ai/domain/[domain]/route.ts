import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeDomainWithGroq, intelligenceModel } from '@/lib/ai/intelligence';
import { buildIntelligenceContext, fingerprintContext, type IntelligenceDomain } from '@/lib/ai/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DOMAINS = new Set<IntelligenceDomain>(['tasks', 'goals', 'assignments', 'wealth', 'overview']);

function validDomain(value: string): value is IntelligenceDomain {
  return DOMAINS.has(value as IntelligenceDomain);
}

async function currentUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(_request: Request, { params }: { params: { domain: string } }) {
  if (!validDomain(params.domain)) return NextResponse.json({ error: 'Unknown AI domain' }, { status: 404 });
  const { supabase, user } = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('ai_domain_insights')
    .select('insight, generated_at, model')
    .eq('user_id', user.id)
    .eq('domain', params.domain)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    insight: data?.insight || null,
    generatedAt: data?.generated_at || null,
    model: data?.model || intelligenceModel(),
    configured: Boolean(process.env.GROQ_API_KEY),
    cached: Boolean(data),
  });
}

export async function POST(_request: Request, { params }: { params: { domain: string } }) {
  if (!validDomain(params.domain)) return NextResponse.json({ error: 'Unknown AI domain' }, { status: 404 });
  const { supabase, user } = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: latest } = await supabase
    .from('ai_domain_insights')
    .select('insight, generated_at, model, data_fingerprint')
    .eq('user_id', user.id)
    .eq('domain', params.domain)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({
      insight: latest?.insight || null,
      generatedAt: latest?.generated_at || null,
      model: latest?.model || intelligenceModel(),
      configured: false,
      cached: Boolean(latest),
    });
  }

  try {
    const context = await buildIntelligenceContext(supabase, user.id, params.domain);
    const fingerprint = fingerprintContext(context);

    if (latest?.data_fingerprint === fingerprint && latest?.insight) {
      return NextResponse.json({
        insight: latest.insight,
        generatedAt: latest.generated_at,
        model: latest.model,
        configured: true,
        cached: true,
      });
    }

    const { data: sameFingerprint } = await supabase
      .from('ai_domain_insights')
      .select('insight, generated_at, model')
      .eq('user_id', user.id)
      .eq('domain', params.domain)
      .eq('data_fingerprint', fingerprint)
      .maybeSingle();

    if (sameFingerprint?.insight) {
      return NextResponse.json({
        insight: sameFingerprint.insight,
        generatedAt: sameFingerprint.generated_at,
        model: sameFingerprint.model,
        configured: true,
        cached: true,
      });
    }

    const insight = await analyzeDomainWithGroq(params.domain, context);
    if (!insight) {
      return NextResponse.json({
        insight: latest?.insight || null,
        generatedAt: latest?.generated_at || null,
        model: latest?.model || intelligenceModel(),
        configured: false,
        cached: Boolean(latest),
      });
    }

    const { data: stored, error: storeError } = await supabase
      .from('ai_domain_insights')
      .insert({
        user_id: user.id,
        domain: params.domain,
        data_fingerprint: fingerprint,
        insight,
        model: intelligenceModel(),
      })
      .select('insight, generated_at, model')
      .single();

    if (storeError && storeError.code !== '23505') throw storeError;

    if (!stored && storeError?.code === '23505') {
      const { data: raced } = await supabase
        .from('ai_domain_insights')
        .select('insight, generated_at, model')
        .eq('user_id', user.id)
        .eq('domain', params.domain)
        .eq('data_fingerprint', fingerprint)
        .maybeSingle();
      if (raced) return NextResponse.json({ insight: raced.insight, generatedAt: raced.generated_at, model: raced.model, configured: true, cached: true });
    }

    return NextResponse.json({
      insight: stored?.insight || insight,
      generatedAt: stored?.generated_at || new Date().toISOString(),
      model: stored?.model || intelligenceModel(),
      configured: true,
      cached: false,
    });
  } catch (error: any) {
    if (latest?.insight) {
      return NextResponse.json({
        insight: latest.insight,
        generatedAt: latest.generated_at,
        model: latest.model,
        configured: true,
        cached: true,
        stale: true,
        warning: 'Fresh AI analysis is temporarily unavailable; showing the latest saved insight.',
      });
    }
    return NextResponse.json({ error: error?.message || 'AI analysis is temporarily unavailable' }, { status: 503 });
  }
}
