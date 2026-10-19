'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GlassCard } from '@/components/shared/glass-card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/layout/auth-provider';
import { isRestrictedPreview } from '@/lib/preview/mode';
import { latestDailyRead, nextDailyBoundary, stepDailyKey } from '@/lib/today-streak';
import {
  weekGridSchema,
  weekDate,
  weekDayLabel,
  weekStateLabels,
  type WeekGridView,
  type WeekCell,
} from '@/lib/week-grid';
import { cn } from '@/lib/utils';

const firstPage = () => ({
  after: null as string | null,
  previous: [] as (string | null)[],
  revision: null as string | null,
});
interface Intent {
  owner: string;
  id: string;
  day: string;
  desiredStatus: 'pending' | 'completed' | 'skipped';
  expectedRevision: number;
  requestId: string;
}
const tones = {
  completed: 'border-cyan-300/30 bg-cyan-400/10 text-cyan-100',
  skipped: 'border-slate-300/20 bg-white/5 text-slate-100',
  missed: 'border-amber-200/25 bg-amber-200/5 text-amber-100',
  pending: 'border-sky-200/25 bg-sky-300/5 text-sky-100',
  planned: 'border-dashed border-sky-200/25 bg-sky-300/5 text-sky-100',
  not_scheduled: 'border-transparent text-slate-200',
  unverified: 'border-dashed border-white/25 text-slate-100',
};
const actionClass =
  'inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-cyan-200/25 bg-slate-950/60 px-2 text-xs font-medium text-cyan-100 hover:bg-cyan-400/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:opacity-50';

export function TaskWeekGrid({ onChange }: { onChange: () => Promise<void> }) {
  const { user } = useAuth();
  if (!user)
    return (
      <GlassCard padding="md">
        <p className="text-sm text-white">Checking your workspace…</p>
      </GlassCard>
    );
  return <OwnerWeekGrid key={user.id} owner={user.id} onChange={onChange} />;
}

