'use client';

import React from 'react';
import Link from 'next/link';
import { GlassCard } from '@/components/shared/glass-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn, formatDate, getGreeting } from '@/lib/utils';
import { Calendar, Clock, Target, CheckSquare, AlertCircle, Loader2 } from 'lucide-react';

export interface TodayViewItem {
  id: string;
  entityId: string;
  type: 'task' | 'goal' | 'assignment';
  title: string;
  subtitle?: string;
  status: string;
  time?: string;
  completed?: boolean;
  href?: string;
}

const typeIcons = {
  task: <CheckSquare className="w-4 h-4 text-blue-400" />,
  goal: <Target className="w-4 h-4 text-blue-400" />,
  assignment: <AlertCircle className="w-4 h-4 text-amber-400" />,
};

interface TodayViewProps {
  items: TodayViewItem[];
  loading?: boolean;
  onToggleTask?: (taskId: string) => Promise<void>;
}

export function TodayView({ items, loading = false, onToggleTask }: TodayViewProps) {
  const today = new Date();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">{getGreeting()}</h2>
          <div className="flex items-center gap-2 mt-1 text-slate-400">
            <Calendar className="w-4 h-4" />
            <span className="text-sm">{formatDate(today)}</span>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-sm text-slate-400">
          <Clock className="w-4 h-4" />
          <span>{today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-8 text-center">
          <p className="text-sm font-medium text-white">Nothing urgent right now.</p>
          <p className="text-xs text-slate-500 mt-1">Scheduled routines and near-term deadlines will appear here.</p>
        </div>
      )}

      <div className="space-y-2">
        {items.map((item, index) => (
          <GlassCard key={item.id} padding="sm" className="animate-enter" style={{ animationDelay: `${index * 60}ms` }}>
            <div className="flex items-center gap-3">
              {item.type === 'task' ? (
                <Checkbox
                  checked={Boolean(item.completed)}
                  onCheckedChange={() => onToggleTask?.(item.entityId)}
                  className="border-white/30 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                  aria-label={`Mark ${item.title} ${item.completed ? 'incomplete' : 'complete'}`}
                />
              ) : (
                <div className="w-4 h-4 flex items-center justify-center" aria-hidden="true">
                  {typeIcons[item.type]}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  {item.type === 'task' && typeIcons.task}
                  {item.href ? (
                    <Link href={item.href} className="text-sm font-medium text-white truncate hover:text-blue-300 transition-colors">
                      {item.title}
                    </Link>
                  ) : (
                    <span className={cn('text-sm font-medium truncate', item.completed ? 'text-slate-500 line-through' : 'text-white')}>
                      {item.title}
                    </span>
                  )}
                </div>
                {item.subtitle && <p className="text-xs text-slate-500 mt-0.5 ml-6 truncate">{item.subtitle}</p>}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {item.time && <span className="hidden sm:inline text-xs text-slate-500">{item.time}</span>}
                <StatusBadge status={item.status} />
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
