'use client';

import React, { useState, useEffect } from 'react';
import { GlassCard } from '@/components/shared/glass-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { fetcher } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { Filter, Calendar, CheckSquare, Target, ClipboardList, Wallet, Loader2 } from 'lucide-react';

const typeIcons = {
  task: <CheckSquare className="w-4 h-4 text-blue-400" />,
  goal: <Target className="w-4 h-4 text-violet-400" />,
  assignment: <ClipboardList className="w-4 h-4 text-amber-400" />,
  finance: <Wallet className="w-4 h-4 text-emerald-400" />,
};

const typeColors = {
  task: 'bg-blue-500/10 text-blue-400',
  goal: 'bg-violet-500/10 text-violet-400',
  assignment: 'bg-amber-500/10 text-amber-400',
  finance: 'bg-emerald-500/10 text-emerald-400',
};

export default function HistoryPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await fetcher('/api/history');
      setHistory(data);
    } catch (e) {
      console.error('Failed to load history', e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = filterType ? history.filter((item: any) => item.entity_type === filterType) : history;

  const grouped = filtered.reduce((acc: any, item: any) => {
    const date = new Date(item.created_at).toISOString().split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">History</h1>
        <p className="text-sm text-slate-400 mt-1">Your complete activity record</p>
      </div>

      <GlassCard padding="sm">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-white">Filters</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilterType(null)} className={cn('px-3 py-1.5 rounded-full text-xs font-medium transition-all', !filterType ? 'bg-white/15 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10')}>All Types</button>
          {(['task', 'goal', 'assignment', 'finance'] as const).map(type => (
            <button key={type} onClick={() => setFilterType(filterType === type ? null : type)} className={cn('px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-all', filterType === type ? typeColors[type] : 'bg-white/5 text-slate-400 hover:bg-white/10')}>{type}</button>
          ))}
        </div>
      </GlassCard>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      )}

      {!loading && history.length === 0 && (
        <GlassCard padding="lg" className="text-center py-12">
          <p className="text-slate-400">No history yet. Start using CrysTrack and your activities will appear here!</p>
        </GlassCard>
      )}

      <div className="space-y-6">
        {Object.entries(grouped).sort((a: any, b: any) => b[0].localeCompare(a[0])).map(([date, items]: [string, any]) => (
          <div key={date}>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-300">{formatDate(date)}</h3>
              <span className="text-xs text-slate-600">({(items as any[]).length} events)</span>
            </div>
            <div className="space-y-2">
              {(items as any[]).map((item: any, i: number) => (
                <GlassCard key={item.id || i} padding="sm" hover className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {typeIcons[item.entity_type as keyof typeof typeIcons] || <CheckSquare className="w-4 h-4 text-slate-400" />}
                    <div>
                      <p className="text-sm font-medium text-white">{item.metadata_json?.title || item.type?.replace('_', ' ') || 'Activity'}</p>
                      {item.metadata_json?.amount && (
                        <p className={cn('text-xs', item.metadata_json.amount > 0 ? 'text-emerald-400' : 'text-red-400')}>${Math.abs(item.metadata_json.amount)}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </GlassCard>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
