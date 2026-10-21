'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { GlassCard } from '@/components/shared/glass-card';
import { CrystalCard } from '@/components/crystals/crystal-card';
import { DomainInsightCard } from '@/components/ai/domain-insight-card';
import { fetcher } from '@/lib/api';
import { BrainCircuit, AlertTriangle, Lightbulb, Target, CheckSquare, Wallet, Loader2, History } from 'lucide-react';

const riskColors = {
  low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  high: 'text-red-400 bg-red-500/10 border-red-500/20',
};

const typeIcons = {
  goal: <Target className="w-5 h-5 text-blue-400" />,
  task: <CheckSquare className="w-5 h-5 text-blue-400" />,
  finance: <Wallet className="w-5 h-5 text-blue-400" />,
  assignment: <AlertTriangle className="w-5 h-5 text-amber-400" />,
  summary: <BrainCircuit className="w-5 h-5 text-blue-400" />,
};

export default function InsightsPage() {
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetcher('/api/insights')
      .then(setInsights)
      .catch((e) => setError(e.message || 'Failed to load insights'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start sm:flex-row sm:items-center justify-between gap-4 scenic-readable-copy">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-primary)]">Insights</p>
          <h1 className="text-2xl font-bold text-white mt-1">What your activity is showing</h1>
          <p className="text-sm text-[var(--theme-text-muted)] mt-1">Summaries are calculated from your recorded CrysTrack data—no demo claims.</p>
        </div>
        <Link href="/history" className="inline-flex min-h-10 items-center gap-2 px-3 py-2 rounded-lg border border-white/20 bg-white/10 text-sm text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">
          <History className="w-4 h-4" /> History
        </Link>
      </div>

      <CrystalCard />
      <DomainInsightCard domain="overview" />

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {loading && <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>}

      {!loading && insights.length === 0 && (
        <GlassCard padding="lg" className="text-center py-8">
          <BrainCircuit className="w-9 h-9 text-[var(--theme-primary)] mx-auto mb-3" aria-hidden="true" />
          <p className="text-base font-semibold text-white">Your insights are taking shape</p>
          <p className="mx-auto max-w-lg text-sm leading-relaxed text-[var(--theme-text-muted)] mt-2">
            Complete routines or check in on goals to give CrysTrack real progress to analyze.
          </p>
          <Link href="/plan" className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-[var(--theme-border)] bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">
            Explore Plan
          </Link>
        </GlassCard>
      )}

      <div className="space-y-4">
        {insights.map((insight: any, index: number) => (
          <GlassCard key={insight.id} padding="md" className="animate-enter" style={{ animationDelay: `${index * 60}ms` }}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3 min-w-0">
                {typeIcons[insight.type as keyof typeof typeIcons] || typeIcons.summary}
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-white truncate">{insight.title}</h3>
                  <p className="text-xs text-[var(--theme-text-muted)]">Updated {new Date(insight.generatedAt).toLocaleString()}</p>
                </div>
              </div>
              {insight.riskLevel && <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize shrink-0 ${riskColors[insight.riskLevel as keyof typeof riskColors] || riskColors.low}`}>{insight.riskLevel} risk</span>}
            </div>
            <p className="text-sm text-[var(--theme-text-muted)] leading-relaxed">{insight.summary}</p>
            {Array.isArray(insight.recommendations) && insight.recommendations.length > 0 && (
              <div className="bg-white/[0.025] border border-white/[0.06] rounded-lg p-3 mt-4">
                <div className="flex items-center gap-2 mb-2"><Lightbulb className="w-4 h-4 text-amber-400" /><span className="text-xs font-semibold text-amber-300">Next actions</span></div>
                <ul className="space-y-1.5">
                  {insight.recommendations.map((recommendation: string, i: number) => <li key={i} className="text-sm leading-relaxed text-[var(--theme-text-muted)] flex items-start gap-2"><span className="text-blue-400 mt-1.5">•</span>{recommendation}</li>)}
                </ul>
              </div>
            )}
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
