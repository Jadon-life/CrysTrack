'use client';

import React, { useState, useEffect } from 'react';
import { GlassCard } from '@/components/shared/glass-card';
import { fetcher } from '@/lib/api';
import { BrainCircuit, TrendingUp, AlertTriangle, Lightbulb, Target, CheckSquare, Wallet, Loader2 } from 'lucide-react';

const riskColors = {
  low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  high: 'text-red-400 bg-red-500/10 border-red-500/20',
};

const typeIcons = {
  goal: <Target className="w-5 h-5 text-violet-400" />,
  task: <CheckSquare className="w-5 h-5 text-blue-400" />,
  finance: <Wallet className="w-5 h-5 text-emerald-400" />,
  assignment: <AlertTriangle className="w-5 h-5 text-amber-400" />,
  summary: <BrainCircuit className="w-5 h-5 text-cyan-400" />,
};

export default function InsightsPage() {
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInsights();
  }, []);

  const loadInsights = async () => {
    setLoading(true);
    try {
      const data = await fetcher('/api/insights');
      setInsights(data);
    } catch (e) {
      console.error('Failed to load insights', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">AI Insights</h1>
        <p className="text-sm text-slate-400 mt-1">Data-driven analysis and recommendations</p>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
        </div>
      )}

      {!loading && insights.length === 0 && (
        <GlassCard padding="lg" className="text-center py-12">
          <BrainCircuit className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">Not enough data yet. Keep using CrysTrack and AI insights will appear here!</p>
        </GlassCard>
      )}

      <div className="space-y-4">
        {insights.map((insight: any, index: number) => (
          <GlassCard key={insight.id} padding="md" className="animate-enter" style={{ animationDelay: `${index * 100}ms` }}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {typeIcons[insight.type as keyof typeof typeIcons] || <BrainCircuit className="w-5 h-5 text-cyan-400" />}
                <div>
                  <h3 className="text-base font-semibold text-white">{insight.title}</h3>
                  <p className="text-xs text-slate-500">Generated {new Date(insight.generatedAt).toLocaleDateString()}</p>
                </div>
              </div>
              {insight.riskLevel && (
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${riskColors[insight.riskLevel as keyof typeof riskColors]}`}>
                  {insight.riskLevel} risk
                </span>
              )}
            </div>
            <div className="flex items-start gap-2 mb-4">
              <BrainCircuit className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
              <p className="text-sm text-slate-300 leading-relaxed">{insight.summary}</p>
            </div>
            {insight.recommendations && insight.recommendations.length > 0 && (
              <div className="bg-white/5 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold text-amber-400">Recommendations</span>
                </div>
                <ul className="space-y-1.5">
                  {insight.recommendations.map((rec: string, i: number) => (
                    <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="text-blue-400 mt-1.5">•</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
