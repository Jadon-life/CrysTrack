'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { GlassCard } from '@/components/shared/glass-card';
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">Insights</p>
          <h1 className="text-2xl font-bold text-white mt-1">What your activity is showing</h1>
          <p className="text-sm text-slate-400 mt-1">Summaries are calculated from your recorded CrysTrack data—no demo claims.</p>
        </div>
        <Link href="/history" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03] text-sm text-slate-300 hover:text-white hover:bg-white/[0.06]">
          <History className="w-4 h-4" /> History
        </Link>
      </div>

      <DomainInsightCard domain="overview" />

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {loading && <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>}

      {!loading && insights.length === 0 && (
        <GlassCard padding="lg" className="text-center py-12">
          <BrainCircuit className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">Not enough recorded activity yet. Complete tasks, check in on goals, or add financial entries.</p>
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
                  <p className="text-xs text-slate-500">Updated {new Date(insight.generatedAt).toLocaleString()}</p>
                </div>
              </div>
              {insight.riskLevel && <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize shrink-0 ${riskColors[insight.riskLevel as keyof typeof riskColors] || riskColors.low}`}>{insight.riskLevel} risk</span>}
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{insight.summary}</p>
            {Array.isArray(insight.recommendations) && insight.recommendations.length > 0 && (
              <div className="bg-white/[0.025] border border-white/[0.06] rounded-lg p-3 mt-4">
                <div className="flex items-center gap-2 mb-2"><Lightbulb className="w-4 h-4 text-amber-400" /><span className="text-xs font-semibold text-amber-300">Next actions</span></div>
                <ul className="space-y-1.5">
                  {insight.recommendations.map((recommendation: string, i: number) => <li key={i} className="text-sm text-slate-400 flex items-start gap-2"><span className="text-blue-400 mt-1.5">•</span>{recommendation}</li>)}
                </ul>
              </div>
            )}
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
