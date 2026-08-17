'use client';

import React from 'react';
import { GlassCard } from '@/components/shared/glass-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn, formatDate, getGreeting } from '@/lib/utils';
import { Calendar, Clock, Target, CheckSquare, AlertCircle } from 'lucide-react';

interface TodayItem {
  id: string;
  type: 'task' | 'goal' | 'assignment';
  title: string;
  subtitle?: string;
  status: string;
  priority?: string;
  time?: string;
  completed: boolean;
}

const demoItems: TodayItem[] = [
  { id: '1', type: 'task', title: 'Morning workout', subtitle: '30 min cardio', status: 'pending', time: '07:00', completed: false },
  { id: '2', type: 'goal', title: 'Learn JavaScript', subtitle: 'Daily check-in due', status: 'active', completed: false },
  { id: '3', type: 'assignment', title: 'Submit project proposal', subtitle: 'Work assignment', status: 'due_today', priority: 'high', completed: false },
  { id: '4', type: 'task', title: 'Read 20 pages', subtitle: 'Personal development', status: 'pending', time: '20:00', completed: false },
  { id: '5', type: 'assignment', title: 'Review quarterly report', subtitle: 'Finance team', status: 'due_soon', priority: 'medium', completed: false },
];

const typeIcons = {
  task: <CheckSquare className="w-4 h-4 text-blue-400" />,
  goal: <Target className="w-4 h-4 text-violet-400" />,
  assignment: <AlertCircle className="w-4 h-4 text-amber-400" />,
};

export function TodayView() {
  const today = new Date();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">{getGreeting()}</h2>
          <div className="flex items-center gap-2 mt-1 text-slate-400">
            <Calendar className="w-4 h-4" />
            <span className="text-sm">{formatDate(today)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Clock className="w-4 h-4" />
          <span>{today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      {/* Items List */}
      <div className="space-y-2">
        {demoItems.map((item, index) => (
          <GlassCard 
            key={item.id} 
            hover 
            padding="sm"
            className="animate-enter"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex items-center gap-3">
              <Checkbox 
                checked={item.completed}
                className="border-white/30 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {typeIcons[item.type]}
                  <span className={cn(
                    'text-sm font-medium truncate',
                    item.completed ? 'text-slate-500 line-through' : 'text-white'
                  )}>
                    {item.title}
                  </span>
                </div>
                {item.subtitle && (
                  <p className="text-xs text-slate-500 mt-0.5 ml-6">{item.subtitle}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {item.time && (
                  <span className="text-xs text-slate-500">{item.time}</span>
                )}
                <StatusBadge status={item.status} />
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
