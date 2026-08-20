'use client';

import React, { useEffect, useState } from 'react';
import { BrainCircuit, Loader2, RefreshCw } from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';

const LABELS: Record<string, string> = {
  tasks: 'Routine Intelligence',
  goals: 'Goal Intelligence',
  assignments: 'Assignment Intelligence',
  overview: 'Cross-domain Intelligence',
};

export function DomainInsightCard({ domain }: { domain: 'tasks' | 'goals' | 'assignments' | 'overview' }) {
  const [insight, setInsight] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [configured, setConfigured] = useState(true);

  const refresh = async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const response = await fetch(`/api/ai/domain/${domain}`, { method: 'POST', cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (response.ok) {
        setInsight(data?.insight || null);
        setConfigured(data?.configured !== false);
      }
    } finally {
      if (showSpinner) setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/ai/domain/${domain}`, { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!cancelled && response.ok) {
          setInsight(data?.insight || null);
          setConfigured(data?.configured !== false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          void refresh(false);
        }
      }
    };
    const onActivityUpdated = () => { void refresh(false); };
    window.addEventListener('crystrack-activity-updated', onActivityUpdated);
    void load();
    return () => {
      cancelled = true;
      window.removeEventListener('crystrack-activity-updated', onActivityUpdated);
    };
    // Domain is fixed for the lifetime of each mounted page card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain]);

  return (
    <GlassCard padding="md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-[var(--theme-primary)]" />
            <p className="text-sm font-semibold text-white">{LABELS[domain] || 'CrysTrack Intelligence'}</p>
          </div>
          <p className="text-[11px] text-[var(--theme-text-muted)] mt-1">Important observations only. AI refreshes outside the page-loading path and reuses unchanged analysis.</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh(true)}
          disabled={refreshing}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[var(--theme-text-muted)] hover:text-white hover:bg-white/[0.08] disabled:opacity-50"
          aria-label="Refresh AI insight"
        >
          {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
      </div>

      {loading && !insight ? (
        <div className="flex items-center gap-2 py-4 text-xs text-[var(--theme-text-muted)]"><Loader2 className="w-4 h-4 animate-spin" /> Loading saved insight…</div>
      ) : !configured && !insight ? (
        <p className="text-xs text-amber-200 mt-4">AI is not configured for this deployment.</p>
      ) : insight ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-white">{insight.headline}</p>
          <p className="text-xs leading-relaxed text-white/85 mt-2">{insight.summary}</p>
          {Array.isArray(insight.observations) && insight.observations.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {insight.observations.slice(0, 3).map((item: string, index: number) => (
                <p key={index} className="text-[11px] leading-relaxed text-[var(--theme-text-muted)]">• {item}</p>
              ))}
            </div>
          )}
          {Array.isArray(insight.actions) && insight.actions.length > 0 && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--theme-primary)]">Best next move</p>
              <p className="text-xs text-white mt-1">{insight.actions[0]}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-[var(--theme-text-muted)] mt-4">No AI observation yet. CrysTrack will generate one as activity becomes available.</p>
      )}
    </GlassCard>
  );
}