function OwnerWeekGrid({ owner, onChange }: { owner: string; onChange: () => Promise<void> }) {
  const ownerRef = useRef(owner);
  useEffect(() => {
    ownerRef.current = owner;
    return () => {
      ownerRef.current = '';
    };
  }, [owner]);
  const [anchor, setAnchor] = useState<string | null>(null),
    [filter, setFilter] = useState('all'),
    [position, setPosition] = useState(firstPage);
  const [owned, setOwned] = useState<{ owner: string; key: string; data: WeekGridView } | null>(null);
  const [busy, setBusy] = useState(true),
    [writing, setWriting] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [uncertain, setUncertain] = useState<Intent | null>(null);
  const writeLock = useRef(false);
  const reads = useRef(latestDailyRead());
  const boundary = useRef<WeekGridView['context'] | null>(null);
  const focusTarget = useRef<string | null>(null);
  const key = JSON.stringify([owner, anchor, filter, position]);
  const view = owned?.owner === owner && owned.key === key ? owned.data : null;
  const pending = uncertain?.owner === owner ? uncertain : null;
  const refresh = useCallback(() => {
    setBusy(true);
    setOwned(null);
    setPosition(firstPage());
  }, []);
  useEffect(() => {
    if (!owner) return;
    const readSession = reads.current;
    const request = readSession.start();
    const query = new URLSearchParams({ filter });
    if (anchor) query.set('from', anchor);
    if (position.after) query.set('after', position.after);
    if (position.revision) query.set('revision', position.revision);
    void (async () => {
      await Promise.resolve();
      if (!request.isCurrent()) return;
      setBusy(true);
      setOwned(null);
      setError('');
      try {
        const response = await fetch('/api/tasks/week?' + query, {
          signal: request.signal,
          cache: 'no-store',
        });
        if (response.status === 409 && position.revision) {
          if (request.isCurrent()) {
            setNotice('Your week changed. We’re refreshing the first page.');
            setPosition(firstPage());
          }
          return;
        }
        if (!response.ok)
          throw new Error(
            'Week records are unavailable. Refresh when you’re ready; no outcomes are assumed.',
          );
        const data = weekGridSchema.parse(await response.json());
        if (!request.isCurrent() || ownerRef.current !== owner) return;
        if (
          boundary.current &&
          (boundary.current.day !== data.context.day || boundary.current.timezone !== data.context.timezone)
        )
          void onChange();
        boundary.current = data.context;
        setOwned({ owner, key, data });
      } catch (e) {
        if (request.isCurrent()) {
          setOwned(null);
          setError(
            e instanceof Error && e.message.startsWith('Week records')
              ? e.message
              : 'Week evidence could not be verified. Please refresh.',
          );
        }
      } finally {
        if (request.isCurrent()) setBusy(false);
      }
    })();
    return () => {
      readSession.cancel();
    };
  }, [owner, anchor, filter, position, key, onChange]);
  useEffect(() => {
    const update = () => {
      if (!isRestrictedPreview() && document.visibilityState !== 'hidden') refresh();
    };
    window.addEventListener('crystrack-activity-updated', refresh);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('crystrack-activity-updated', refresh);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [refresh]);
  useEffect(() => {
    if (!view || isRestrictedPreview()) return;
    const timer = setTimeout(refresh, nextDailyBoundary(view.context.timezone));
    return () => clearTimeout(timer);
  }, [view, refresh]);
  useEffect(() => {
    if (busy || writing || !focusTarget.current) return;
    const wanted = document.getElementById(focusTarget.current) as HTMLButtonElement | null;
    const fallback = document.getElementById(pending ? 'week-retry' : 'week-refresh');
    if (wanted && !wanted.disabled) wanted.focus({ preventScroll: true });
    else fallback?.focus({ preventScroll: true });
    focusTarget.current = null;
  }, [view, busy, writing, pending]);
  const submit = async (intent: Intent) => {
    if (writeLock.current || intent.owner !== ownerRef.current || isRestrictedPreview()) return;
    focusTarget.current = `week-action-${intent.id}-${intent.day}`;
    writeLock.current = true;
    setWriting(true);
    setError('');
    setNotice('');
    setOwned(null);
    let ambiguous = true;
    try {
      const action = intent.desiredStatus === 'skipped' ? 'skip' : 'toggle';
      const response = await fetch(`/api/tasks/${intent.id}/occurrences/${intent.day}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          desiredStatus: intent.desiredStatus,
          expectedRevision: intent.expectedRevision,
          requestId: intent.requestId,
        }),
      });
      ambiguous = response.status >= 500;
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'This routine changed or the day closed. Review its refreshed status.'
            : 'The update was not confirmed. Review the refreshed status before continuing.',
        );
      await response.json();
      if (ownerRef.current === intent.owner) {
        setUncertain(null);
        setNotice('Recorded. Today remains open; closed-day streak credit is checked after the day ends.');
      }
    } catch (e) {
      if (ownerRef.current === intent.owner) {
        setUncertain(ambiguous ? intent : null);
        setNotice(
          e instanceof Error ? e.message : 'We could not confirm the update. Review the refreshed status.',
        );
      }
    } finally {
      if (ownerRef.current === intent.owner) {
        writeLock.current = false;
        setWriting(false);
        refresh();
        void onChange();
        window.dispatchEvent(new Event('crystrack-activity-updated'));
      }
    }
  };
  const act = (id: string, cell: WeekCell, desiredStatus: Intent['desiredStatus']) => {
    if (!view || cell.day !== view.context.day || !cell.editable || !cell.revision || pending) return;
    void submit({
      owner,
      id,
      day: cell.day,
      desiredStatus,
      expectedRevision: cell.revision,
      requestId: crypto.randomUUID(),
    });
  };
  const move = (from: string | null, focus = 'week-this') => {
    focusTarget.current = focus;
    setBusy(true);
    setAnchor(from);
    setPosition(firstPage());
    setNotice('');
  };
  return (
    <GlassCard as="section" padding="md" className="min-w-0">
      <div data-testid="task-week-grid" className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Your routine week</h2>
            <p className="mt-1 text-sm text-slate-200">
              Recorded days, today’s work, and editable plans — each kept clear.
            </p>
          </div>
          <Button id="week-refresh" variant="ghost" onClick={refresh} disabled={writing}>
            Refresh week
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            id="week-prev"
            variant="ghost"
            disabled={!view || writing || view.from <= view.minimum || isRestrictedPreview()}
            onClick={() => view && move(stepDailyKey(view.from, -7), 'week-prev')}
          >
            Previous week
          </Button>
          <Button id="week-this" variant="primary" disabled={writing} onClick={() => move(null)}>
            This week
          </Button>
          <Button
            id="week-next"
            variant="ghost"
            disabled={!view || writing || view.from >= view.maximum || isRestrictedPreview()}
            onClick={() => view && move(stepDailyKey(view.from, 7), 'week-next')}
          >
            Next week
          </Button>
          <label className="flex min-h-10 items-center gap-2 text-sm text-white">
            Show
            <select
              id="week-routine-filter"
              aria-label="Routine filter"
              value={filter}
              disabled={writing}
              onChange={(e) => {
                setFilter(e.target.value);
                setPosition(firstPage());
              }}
              className="min-h-10 max-w-full rounded-lg border border-white/20 bg-slate-950/80 px-2 text-sm text-white [color-scheme:dark] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
            >
              <option value="all">All week routines</option>
              <option value="active">Active routines</option>
              <option value="history">Recorded earlier this week</option>
            </select>
          </label>
        </div>
        <p role="status" className="mt-3 text-sm text-slate-100">
          {writing ? 'Recording your choice…' : busy ? 'Checking the authoritative week…' : notice}
        </p>
        {pending && (
          <div className="mt-2 rounded-xl border border-amber-200/30 bg-slate-950/70 p-3 text-sm text-amber-100">
            <p>
              Confirmation was interrupted. Review the refreshed grid, then retry the same request or use the
              status shown.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                id="week-retry"
                variant="ghost"
                disabled={writing || busy}
                onClick={() => void submit(pending)}
              >
                Retry recorded action
              </Button>
              <Button
                variant="ghost"
                disabled={writing || busy || !view}
                onClick={() => {
                  setUncertain(null);
                  setNotice('Ready to continue from the refreshed status.');
                }}
              >
                Use refreshed status
              </Button>
            </div>
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-amber-200/30 bg-slate-950/70 p-3 text-sm text-amber-100"
          >
            {error}
          </p>
        )}
        {view && (
          <>
            <p id="week-scroll-help" className="mt-3 text-xs leading-relaxed text-slate-200">
              Sunday–Saturday · {view.context.timezone}. Scroll across for all seven dates. Past cells need
              verified history; unverified is never a success. Future cells are plans, not outcomes. Only
              today can be changed.
            </p>
            <p className="mt-3 text-sm font-semibold text-white">
              {new Intl.DateTimeFormat('en-GB', {
                timeZone: 'UTC',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }).format(new Date(view.from + 'T12:00:00Z'))}{' '}
              –{' '}
              {new Intl.DateTimeFormat('en-GB', {
                timeZone: 'UTC',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }).format(new Date(view.to + 'T12:00:00Z'))}{' '}
              · {view.context.timezone}
            </p>
            <div
              onFocusCapture={(event) => {
                const target = event.target as HTMLElement;
                const cell = target.closest('td');
                if (!cell) return;
                const region = event.currentTarget;
                const labels = region.querySelector('th[scope="row"]');
                if (!labels) return;
                const edge = region.getBoundingClientRect().left + labels.getBoundingClientRect().width;
                const rect = cell.getBoundingClientRect();
                if (rect.left < edge || rect.right > region.getBoundingClientRect().right)
                  region.scrollLeft += rect.left - edge;
              }}
              role="region"
              tabIndex={0}
              aria-label="Seven-day task outcomes, horizontally scrollable"
              aria-describedby="week-scroll-help"
              className="mt-3 max-h-[32rem] overflow-auto rounded-xl border border-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
            >
              <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-sm tabular-nums">
                <caption className="sr-only">
                  Week of {weekDate(view.from)} to {weekDate(view.to)} · {view.context.timezone}
                </caption>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="sticky left-0 top-0 z-30 w-36 min-w-36 sm:w-44 sm:min-w-44 border-b border-r border-white/15 bg-slate-950 px-3 py-3 text-left font-semibold text-white"
                    >
                      Routine
                    </th>
                    {view.days.map((day) => (
                      <th
                        key={day.day}
                        id={`week-col-${day.day}`}
                        scope="col"
                        aria-current={day.mode === 'today' ? 'date' : undefined}
                        className={cn(
                          'sticky top-0 z-20 min-w-32 border-b border-white/15 bg-slate-950 px-2 py-3 text-center font-medium text-white',
                          day.mode === 'today' && 'bg-slate-900 ring-1 ring-inset ring-cyan-300/60',
                        )}
                      >
                        <time dateTime={day.day} title={weekDate(day.day)}>
                          {new Intl.DateTimeFormat('en-GB', {
                            timeZone: 'UTC',
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          }).format(new Date(day.day + 'T12:00:00Z'))}
                        </time>
                        <span className="mt-1 block text-xs font-normal text-slate-200">
                          {weekDayLabel(day)}
                        </span>
                        {day.timezone !== view.context.timezone && (
                          <span className="block text-xs font-normal text-slate-200">
                            {day.timezone || 'Date unavailable'}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((row) => (
                    <tr key={row.id}>
                      <th
                        id={`week-row-${row.id}`}
                        scope="row"
                        className="sticky left-0 z-10 w-36 min-w-36 sm:w-44 sm:min-w-44 max-w-36 sm:max-w-44 border-b border-r border-white/15 bg-slate-950 p-3 text-left font-medium text-white"
                      >
                        <span className="break-words">{row.title}</span>
                        <span className="mt-1 block text-xs font-normal text-slate-200">
                          {row.active
                            ? 'Active routine'
                            : row.nameSource === 'planned'
                              ? 'Planned definition'
                              : 'Retired / historical'}{' '}
                          ·{' '}
                          {row.nameSource === 'current'
                            ? 'current name'
                            : row.nameSource === 'recorded'
                              ? 'recorded name'
                              : row.nameSource === 'planned'
                                ? 'planned name'
                                : 'name unverified'}
                        </span>
                      </th>
                      {row.cells.map((cell, i) => (
                        <td
                          key={cell.day}
                          headers={`week-row-${row.id} week-col-${cell.day}`}
                          aria-label={`${row.title}, ${weekDate(cell.day)}: ${weekStateLabels[cell.state]}${cell.title && cell.title !== row.title ? `, recorded name ${cell.title}` : ''}, ${view.days[i].timezone || 'timezone date unavailable'}`}
                          className="min-w-32 border-b border-white/15 bg-slate-950/65 p-2 text-center align-top text-white"
                        >
                          <div
                            className={cn(
                              'flex min-h-16 flex-col items-center justify-center rounded-lg border px-2 py-2',
                              tones[cell.state],
                            )}
                          >
                            <span className="text-sm font-medium">{weekStateLabels[cell.state]}</span>
                            {cell.title && cell.title !== row.title && (
                              <span className="mt-1 max-w-32 break-words text-xs">{cell.title}</span>
                            )}
                            {cell.editable && view.days[i].evidence !== 'verified' && (
                              <span className="mt-1 text-xs">Provisional today</span>
                            )}
                            {cell.editable && (
                              <div className="mt-2 flex justify-center gap-1">
                                <button
                                  id={`week-action-${row.id}-${cell.day}`}
                                  type="button"
                                  disabled={busy || writing || Boolean(pending) || isRestrictedPreview()}
                                  className={actionClass}
                                  aria-label={
                                    cell.state === 'completed'
                                      ? `Undo completion for ${row.title} today`
                                      : `Complete ${row.title} today`
                                  }
                                  onClick={() =>
                                    act(row.id, cell, cell.state === 'completed' ? 'pending' : 'completed')
                                  }
                                >
                                  {cell.state === 'completed' ? 'Undo' : 'Done'}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy || writing || Boolean(pending) || isRestrictedPreview()}
                                  className={actionClass}
                                  aria-label={
                                    cell.state === 'skipped'
                                      ? `Undo skip for ${row.title} today`
                                      : `Skip ${row.title} today`
                                  }
                                  onClick={() =>
                                    act(row.id, cell, cell.state === 'skipped' ? 'pending' : 'skipped')
                                  }
                                >
                                  {cell.state === 'skipped' ? 'Undo skip' : 'Skip'}
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {view.rows.length === 0 && (
              <p className="mt-4 text-sm text-white">
                No routines in this view. The day headings still distinguish verified empty days from
                unverified history and future plans.
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <Button
                id="week-prior-page"
                variant="ghost"
                disabled={writing || position.previous.length === 0}
                onClick={() => {
                  focusTarget.current = 'week-prior-page';
                  setBusy(true);
                  const prior = [...position.previous];
                  const after = prior.pop() ?? null;
                  setPosition({ after, previous: prior, revision: view.revision });
                }}
              >
                Previous routines
              </Button>
              <p className="text-xs text-slate-200">
                Page {position.previous.length + 1} · up to 25 routines · 52 past / 8 future weeks
              </p>
              <Button
                id="week-more"
                variant="ghost"
                disabled={writing || !view.nextCursor}
                onClick={() => {
                  focusTarget.current = 'week-more';
                  setBusy(true);
                  setPosition({
                    after: view.nextCursor,
                    previous: [...position.previous, position.after],
                    revision: view.revision,
                  });
                }}
              >
                More routines
              </Button>
            </div>
          </>
        )}
      </div>
    </GlassCard>
  );
}
