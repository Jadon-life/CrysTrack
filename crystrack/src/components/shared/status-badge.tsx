'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusStyles: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  missed: 'bg-red-500/10 text-red-400 border-red-500/20',
  not_scheduled: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  upcoming: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  due_soon: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  due_today: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  overdue: 'bg-red-500/10 text-red-400 border-red-500/20',
  active: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  low: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  urgent: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span 
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize',
        statusStyles[status.toLowerCase()] || statusStyles.pending,
        className
      )}
    >
      {status.replace('_', ' ')}
    </span>
  );
}
