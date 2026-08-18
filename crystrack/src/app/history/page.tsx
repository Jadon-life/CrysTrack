'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, CheckCircle2, CircleSlash2, ClipboardList, Filter, Loader2, Target, Wallet, XCircle } from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';
import { fetcher } from '@/lib/api';
import { cn } from '@/lib/utils';

const entityIcons: Record<string, React.ReactNode> = {
  task: <CheckCircle2 className="w-4 h-4" />,
  goal: <Target className="w-4 h-4" />,
  assignment: <ClipboardList className="w-4 h-4" />,
  finance: <Wallet className="w-4 h-4" />,
};

function taskOutcome(item: any) {
  if (item.type === 'task_completed') return { label: 'Completed', icon: <CheckCircle2 className="w-3.5 h-3.5" />, tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' };
  if (item.type === 'task_missed') return { label: 'Missed', icon: <XCircle className="w-3.5 h-3.5" />, tone: 'text-red-300 bg-red-500/10 border-red-500/20' };
  if (item.type === 'task_skipped') return { label: 'Skipped', icon: <CircleSlash2 className="w-3.5 h-3.5" />, tone: 'text-amber-300 bg-amber-500/10 border-amber-500/20' };
  return null;
}

function eventDateKey(item: any) {
  if (item.entity_type === 'task' && item.metadata_json?.date) return String(item.metadata_json.date).slice(0, 10);
  const date = new Date(item.created_at);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string | null>(null);

  useEffect(() => {
    fetcher('/api/history').then(setHistory).catch(() => setHistory([])).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => filterType ? history.filter((item) => item.entity_type === filterType) : history, [history, filterType]);
  const grouped = useMemo(() => filtered.reduce((acc: Record<string, any[]>, item: any) => {
    const key = eventDateKey(item);
    (acc[key] ||= []).push(item);
    return acc;
  }, {}), [filtered]);

  return (
    <div className="space-y-6">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-primary)]">Insights · Record</p><h1 className="text-2xl font-bold text-white mt-1">History</h1><p className="text-sm text-[var(--theme-text-muted)] mt-1">A missing routine is not ambiguous anymore: CrysTrack records Completed, Missed and intentionally Skipped separately.</p></div>

      <GlassCard padding="sm"><div className="flex items-center gap-2 mb-3"><Filter className="w-4 h-4 text-[var(--theme-text-muted)]" /><span className="text-sm font-medium text-white">Filter</span></div><div className="flex flex-wrap gap-2"><button onClick={() => setFilterType(null)} className={cn('px-3 py-1.5 rounded-full text-xs border', !filterType ? 'bg-white/10 text-white border-white/20' : 'border-white/10 text-[var(--theme-text-muted)]')}>All</button>{['task','goal','assignment','finance'].map((type) => <button key={type} onClick={() => setFilterType(filterType === type ? null : type)} className={cn('px-3 py-1.5 rounded-full text-xs capitalize border', filterType === type ? 'bg-white/10 text-white border-[var(--theme-border)]' : 'border-white/10 text-[var(--theme-text-muted)]')}>{type}</button>)}</div></GlassCard>

      {loading && <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-[var(--theme-primary)]" /></div>}
      {!loading && history.length === 0 && <GlassCard padding="lg" className="text-center py-12"><p className="text-[var(--theme-text-muted)]">No history yet.</p></GlassCard>}

      <div className="space-y-6">{Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0])).map(([date, items]) => <section key={date}><div className="flex items-center gap-2 mb-3"><Calendar className="w-4 h-4 text-[var(--theme-text-muted)]" /><h3 className="text-sm font-semibold text-white">{new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</h3><span className="text-[10px] text-[var(--theme-text-muted)]">{(items as any[]).length} event{(items as any[]).length === 1 ? '' : 's'}</span></div><div className="space-y-2">{(items as any[]).map((item: any) => { const outcome = taskOutcome(item); return <GlassCard key={item.id} padding="sm"><div className="flex items-center gap-3"><span className="text-[var(--theme-primary)]">{entityIcons[item.entity_type] || <CheckCircle2 className="w-4 h-4" />}</span><div className="flex-1 min-w-0"><p className="text-sm text-white truncate">{item.metadata_json?.title || item.type?.replaceAll('_',' ')}</p><p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">{item.entity_type}</p></div>{outcome && <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold', outcome.tone)}>{outcome.icon}{outcome.label}</span>}<span className="hidden sm:block text-[10px] text-[var(--theme-text-muted)]">{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div></GlassCard>; })}</div></section>)}</div>
    </div>
  );
}
