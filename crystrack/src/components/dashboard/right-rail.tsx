'use client';

import React from 'react';
import { GlassCard } from '@/components/shared/glass-card';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, BrainCircuit, PiggyBank, Target } from 'lucide-react';

export function RightRail() {
  return (
    <div className="space-y-4">
      {/* Today's Note */}
      <GlassCard>
        <h3 className="text-sm font-semibold text-white mb-3">Today&apos;s Note</h3>
        <textarea 
          placeholder="How are you feeling today? What's your focus?"
          className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white placeholder:text-slate-500 resize-none h-24 focus:outline-none focus:border-blue-500/50 transition-colors"
        />
      </GlassCard>

      {/* Goal Snapshot */}
      <GlassCard>
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-white">Goal Snapshot</h3>
        </div>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300">Learn JavaScript</span>
              <span className="text-violet-400">65%</span>
            </div>
            <Progress value={65} className="h-1.5 bg-white/10" />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300">Build Portfolio</span>
              <span className="text-violet-400">30%</span>
            </div>
            <Progress value={30} className="h-1.5 bg-white/10" />
          </div>
        </div>
      </GlassCard>

      {/* Finance Snapshot */}
      <GlassCard>
        <div className="flex items-center gap-2 mb-3">
          <PiggyBank className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Finance</h3>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Emergency Fund</span>
            <span className="text-emerald-400 font-medium">$4,200 / $10k</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">New Laptop</span>
            <span className="text-blue-400 font-medium">$800 / $2k</span>
          </div>
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-emerald-400">+$1,200 this month</span>
          </div>
        </div>
      </GlassCard>

      {/* AI Insight */}
      <GlassCard glow>
        <div className="flex items-center gap-2 mb-3">
          <BrainCircuit className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white">AI Insight</h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          You&apos;ve maintained a 5-day streak on morning workouts. Your JavaScript goal is on track, 
          but consider dedicating 10 more minutes daily to stay ahead of your deadline.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <TrendingDown className="w-3 h-3 text-amber-400" />
          <span className="text-xs text-amber-400">2 assignments need attention</span>
        </div>
      </GlassCard>
    </div>
  );
}
