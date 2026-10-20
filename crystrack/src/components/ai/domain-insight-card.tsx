'use client';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BrainCircuit, Loader2, RefreshCw } from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';
import { useAuth } from '@/components/layout/auth-provider';
import { AiPrivacyNotice, useAiPrivacy } from './ai-privacy';

type Domain = 'tasks' | 'goals' | 'assignments' | 'overview' | 'wealth';
const LABELS = {
  tasks: 'Routine Intelligence',
  goals: 'Goal Intelligence',
  assignments: 'Assignment Intelligence',
  overview: 'Cross-domain Intelligence',
  wealth: 'Wealth Intelligence',
};
export function AiDomainContent({ domain, fallback }: { domain: Domain; fallback?: string }) {
  const privacy = useAiPrivacy(),
    { user } = useAuth(),
    key = user?.id + ':' + privacy.state?.revision;
  const current = useRef(key);
  useLayoutEffect(() => {
    current.current = key;
  }, [key]);
  const [bundle, setBundle] = useState<{ key: string; data: any } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const sequence = useRef(0);
  const enabled =
    !!privacy.state?.enabled && (domain !== 'wealth' || !!privacy.state.wealthEnabled);
  const refresh = async (generate = false) => {
    const seq = ++sequence.current,
      ownerKey = current.current;
    setError('');
    if (generate) setBusy(true);
    try {
      const r = await fetch(`/api/ai/domain/${domain}${generate ? '?force=1' : ''}`, {
          method: generate ? 'POST' : 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        }),
        data = await r.json();
      if (seq !== sequence.current || ownerKey !== current.current) return;
      if (!r.ok) throw new Error(data.error || 'AI commentary is unavailable.');
      setBundle({ key: ownerKey, data });
    } catch (e: any) {
      if (seq === sequence.current && ownerKey === current.current)
        setError(e?.message || 'AI commentary is unavailable.');
    } finally {
      if (seq === sequence.current) setBusy(false);
    }
  };
  useEffect(() => {
    const counter = sequence;
    // Navigation and activity changes read local cache only; never generate a provider request.
    queueMicrotask(() => void refresh(false));
    const changed = () => void refresh(false);
    window.addEventListener('crystrack-activity-updated', changed);
    return () => {
      counter.current++;
      window.removeEventListener('crystrack-activity-updated', changed);
    };
    // The request key changes for every owner/permission revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, key]);
  const data = enabled && bundle?.key === key ? bundle.data : null,
    insight = data?.insight;
  return (
    <div className="space-y-3" data-testid={'ai-domain-' + domain}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <BrainCircuit aria-hidden="true" className="h-4 w-4 text-[var(--theme-primary)]" />
            {LABELS[domain]}
          </h3>
          <p className="mt-1 text-xs text-[var(--theme-text-muted)]">
            CrysTrack reuses unchanged analysis. New provider analysis runs only when requested or
            on an authorized AI-coached goal check-in.
          </p>
        </div>
        <button
          type="button"
          aria-label={domain === 'wealth' ? 'Refresh Wealth Intelligence' : 'Refresh AI insight'}
          disabled={!enabled || !privacy.state?.configured || busy}
          onClick={() => void refresh(true)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/25 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>
      <AiPrivacyNotice wealth={domain === 'wealth'} />
      {error && (
        <p role="alert" className="rounded-lg bg-slate-950/80 p-3 text-sm text-amber-100">
          {error}
        </p>
      )}
      {insight ? (
        <div className="space-y-2 rounded-xl bg-slate-950/75 p-3 text-sm text-slate-100">
          <p className="text-xs text-slate-200">
            Saved AI-generated commentary ·{' '}
            {data.generatedAt ? new Date(data.generatedAt).toLocaleString() : 'date unavailable'}.
            May be incomplete or incorrect; not current approval.
          </p>
          <p className="font-semibold text-white">{insight.headline}</p>
          <p>{insight.summary}</p>
          {insight.observations?.slice(0, 3).map((x: string, i: number) => (
            <p key={i}>{x}</p>
          ))}
          {insight.actions?.length > 0 && (
            <p>
              <span className="font-semibold">Suggested focus: </span>
              {insight.actions[0]}
            </p>
          )}
        </div>
      ) : fallback ? (
        <div className="rounded-xl bg-slate-950/75 p-3 text-sm text-slate-100">
          <p className="mb-1 text-xs font-semibold text-cyan-100">
            Local calculation · not AI-generated
          </p>
          {fallback}
        </div>
      ) : (
        <p className="text-xs text-[var(--theme-text-muted)]">
          No approved saved AI commentary is shown. Your deterministic tracking still works.
        </p>
      )}
    </div>
  );
}
export function DomainInsightCard({ domain }: { domain: Domain }) {
  return (
    <GlassCard padding="md">
      <AiDomainContent domain={domain} />
    </GlassCard>
  );
}
