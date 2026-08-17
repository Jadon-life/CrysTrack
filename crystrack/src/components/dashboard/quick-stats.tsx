'use client';

import React from 'react';
import { GlassCard } from '@/components/shared/glass-card';
import { CheckSquare, Target, ClipboardList, Wallet } from 'lucide-react';

interface QuickStatsProps {
  stats?: {
    tasksDue: number;
    tasksCompleted: number;
    activeGoals: number;
    assignmentsDue: number;
    assignmentsOverdue: number;
    savingsProgress: number;
  };
}

export function QuickStats({ stats }: QuickStatsProps) {
  const displayStats = [
    { label: 'Tasks Done', value: `${stats?.tasksCompleted || 0}/${stats?.tasksDue || 0}`, icon: <CheckSquare className="w-5 h-5 text-emerald-400" />, color: 'emerald' },
    { label: 'Active Goals', value: String(stats?.activeGoals || 0), icon: <Target className="w-5 h-5 text-violet-400" />, color: 'violet' },
    { label: 'Due Soon', value: String(stats?.assignmentsDue || 0), icon: <ClipboardList className="w-5 h-5 text-amber-400" />, color: 'amber' },
    { label: 'Savings', value: `${stats?.savingsProgress || 0}%`, icon: <Wallet className="w-5 h-5 text-blue-400" />, color: 'blue' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {displayStats.map((stat, index) => (
        <GlassCard key={stat.label} padding="sm" className="animate-enter" style={{ animationDelay: `${index * 75}ms` }}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-${stat.color}-500/10`}>
              {stat.icon}
            </div>
            <div>
              <p className="text-lg font-bold text-white">{stat.value}</p>
              <p className="text-xs text-slate-400">{stat.label}</p>
            </div>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}
