'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
      <header className="scenic-readable-strip max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-primary)]">Insights · Record</p>
        <h1 className="text-2xl font-bold text-white mt-1">History</h1>
        <p className="text-sm text-white/85 mt-1">CrysTrack records Completed, Missed and intentionally Skipped routines separately, so your progress remains clear.</p>
      </header>

      <GlassCard padding="sm">
        <div className="flex items-center gap-2 mb-3"><Filter className="w-4 h-4 text-[var(--theme-text-muted)]" /><span className="text-sm font-medium text-white">Filter</span></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={filterType === null} onClick={() => setFilterType(null)} className={cn('min-h-9 px-3 py-1.5 rounded-full text-xs border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300', !filterType ? 'bg-white/10 text-white border-white/20' : 'border-white/10 text-[var(--theme-text-muted)] hover:bg-white/5')}>All</button>
          {['task', 'goal', 'assignment', 'finance'].map((type) => (
            <button key={type} type="button" aria-pressed={filterType === type} onClick={() => setFilterType(filterType === type ? null : type)} className={cn('min-h-9 px-3 py-1.5 rounded-full text-xs capitalize border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300', filterType === type ? 'bg-white/10 text-white border-[var(--theme-border)]' : 'border-white/10 text-[var(--theme-text-muted)] hover:bg-white/5')}>{type}</button>
          ))}
        </div>
      </GlassCard>

      {loading && <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-[var(--theme-primary)]" /></div>}
      {!loading && history.length === 0 && (
        <GlassCard padding="lg" className="text-center py-8">
          <Calendar className="mx-auto mb-3 h-8 w-8 text-[var(--theme-primary)]" aria-hidden="true" />
          <p className="text-base font-semibold text-white">Your activity history starts here</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-[var(--theme-text-muted)]">
            Completed routines, goal check-ins and other recorded progress will appear here.
          </p>
          <Link href="/plan" className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-[var(--theme-border)] bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">Explore Plan</Link>
        </GlassCard>
      )}
      {!loading && history.length > 0 && filtered.length === 0 && (
        <GlassCard padding="lg" className="text-center py-8">
          <p className="text-sm font-semibold text-white">No activity matches this filter</p>
          <p className="mt-1 text-xs text-[var(--theme-text-muted)]">Try a different category or view all activity.</p>
          <button type="button" onClick={() => setFilterType(null)} className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-[var(--theme-border)] bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">Show all activity</button>
        </GlassCard>
      )}

      <div className="space-y-6">{Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0])).map(([date, items]) => <section key={date}><div className="flex items-center gap-2 mb-3"><Calendar className="w-4 h-4 text-[var(--theme-text-muted)]" /><h3 className="text-sm font-semibold text-white">{new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</h3><span className="text-[10px] text-[var(--theme-text-muted)]">{(items as any[]).length} event{(items as any[]).length === 1 ? '' : 's'}</span></div><div className="space-y-2">{(items as any[]).map((item: any) => { const outcome = taskOutcome(item); return <GlassCard key={item.id} padding="sm"><div className="flex items-center gap-3"><span className="text-[var(--theme-primary)]">{entityIcons[item.entity_type] || <CheckCircle2 className="w-4 h-4" />}</span><div className="flex-1 min-w-0"><p className="text-sm text-white truncate">{item.metadata_json?.title || item.type?.replaceAll('_',' ')}</p><p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">{item.entity_type}</p></div>{outcome && <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold', outcome.tone)}>{outcome.icon}{outcome.label}</span>}<span className="hidden sm:block text-[10px] text-[var(--theme-text-muted)]">{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div></GlassCard>; })}</div></section>)}</div>
    </div>
  );
}
