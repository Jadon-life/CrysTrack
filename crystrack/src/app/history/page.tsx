'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Calendar, CheckCircle2, ChevronDown, CircleSlash2, ClipboardList, Filter, Loader2, Target, Wallet, XCircle } from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';
import { fetcher } from '@/lib/api';
import { cn } from '@/lib/utils';
import { groupHistoryByMonth, type HistoryEvent } from '@/lib/history-timeline';

const entityIcons: Record<string, React.ReactNode> = {
  task: <CheckCircle2 className="h-4 w-4" />,
  goal: <Target className="h-4 w-4" />,
  assignment: <ClipboardList className="h-4 w-4" />,
  finance: <Wallet className="h-4 w-4" />,
};

type Category = 'task' | 'goal' | 'assignment' | 'finance';
type PageResult = { items: HistoryEvent[]; hasMore: boolean; nextPage: number };
const categories: Category[] = ['task', 'goal', 'assignment', 'finance'];

function taskOutcome(item: HistoryEvent) {
  if (item.type === 'task_completed') return { label: 'Completed', icon: <CheckCircle2 className="h-3.5 w-3.5" />, tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' };
  if (item.type === 'task_missed') return { label: 'Missed', icon: <XCircle className="h-3.5 w-3.5" />, tone: 'text-red-300 bg-red-500/10 border-red-500/20' };
  if (item.type === 'task_skipped') return { label: 'Skipped', icon: <CircleSlash2 className="h-3.5 w-3.5" />, tone: 'text-amber-300 bg-amber-500/10 border-amber-500/20' };
  return null;
}

function formatRecordedTime(date: Date, timezone: string): string {
  try {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: timezone });
  } catch {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  }
}

