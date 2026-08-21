'use client';

import React from 'react';
import Link from 'next/link';
import { GlassCard } from '@/components/shared/glass-card';
import { Progress } from '@/components/ui/progress';
import { BrainCircuit, PiggyBank, Target } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface RightRailProps {
  goals?: any[];
  targets?: any[];
  insight?: any;
}

export function RightRail({ goals = [], targets = [], insight }: RightRailProps) {
  const visibleGoals = goals.slice(0, 3);
  const visibleTargets = targets.slice(0, 3);

  return (
    <div className="space-y-4">
      <GlassCard>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Goals</h3>
          </div>
          <Link href="/goals" className="text-[11px] font-medium text-blue-400 hover:text-blue-300">Open</Link>
        </div>
        {visibleGoals.length === 0 ? (
          <p className="text-xs text-slate-500">No active goals yet.</p>
        ) : (
          <div className="space-y-3">
            {visibleGoals.map((goal) => {
              const target = Number(goal.target_value || 0);
              const current = Number(goal.progress_value || 0);
              const percent = goal.measurable && target > 0 ? Math.min(100, Math.round((current / target) * 100)) : null;
              return (
                <div key={goal.id}>
                  <div className="flex justify-between gap-3 text-xs mb-1">
                    <span className="text-slate-300 truncate">{goal.title}</span>
                    <span className="text-slate-500 shrink-0">{percent == null ? 'Active' : `${percent}%`}</span>
                  </div>
                  {percent != null && <Progress value={percent} className="h-1.5 bg-white/10" />}
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <PiggyBank className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Money targets</h3>
          </div>
          <Link href="/finance" className="text-[11px] font-medium text-blue-400 hover:text-blue-300">Open</Link>
        </div>
        {visibleTargets.length === 0 ? (
          <p className="text-xs text-slate-500">No active savings targets yet.</p>
        ) : (
          <div className="space-y-3">
            {visibleTargets.map((target) => {
              const current = Number(target.current_amount || 0);
              const goal = Number(target.target_amount || 0);
              const percent = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
              return (
                <div key={target.id}>
                  <div className="flex justify-between gap-3 text-xs mb-1">
                    <span className="text-slate-300 truncate">{target.title}</span>
                    <span className="text-slate-500 shrink-0">{percent}%</span>
                  </div>
                  <Progress value={percent} className="h-1.5 bg-white/10" />
                  <p className="text-[11px] text-slate-600 mt-1">{formatCurrency(current)} of {formatCurrency(goal)}</p>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Current insight</h3>
          </div>
          <Link href="/insights" className="text-[11px] font-medium text-blue-400 hover:text-blue-300">Open</Link>
        </div>
        {insight ? (
          <>
            <p className="text-xs font-medium text-slate-200 mb-1">{insight.title}</p>
            <p className="text-xs text-slate-400 leading-relaxed">{insight.summary}</p>
          </>
        ) : (
          <p className="text-xs text-slate-500">Insights appear as CrysTrack collects real progress data.</p>
        )}
      </GlassCard>
    </div>
  );
}
