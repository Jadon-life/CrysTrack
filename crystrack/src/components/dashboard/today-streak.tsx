'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Circle, Minus, RefreshCw, Sparkles } from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';
import { fetcher } from '@/lib/api';
import { latestDailyRead, loadTodayStreak, nextDailyBoundary, type TodayStreakView } from '@/lib/today-streak';
import { streakLocalDay } from '@/lib/daily-streak';
import { isRestrictedPreview } from '@/lib/preview/mode';

const tones = {
  success: 'border-cyan-300/40 bg-cyan-400/15 text-cyan-100',
  incomplete: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  neutral: 'border-white/20 bg-white/5 text-white/75',
  unknown: 'border-dashed border-white/20 bg-black/10 text-white/60',
  today: 'border-[var(--theme-primary)] bg-sky-400/15 text-sky-100 ring-1 ring-sky-300/20',
};

export function TodayStreak() {
  const [view, setView] = useState<TodayStreakView | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const refreshRef = useRef<() => void>(() => {});
  useEffect(() => {
    const reads = latestDailyRead();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous: TodayStreakView['context'] | undefined;
    const refresh = async () => {
      const request = reads.start();
      setBusy(true);
      setView(null); // Never display stale success while verifying a mutation.
      clearTimeout(timer);
      try {
        const next = await loadTodayStreak(url => fetcher(url, { signal: request.signal, cache: 'no-store' }));
        if (!request.isCurrent()) return;
        if (previous && (previous.day !== next.context.day || previous.timezone !== next.context.timezone)) {
          window.dispatchEvent(new Event('crystrack-daily-boundary'));
        }
        previous = next.context;
        setView(next); setFailed(false);
        if (!isRestrictedPreview()) timer = setTimeout(() => void refresh(), nextDailyBoundary(next.context.timezone));
      } catch {
        if (!request.isCurrent()) return;
        setView(null); setFailed(true); // No API bodies or user data in logs.
      } finally { if (request.isCurrent()) setBusy(false); }
    };
    const onReturn = () => {
      if (document.visibilityState === 'hidden' || isRestrictedPreview()) return;
      if (!previous || streakLocalDay(new Date(), previous.timezone) !== previous.day) void refresh();
    };
    refreshRef.current = () => void refresh();
    window.addEventListener('crystrack-activity-updated', refreshRef.current);
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    void refresh();
    return () => {
      reads.cancel(); clearTimeout(timer);
      window.removeEventListener('crystrack-activity-updated', refreshRef.current);
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, []);

  return <GlassCard padding="md" className="min-w-0" as="section">
    <div data-testid="today-streak" aria-busy={busy}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Sparkles aria-hidden="true" className="h-4 w-4 text-[var(--theme-primary)]" /> Daily streak</h2>
          <p className="mt-1 text-xs text-[var(--theme-text-muted)]">Every scheduled routine, one day at a time.</p>
        </div>
        <button type="button" aria-label="Refresh verified daily history" onClick={() => refreshRef.current()}
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-[var(--theme-primary)] hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <div role="status" aria-live="polite" className="mt-3">
        {busy ? <p className="text-sm text-white/80">Checking verified daily history…</p> : !view ?
          <p className="text-sm text-white/80">History not yet verified. {failed ? 'Try refreshing when you’re ready.' : ''}</p> :
          <div className="flex flex-wrap gap-x-8 gap-y-2 tabular-nums">
            <div><p className="text-xs text-[var(--theme-text-muted)]">Current closed-day streak</p><p className="mt-1 text-xl font-semibold text-white">{view.currentLabel}</p></div>
            <div><p className="text-xs text-[var(--theme-text-muted)]">Best observed · this 7-day window</p><p className="mt-1 text-xl font-semibold text-cyan-200">{view.bestLabel}</p></div>
          </div>}
      </div>
      {busy && <div aria-hidden="true" className="mt-4">
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">{Array.from({length: 7}, (_, index) => <div key={index} className="h-20 rounded-xl border border-white/10 bg-white/5" />)}</div>
        <div className="mt-3 h-14 rounded-xl bg-white/[0.03]" />
      </div>}
      {view && <>
        <ol aria-label={`Seven days ending ${view.context.day}, scheduling timezone ${view.context.timezone}`} className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2">
          {view.days.map(day => <li key={day.date} aria-label={`${day.date}: ${day.label}`} aria-current={day.state === 'today' ? 'date' : undefined}
            className={`min-w-0 rounded-xl border px-1 py-2 text-center tabular-nums ${tones[day.state]}`}>
            <span aria-hidden="true" className="block text-xs">{new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day.date}T12:00:00Z`))}</span>
            <span aria-hidden="true" className="my-1 flex h-5 items-center justify-center">{day.state === 'success' ? <Check className="h-4 w-4" /> : day.state === 'neutral' ? <Minus className="h-4 w-4" /> : day.state === 'unknown' ? '?' : day.state === 'incomplete' ? '◔' : <Circle className="h-4 w-4" />}</span>
            <span aria-hidden="true" className="block text-xs">{day.state === 'today' ? 'Today' : Number(day.date.slice(-2))}</span>
          </li>)}
        </ol>
        <p className="mt-3 text-xs leading-relaxed text-[var(--theme-text-muted)]">{view.days[6].label}. Today stays open until midnight in {view.context.timezone}.</p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--theme-text-muted)]">✓ Completed · ◔ Incomplete · − No tasks (neutral) · ? Unverified. Unverified history never earns a day; the observed best is a lower bound, not a lifetime record.</p>
      </>}
    </div>
  </GlassCard>;
}
