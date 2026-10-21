'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Clock, Loader2, Plus, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';
import { DomainInsightCard } from '@/components/ai/domain-insight-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AssignmentEditor } from '@/components/assignments/assignment-editor';
import { fetcher, patch } from '@/lib/api';
import { AssignmentList, AssignmentRow, assignmentDate } from '@/lib/assignments';
import { cn } from '@/lib/utils';

const labels = {
  overdue: 'Ready to pick back up',
  due_today: 'Due today',
  due_soon: 'Due soon',
  upcoming: 'Upcoming',
  completed_on_time: 'Completed on time',
  finished_late: 'Finished Late',
  completion_unknown: 'Finished · time unavailable',
};
const priorityColors = {
  low: 'border-l-slate-400',
  medium: 'border-l-cyan-400',
  high: 'border-l-orange-300',
  urgent: 'border-l-amber-300',
};
const filterClass =
  '[color-scheme:dark] min-h-10 min-w-0 rounded-lg border border-white/20 bg-slate-950/40 px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300';
export default function AssignmentsPage() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<AssignmentList | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<AssignmentRow | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [channels, setChannels] = useState<string[]>(['push']);
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    priority: '',
    state: 'active',
    from: '',
    to: '',
    sort: 'asc',
    page: 0,
  });
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(async () => {
    setRefresh((n) => n + 1);
    window.dispatchEvent(new Event('crystrack-activity-updated'));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await fetcher(
          '/api/assignments?' +
            new URLSearchParams(
              Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, String(value)])),
            ),
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) setData(result);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'We could not load assignments.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filters, refresh]);
  useEffect(() => {
    fetcher('/api/preferences')
      .then((prefs) => {
        const valid = (prefs.default_reminder_channels || []).filter((c: string) =>
          ['push', 'telegram'].includes(c),
        );
        if (valid.length) setChannels(valid);
      })
      .catch(() => null);
    const update = () => setRefresh((n) => n + 1);
    window.addEventListener('focus', update);
    const timer = setInterval(update, 60000);
    return () => {
      window.removeEventListener('focus', update);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (searchParams.get('create') === 'assignment') queueMicrotask(() => setEditor('new'));
  }, [searchParams]);
  const change = (key: string, value: string) => {
    setError('');
    setFilters((old) => ({ ...old, [key]: value, page: 0 }));
  };
  const complete = async (assignment: AssignmentRow) => {
    setBusy(assignment.id);
    setError('');
    setNotice('');
    try {
      await patch(`/api/assignments/${assignment.id}/complete`, { revision: assignment.revision });
      setNotice(
        'Finished and recorded. Your effort counts, whenever you finish. Find it in Finished history.',
      );
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Completion was not confirmed. Refresh before trying again.');
      await reload();
    } finally {
      setBusy(null);
    }
  };
  const remove = async (assignment: AssignmentRow) => {
    if (
      !window.confirm(
        `Delete "${assignment.title}" permanently? This removes its assignment history and reminders and reverses any earned 30 shards. This cannot be undone.`,
      )
    )
      return;
    setBusy(assignment.id);
    setError('');
    try {
      await fetcher(`/api/assignments/${assignment.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ revision: assignment.revision }),
      });
      setNotice('Assignment removed, with its reminders, activity and any earned shards reconciled.');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deletion was not confirmed. Refresh before trying again.');
      await reload();
    } finally {
      setBusy(null);
    }
  };
  const zone = data?.timezone;
  return (
    <div className="space-y-6">
      <div className="scenic-readable-copy flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-primary)]">
            Plan · Deadlines
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">Assignments</h1>
          <p className="mt-1 text-sm text-white/90">Make room for learning, one deadline at a time.</p>
        </div>
        <Button variant="primary" disabled={!zone} onClick={() => setEditor('new')}>
          <Plus className="mr-1.5 h-4 w-4" />
          New assignment
        </Button>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300/30 bg-slate-950/70 px-4 py-3 text-sm text-amber-100"
        >
          {error}
          <button
            className="ml-2 min-h-10 underline"
            onClick={() => {
              setError('');
              void reload();
            }}
          >
            Refresh assignments
          </button>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-cyan-300/20 bg-slate-950/60 px-4 py-3 text-sm text-cyan-100"
        >
          {notice}
        </p>
      )}
      <DomainInsightCard domain="assignments" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['overdue', 'due_today', 'due_soon', 'upcoming'] as const).map((state) => (
          <GlassCard key={state} padding="sm" className="text-center">
            <div className="text-2xl font-bold tabular-nums text-cyan-200">
              {data ? data.counts[state] || 0 : '—'}
            </div>
            <div className="mt-1 text-xs font-medium text-slate-200">
              {state === 'overdue' ? 'Open past deadline' : labels[state]}
            </div>
          </GlassCard>
        ))}
      </div>
      <GlassCard padding="md">
        <h2 className="text-base font-semibold text-white">Next seven days</h2>
        <p className="mt-1 text-sm text-slate-200">
          {data
            ? `${data.week.reduce((sum, day) => sum + day.count, 0)} upcoming deadlines`
            : 'Loading deadlines…'}{' '}
          · {zone || 'Saved timezone loading'}. Counts are assignments, not estimated hours.
        </p>
        <ol className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7" aria-label="Seven-day academic deadlines">
          {data?.week.map((day) => (
            <li key={day.day} className="rounded-lg border border-white/10 bg-black/20 p-2 text-center">
              <span className="block text-xs text-slate-200">
                {new Intl.DateTimeFormat('en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                  timeZone: 'UTC',
                }).format(new Date(day.day + 'T12:00:00Z'))}
              </span>
              <span className="text-lg font-semibold tabular-nums text-cyan-200">{day.count}</span>
            </li>
          ))}
        </ol>
      </GlassCard>
      <GlassCard padding="md">
        <div className="flex flex-wrap gap-2" aria-label="Assignment views">
          {[
            ['active', 'Open assignments'],
            ['overdue', 'Past deadline'],
            ['completed', 'Finished history'],
            ['all', 'All assignments'],
          ].map(([state, label]) => (
            <Button
              key={state}
              variant={filters.state === state ? 'primary' : 'ghost'}
              aria-pressed={filters.state === state}
              onClick={() => change('state', state)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-slate-200">
            Search
            <input
              aria-label="Search assignments"
              type="search"
              maxLength={200}
              value={filters.search}
              onChange={(e) => change('search', e.target.value)}
              className={cn(filterClass, 'mt-1 w-full')}
            />
          </label>
          <label className="text-xs text-slate-200">
            Subject / category
            <input
              maxLength={100}
              value={filters.category}
              onChange={(e) => change('category', e.target.value)}
              className={cn(filterClass, 'mt-1 w-full')}
            />
          </label>
          <label className="text-xs text-slate-200">
            Priority
            <select
              value={filters.priority}
              onChange={(e) => change('priority', e.target.value)}
              className={cn(filterClass, 'mt-1 w-full')}
            >
              <option value="">All priorities</option>
              {['low', 'medium', 'high', 'urgent'].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-200">
            State
            <select
              value={filters.state}
              onChange={(e) => change('state', e.target.value)}
              className={cn(filterClass, 'mt-1 w-full')}
            >
              <option value="active">Open</option>
              <option value="completed">Finished</option>
              <option value="all">All</option>
              {Object.entries(labels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-200">
            Deadline from
            <input
              type="date"
              value={filters.from}
              onChange={(e) => change('from', e.target.value)}
              className={cn(filterClass, 'mt-1 w-full')}
            />
          </label>
          <label className="text-xs text-slate-200">
            Deadline through
            <input
              type="date"
              value={filters.to}
              onChange={(e) => change('to', e.target.value)}
              className={cn(filterClass, 'mt-1 w-full')}
            />
          </label>
          <label className="text-xs text-slate-200">
            Deadline order
            <select
              value={filters.sort}
              onChange={(e) => change('sort', e.target.value)}
              className={cn(filterClass, 'mt-1 w-full')}
            >
              <option value="asc">Earliest first</option>
              <option value="desc">Latest first</option>
            </select>
          </label>
          <Button
            variant="ghost"
            onClick={() =>
              setFilters({
                search: '',
                category: '',
                priority: '',
                state: 'active',
                from: '',
                to: '',
                sort: 'asc',
                page: 0,
              })
            }
          >
            Clear filters
          </Button>
        </div>
      </GlassCard>
      {loading && (
        <p role="status" className="flex justify-center gap-2 py-4 text-sm text-white">
          <Loader2 className="h-5 w-5 animate-spin" />
          Updating assignments…
        </p>
      )}
      <div className="space-y-3" aria-busy={loading}>
        {data?.items.map((assignment) => {
          const overdue = assignment.computed_status === 'overdue';
          const finished = assignment.status === 'completed';
          return (
            <GlassCard
              key={assignment.id}
              padding="md"
              className={cn('border-l-4', priorityColors[assignment.priority])}
            >
              <article aria-label={assignment.title} className="flex flex-wrap items-start gap-3">
                {!finished && !overdue && (
                  <Checkbox
                    aria-label={`Complete ${assignment.title}`}
                    disabled={Boolean(busy)}
                    onCheckedChange={() => void complete(assignment)}
                    className="mt-1 h-10 w-10 shrink-0 border-white/40"
                  />
                )}
                {finished && (
                  <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-300" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1 basis-[200px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="break-words text-base font-semibold text-white">{assignment.title}</h2>
                    <span
                      className={cn(
                        'rounded-full border px-2 py-1 text-xs font-semibold',
                        overdue
                          ? 'border-amber-300/30 bg-black/30 text-amber-100'
                          : finished
                            ? 'border-emerald-300/30 bg-black/30 text-emerald-100'
                            : 'border-cyan-300/20 bg-black/30 text-cyan-100',
                      )}
                    >
                      {labels[assignment.computed_status]}
                    </span>
                    <StatusBadge status={assignment.priority} className="bg-slate-950/60 text-slate-100" />
                  </div>
                  {assignment.description && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200">
                      {assignment.description}
                    </p>
                  )}
                  <p className="mt-3 text-xs leading-relaxed text-slate-200">
                    <Clock className="mr-1 inline h-3.5 w-3.5" />
                    Deadline:{' '}
                    <time dateTime={assignment.deadline}>
                      {assignmentDate(assignment.deadline, zone!)}
                    </time> · {zone}
                  </p>
                  {assignment.completed_at && (
                    <p className="mt-1 text-xs text-emerald-100">
                      Finished:{' '}
                      <time dateTime={assignment.completed_at}>
                        {assignmentDate(assignment.completed_at, zone!)}
                      </time>{' '}
                      · {zone}
                    </p>
                  )}
                  {overdue && (
                    <p className="mt-2 text-sm text-amber-100">
                      Ready to finish when you are. Your effort still counts.
                    </p>
                  )}
                  {assignment.category && (
                    <span className="mt-2 inline-block max-w-full break-words rounded-full border border-white/15 bg-black/20 px-2 py-1 text-xs text-slate-200">
                      {assignment.category}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {overdue && (
                    <Button
                      variant="primary"
                      disabled={Boolean(busy)}
                      onClick={() => void complete(assignment)}
                      aria-label={`Finish Late: ${assignment.title}`}
                    >
                      Finish Late
                    </Button>
                  )}
                  {!finished && (
                    <Button
                      variant="ghost"
                      disabled={Boolean(busy)}
                      aria-label={`Edit ${assignment.title}`}
                      onClick={() => setEditor(assignment)}
                    >
                      <Pencil className="h-4 w-4" />
                      <span className="ml-1.5">Edit</span>
                    </Button>
                  )}
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void remove(assignment)}
                    aria-label={`Delete ${assignment.title} permanently`}
                    title="Delete assignment permanently"
                    className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-white/15 bg-black/20 px-3 text-sm text-slate-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            </GlassCard>
          );
        })}
        {!loading && data?.items.length === 0 && (
          <GlassCard padding="lg" className="text-center">
            <h2 className="text-base font-semibold text-white">No assignments in this view.</h2>
            <p className="mt-2 text-sm text-slate-200">Try another filter, or add what is coming next.</p>
          </GlassCard>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 scenic-readable-copy">
        <Button
          variant="ghost"
          disabled={loading || filters.page === 0}
          onClick={() => setFilters((old) => ({ ...old, page: old.page - 1 }))}
        >
          Previous
        </Button>
        <span className="text-sm text-white">Page {filters.page + 1}</span>
        <Button
          variant="ghost"
          disabled={loading || !data?.hasMore}
          onClick={() => setFilters((old) => ({ ...old, page: old.page + 1 }))}
        >
          Next
        </Button>
      </div>
      {editor && zone && (
        <AssignmentEditor
          assignment={editor === 'new' ? null : editor}
          timezone={zone}
          defaultChannels={channels}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setError('');
            await reload();
          }}
        />
      )}
    </div>
  );
}