function historyUrl(page: number, filter: Category | null) {
  return '/api/history?page=' + page + (filter ? '&type=' + encodeURIComponent(filter) : '');
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [filterType, setFilterType] = useState<Category | null>(null);
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextPage, setNextPage] = useState(1);
  const [error, setError] = useState('');
  const versionRef = useRef(0);

  useEffect(() => {
    let active = true;
    void fetcher('/api/profile')
      .then((profile) => {
        if (active && typeof profile?.timezone === 'string' && profile.timezone) setTimezone(profile.timezone);
      })
      .catch(() => null);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const version = ++versionRef.current;
    // Defer reset until after the effect; React's lint rule disallows
    // synchronous state cascades within effects.
    queueMicrotask(() => {
      if (version !== versionRef.current) return;
      setLoading(true);
      setLoadingMore(false);
      setHistory([]);
      setHasMore(false);
      setNextPage(1);
      setError('');
    });
    void fetcher(historyUrl(0, filterType))
      .then((result: PageResult) => {
        if (version !== versionRef.current) return;
        if (!Array.isArray(result?.items)) throw new Error('History response was incomplete');
        setHistory(result.items);
        setHasMore(Boolean(result.hasMore));
        setNextPage(result.nextPage);
      })
      .catch((reason: unknown) => {
        if (version === versionRef.current) setError(reason instanceof Error ? reason.message : 'Could not load history.');
      })
      .finally(() => {
        if (version === versionRef.current) setLoading(false);
      });
    return () => { if (version === versionRef.current) versionRef.current += 1; };
  }, [filterType]);

  const months = useMemo(() => groupHistoryByMonth(history, timezone), [history, timezone]);

  const loadOlder = async () => {
    if (loading || loadingMore || !hasMore) return;
    const version = versionRef.current;
    setLoadingMore(true);
    setError('');
    try {
      const result: PageResult = await fetcher(historyUrl(nextPage, filterType));
      if (version !== versionRef.current) return;
      if (!Array.isArray(result?.items)) throw new Error('History response was incomplete');
      setHistory((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...result.items.filter((item) => !known.has(item.id))];
      });
      setHasMore(Boolean(result.hasMore));
      setNextPage(result.nextPage);
    } catch (reason) {
      if (version === versionRef.current) setError(reason instanceof Error ? reason.message : 'Could not load older activity.');
    } finally {
      if (version === versionRef.current) setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="scenic-readable-strip max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-primary)]">Insights · Record</p>
        <h1 className="mt-1 text-2xl font-bold text-white">History</h1>
        <p className="mt-1 text-sm text-white/85">Open a month, then a day, to see your recorded activities.</p>
      </header>

      <GlassCard padding="sm">
        <div className="mb-3 flex items-center gap-2">
          <Filter className="h-4 w-4 text-[var(--theme-text-muted)]" aria-hidden="true" />
          <span className="text-sm font-medium text-white">Filter activity</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={filterType === null} onClick={() => setFilterType(null)}
            className={cn('min-h-10 rounded-full border px-3 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300', !filterType ? 'border-white/20 bg-white/10 text-white' : 'border-white/10 text-[var(--theme-text-muted)] hover:bg-white/5')}>All</button>
          {categories.map((category) => (
            <button key={category} type="button" aria-pressed={filterType === category}
              onClick={() => setFilterType(filterType === category ? null : category)}
              className={cn('min-h-10 rounded-full border px-3 py-1.5 text-xs capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300', filterType === category ? 'border-[var(--theme-border)] bg-white/10 text-white' : 'border-white/10 text-[var(--theme-text-muted)] hover:bg-white/5')}>{category}</button>
          ))}
        </div>
      </GlassCard>

      {loading && <div className="flex justify-center py-12" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--theme-primary)]" aria-hidden="true" />
        <span className="sr-only">Loading history</span>
      </div>}

      {!loading && error && <div role="alert" className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      {!loading && history.length === 0 && !error && (
        <GlassCard padding="lg" className="py-8 text-center">
          <Calendar className="mx-auto mb-3 h-8 w-8 text-[var(--theme-primary)]" aria-hidden="true" />
          <p className="text-base font-semibold text-white">
            {filterType ? 'No activity in this category' : 'Your activity history starts here'}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-[var(--theme-text-muted)]">
            {filterType ? 'Choose another category or show all records.' : 'Completed routines, goal check-ins and other recorded progress will appear here.'}
          </p>
          {filterType ? (
            <button type="button" onClick={() => setFilterType(null)} className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-[var(--theme-border)] bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">Show all activity</button>
          ) : (
            <Link href="/plan" className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-[var(--theme-border)] bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">Explore Plan</Link>
          )}
        </GlassCard>
      )}

      {!loading && months.length > 0 && (
        <section aria-label="Activity grouped by month and day" className="space-y-3">
          <p className="px-1 text-xs text-[var(--theme-text-muted)]">
            {history.length} activit{history.length === 1 ? 'y' : 'ies'} loaded · Open a month, then a day
          </p>
          {months.map((month) => (
            <details key={month.key} className="history-accordion overflow-hidden rounded-[22px] border border-[var(--theme-border)] bg-black/20 backdrop-blur-lg">
              <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-4 text-white transition-colors hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 [&::-webkit-details-marker]:hidden">
                <Calendar className="h-5 w-5 shrink-0 text-[var(--theme-primary)]" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{month.label}</span>
                  <span className="mt-0.5 block text-xs text-[var(--theme-text-muted)]">
                    {month.days.length} day{month.days.length === 1 ? '' : 's'} · {month.count} activit{month.count === 1 ? 'y' : 'ies'} shown
                  </span>
                </span>
                <ChevronDown className="history-chevron h-4 w-4 shrink-0 text-[var(--theme-text-muted)]" aria-hidden="true" />
              </summary>
              <div className="space-y-2 border-t border-white/10 p-2 sm:p-3">
                {month.days.map((day) => (
                  <details key={day.key} className="history-accordion overflow-hidden rounded-xl border border-white/10 bg-black/15">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3 py-3 text-white transition-colors hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 flex-1 text-sm font-medium">{day.label}</span>
                      <span className="shrink-0 text-xs text-[var(--theme-text-muted)]">{day.items.length} event{day.items.length === 1 ? '' : 's'}</span>
                      <ChevronDown className="history-chevron h-4 w-4 shrink-0 text-[var(--theme-text-muted)]" aria-hidden="true" />
                    </summary>
                    <div className="space-y-2 border-t border-white/10 p-2 sm:p-3">
                      {day.items.map((item) => {
                        const outcome = taskOutcome(item);
                        const time = new Date(item.created_at);
                        return (
                          <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.08] bg-black/10 p-3 sm:flex-nowrap">
                            <span className="shrink-0 text-[var(--theme-primary)]" aria-hidden="true">
                              {entityIcons[item.entity_type] || <CheckCircle2 className="h-4 w-4" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-sm font-medium text-white">
                                {item.metadata_json?.title || item.type?.replaceAll('_', ' ') || 'Activity'}
                              </p>
                              <p className="mt-0.5 text-xs capitalize text-[var(--theme-text-muted)]">
                                {item.entity_type}
                                {!Number.isNaN(time.getTime()) && ' · Recorded ' + formatRecordedTime(time, timezone)}
                              </p>
                            </div>
                            {outcome && (
                              <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold', outcome.tone)}>
                                {outcome.icon}{outcome.label}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
          {hasMore && (
            <button type="button" disabled={loadingMore} onClick={() => void loadOlder()}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--theme-border)] bg-white/[0.06] px-4 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-wait disabled:opacity-60">
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {loadingMore ? 'Loading older activity...' : 'Load older activity'}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
