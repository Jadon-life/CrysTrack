import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  analyzeDomainWithOpenRouter,
  DomainInsightSchema,
  intelligenceAnalysisModel,
} from '@/lib/ai/intelligence';
import { buildIntelligenceContext, fingerprintContext, type IntelligenceDomain } from '@/lib/ai/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DOMAINS = new Set<IntelligenceDomain>(['tasks', 'goals', 'assignments', 'wealth', 'overview']);

function validDomain(value: string): value is IntelligenceDomain {
  return DOMAINS.has(value as IntelligenceDomain);
}

function validatedInsight(value: unknown) {
  const parsed =
    DomainInsightSchema.safeParse(value);

  return parsed.success
    ? parsed.data
    : null;
}

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(_request: Request, props: { params: Promise<{ domain: string }> }) {
  const params = await props.params;
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

  const insight =
    validatedInsight(data?.insight);

  return NextResponse.json({
    insight,
    generatedAt: data?.generated_at || null,
    model: data?.model || intelligenceAnalysisModel(),
    configured: Boolean(process.env.OPENROUTER_API_KEY),
    cached: Boolean(insight),
  });
}

export async function POST(
  request: Request,
  props: {
    params: Promise<{ domain: string }>;
  },
) {
  const params = await props.params;

  if (!validDomain(params.domain)) {
    return NextResponse.json(
      { error: 'Unknown AI domain' },
      { status: 404 },
    );
  }

  const { supabase, user } =
    await currentUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 },
    );
  }

  const forceRefresh =
    new URL(request.url)
      .searchParams
      .get('force') === '1';

  const { data: latest } =
    await supabase
      .from('ai_domain_insights')
      .select(
        'insight, generated_at, model, data_fingerprint',
      )
      .eq('user_id', user.id)
      .eq('domain', params.domain)
      .order(
        'generated_at',
        { ascending: false },
      )
      .limit(1)
      .maybeSingle();

  const latestInsight =
    validatedInsight(
      latest?.insight,
    );

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({
      insight:
        latestInsight,
      generatedAt:
        latest?.generated_at || null,
      model:
        latest?.model ||
        intelligenceAnalysisModel(),
      configured: false,
      cached: Boolean(latestInsight),
      currentSnapshot: null,
      currentDate: null,
    });
  }

  let currentSnapshot: any = null;
  let currentDate: string | null = null;

  try {
    const context =
      await buildIntelligenceContext(
        supabase,
        user.id,
        params.domain,
      );

    const fingerprint =
      fingerprintContext(context);

    currentDate =
      String(
        (context as any)
          ?.as_of_date || '',
      ) || null;

    currentSnapshot =
      params.domain === 'tasks'
        ? (
            (context as any)
              ?.tasks?.today || null
          )
        : null;

    if (
      !forceRefresh &&
      latest?.data_fingerprint ===
        fingerprint &&
      latestInsight
    ) {
      return NextResponse.json({
        insight: latestInsight,
        generatedAt:
          latest.generated_at,
        model: latest.model,
        configured: true,
        cached: true,
        currentSnapshot,
        currentDate,
      });
    }

    if (!forceRefresh) {
      const {
        data: sameFingerprint,
      } = await supabase
        .from('ai_domain_insights')
        .select(
          'insight, generated_at, model',
        )
        .eq('user_id', user.id)
        .eq(
          'domain',
          params.domain,
        )
        .eq(
          'data_fingerprint',
          fingerprint,
        )
        .maybeSingle();

      const sameFingerprintInsight =
        validatedInsight(
          sameFingerprint?.insight,
        );

      if (
        sameFingerprint &&
        sameFingerprintInsight
      ) {
        return NextResponse.json({
          insight:
            sameFingerprintInsight,
          generatedAt:
            sameFingerprint
              .generated_at,
          model:
            sameFingerprint.model,
          configured: true,
          cached: true,
          currentSnapshot,
          currentDate,
        });
      }
    }

    const insight =
      await analyzeDomainWithOpenRouter(
        params.domain,
        context,
      );

    if (!insight) {
      return NextResponse.json({
        insight:
          latestInsight,
        generatedAt:
          latest?.generated_at ||
          null,
        model:
          latest?.model ||
          intelligenceAnalysisModel(),
        configured: false,
        cached: Boolean(latestInsight),
        currentSnapshot,
        currentDate,
      });
    }

    const generatedAt =
      new Date().toISOString();

    const {
      data: stored,
      error: storeError,
    } = await supabase
      .from('ai_domain_insights')
      .upsert(
        {
          user_id: user.id,
          domain: params.domain,
          data_fingerprint:
            fingerprint,
          insight,
          model:
            intelligenceAnalysisModel(),
          generated_at:
            generatedAt,
        },
        {
          onConflict:
            'user_id,domain,data_fingerprint',
        },
      )
      .select(
        'insight, generated_at, model',
      )
      .single();

    if (storeError) {
      throw storeError;
    }

    return NextResponse.json({
      insight:
        stored?.insight || insight,
      generatedAt:
        stored?.generated_at ||
        generatedAt,
      model:
        stored?.model ||
        intelligenceAnalysisModel(),
      configured: true,
      cached: false,
      currentSnapshot,
      currentDate,
    });
  } catch (error: any) {
    if (latest && latestInsight) {
      return NextResponse.json({
        insight: latestInsight,
        generatedAt:
          latest.generated_at,
        model: latest.model,
        configured: true,
        cached: true,
        stale: true,
        warning:
          'Fresh AI analysis is temporarily unavailable; showing the latest saved insight.',
        currentSnapshot,
        currentDate,
      });
    }

    return NextResponse.json(
      {
        error:
          error?.message ||
          'AI analysis is temporarily unavailable',
      },
      { status: 503 },
    );
  }
}
