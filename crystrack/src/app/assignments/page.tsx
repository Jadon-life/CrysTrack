'use client';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, GraduationCap } from 'lucide-react';
import { AssignmentCard } from '@/components/assignments/assignment-card';
import { AssignmentEditor } from '@/components/assignments/assignment-editor';
import { AssignmentCalendar } from '@/components/assignments/assignment-calendar';
import { GoalAtmosphere } from '@/components/goals/goal-atmosphere';
import { DomainInsightCard } from '@/components/ai/domain-insight-card';
import { useTheme } from '@/components/layout/theme-provider';
import { goalThemeTokens } from '@/lib/theme';
import { dateKeyForInstant } from '@/lib/reminders';
import { localDateTimeValue, shiftAcademicDay } from '@/lib/assignments/time';
import { del, fetcher, patch } from '@/lib/api';
import type { AcademicAssignment } from '@/types/assignments';
export default function AssignmentsPage() {
  const search = useSearchParams(),
    { environment, reducedMotion } = useTheme();
  const [items, setItems] = useState<AcademicAssignment[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [timezone, setTimezone] = useState<string | null>(null),
    [channels, setChannels] = useState<('push' | 'telegram')[]>(['push']);
  const [editor, setEditor] = useState<{
      item: AcademicAssignment | null;
    } | null>(null),
    [view, setView] = useState('list'),
    [stage, setStage] = useState('open'),
    [course, setCourse] = useState('all'),
    [priority, setPriority] = useState('all'),
    [sort, setSort] = useState('earliest');
  const [week, setWeek] = useState(''),
    [selected, setSelected] = useState(''),
    [busy, setBusy] = useState<string | null>(null),
    lock = useRef(false);
  const [notice, setNotice] = useState(''),
    [burst, setBurst] = useState(0);
  const [undo, setUndo] = useState<{
    id: string;
    revision: number;
    deadline?: string;
    status?: 'active';
  } | null>(null);
  const loadSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const [assignments, profile, prefs] = await Promise.all([
        fetcher('/api/assignments?status=all'),
        fetcher('/api/profile'),
        fetcher('/api/preferences').catch(() => ({
          default_reminder_channels: ['push'],
        })),
      ]);
      if (sequence !== loadSequence.current) return;
      const zone = profile.current_timezone || profile.timezone || 'UTC';
      setTimezone(zone);
      setWeek((current) => current || dateKeyForInstant(new Date(), zone));
      setItems(assignments);
      const saved = (prefs.default_reminder_channels || ['push']).filter(
        (c: string) => c === 'push' || c === 'telegram',
      );
      setChannels(saved.length ? saved : ['push']);
      setError('');
    } catch (e) {
      if (sequence === loadSequence.current)
        setError(
          e instanceof Error
            ? e.message
            : 'Your coursework could not load. Try again.',
        );
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void load());
    const refresh = () => {
      if (!document.hidden) void load();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('crystrack-activity-updated', refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('crystrack-activity-updated', refresh);
      clearInterval(timer);
    };
  }, [load]);
  useEffect(() => {
    if (search.get('create') === 'assignment' && timezone)
      queueMicrotask(() => setEditor({ item: null }));
  }, [search, timezone]);
  const courses = useMemo(
    () =>
      [
        ...new Set(
          items
            .map((i) => i.course_code)
            .filter((v): v is string => Boolean(v)),
        ),
      ].sort(),
    [items],
  );
  const filtered = useMemo(
    () =>
      items
        .filter(
          (i) =>
            (stage === 'open'
              ? !['completed', 'dropped'].includes(i.status)
              : i.status === stage) &&
            (course === 'all' ||
              (course === 'none'
                ? !i.course_code
                : i.course_code === course)) &&
            (priority === 'all' || i.priority === priority),
        )
        .sort(
          (a, b) =>
            (sort === 'earliest' ? 1 : -1) *
            (Date.parse(a.deadline) - Date.parse(b.deadline)),
        ),
    [items, stage, course, priority, sort],
  );
  const overdue = filtered.filter((i) => i.computed_status === 'overdue'),
    activeOverdue = overdue.find((i) => i.id === selected) || overdue[0];
  const publish = (item: AcademicAssignment) => {
    setItems((current) => {
      const found = current.some((i) => i.id === item.id);
      return found
        ? current.map((i) => (i.id === item.id ? item : i))
        : [item, ...current];
    });
    window.dispatchEvent(
      new CustomEvent('crystrack-activity-updated', {
        detail: { source: 'assignments' },
      }),
    );
  };
  const run = async (
    item: AcademicAssignment,
    operation: () => Promise<AcademicAssignment>,
    message: string,
    celebrate = false,
    undoData?: { deadline?: string; status?: 'active' },
  ) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(item.id);
    setError('');
    setUndo(null);
    try {
      const result = await operation();
      publish(result);
      setNotice(message);
      if (celebrate) setBurst((v) => v + 1);
      if (undoData)
        setUndo({ id: item.id, revision: result.revision, ...undoData });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
      void load();
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };
  const finish = (item: AcademicAssignment) =>
    run(
      item,
      () => patch(`/api/assignments/${item.id}/complete`, {}),
      item.computed_status === 'overdue'
        ? 'Finished Late. Your effort still counts.'
        : 'Finished. A little more room in your week.',
      true,
    );
  const drop = (item: AcademicAssignment) =>
    run(
      item,
      () =>
        patch(`/api/assignments/${item.id}`, {
          expectedRevision: item.revision,
          status: 'dropped',
        }),
      'Item dropped. You can restore it whenever you’re ready.',
      false,
      { status: 'active' },
    );
  const reschedule = (item: AcademicAssignment) => {
    if (!timezone) return;
    const local = localDateTimeValue(item.deadline, timezone),
      tomorrow = shiftAcademicDay(dateKeyForInstant(new Date(), timezone), 1);
    void run(
      item,
      () =>
        patch(`/api/assignments/${item.id}`, {
          expectedRevision: item.revision,
          deadline: `${tomorrow}T${local.slice(11)}`,
        }),
      'Moved to tomorrow at the same local time. Edit it to choose another slot.',
      false,
      { deadline: item.deadline },
    );
  };
  const deleteItem = async (item: AcademicAssignment) => {
    if (
      lock.current ||
      !window.confirm(
        `Delete "${item.title}" permanently? This cannot be undone.`,
      )
    )
      return;
    lock.current = true;
    setBusy(item.id);
    setError('');
    try {
      await del(`/api/assignments/${item.id}`);
      setItems((current) => current.filter((i) => i.id !== item.id));
      setNotice('Assignment deleted.');
      setUndo(null);
      window.dispatchEvent(new Event('crystrack-activity-updated'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };
  const undoAction = async () => {
    if (!undo || lock.current) return;
    const item = items.find((i) => i.id === undo.id);
    if (!item) return;
    await run(
      item,
      () =>
        patch(`/api/assignments/${undo.id}`, {
          expectedRevision: undo.revision,
          ...(undo.deadline ? { deadline: undo.deadline } : {}),
          ...(undo.status ? { status: undo.status } : {}),
        }),
      'Change undone.',
    );
  };
  return (
    <div
      className="goal-workspace academic-workspace"
      style={goalThemeTokens as React.CSSProperties}
    >
      <header className="academic-page-header">
        <div>
          <p className="academic-eyebrow">Plan · Your next chapter</p>
          <h1>Assignments, without the overwhelm.</h1>
          <p>Small steps, clear deadlines, and room to begin again.</p>
        </div>
        <button
          className="goal-primary"
          disabled={!timezone}
          onClick={() => setEditor({ item: null })}
        >
          <Plus size={18} aria-hidden="true" />
          New assignment
        </button>
      </header>
      {error && (
        <div className="academic-error" role="alert">
          {error}
          <button onClick={() => void load()}>Refresh</button>
        </div>
      )}
      {notice && (
        <div className="goal-notice" role="status">
          <span>{notice}</span>
          {undo && (
            <button onClick={() => void undoAction()} disabled={Boolean(busy)}>
              Undo
            </button>
          )}
          <button
            aria-label="Dismiss notification"
            onClick={() => {
              setNotice('');
              setUndo(null);
            }}
          >
            ×
          </button>
        </div>
      )}
      <DomainInsightCard domain="assignments" />
      <div className="academic-toolbar">
        <div role="group" aria-label="Assignment lifecycle">
          {[
            ['open', 'In motion'],
            ['completed', 'Finished'],
            ['dropped', 'Dropped'],
          ].map(([key, label]) => (
            <button
              key={key}
              aria-pressed={stage === key}
              onClick={() => setStage(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Assignment view">
          <button
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            List
          </button>
          <button
            aria-pressed={view === 'calendar'}
            onClick={() => setView('calendar')}
          >
            Timeboxed calendar
          </button>
        </div>
      </div>
      <div className="academic-filters">
        <label>
          Course
          <select
            aria-label="Course"
            value={course}
            onChange={(e) => setCourse(e.target.value)}
          >
            <option value="all">All courses</option>
            <option value="none">No course yet</option>
            {courses.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select
            aria-label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="all">All priorities</option>
            {['low', 'medium', 'high', 'urgent'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Sort by deadline
          <select
            aria-label="Sort by deadline"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="earliest">Earliest first</option>
            <option value="latest">Latest first</option>
          </select>
        </label>
        <p>
          {filtered.length} item{filtered.length === 1 ? '' : 's'} ·{' '}
          {timezone || 'Loading saved timezone…'}
        </p>
      </div>
      {loading && (
        <p role="status" className="academic-skeleton">
          Gathering your coursework…
        </p>
      )}
      {!loading && !filtered.length && (
        <div className="academic-empty">
          <GraduationCap aria-hidden="true" />
          <h2>A little room to breathe</h2>
          <p>
            {items.length
              ? 'No items match these filters.'
              : 'Your coursework will appear here. Start with one small thing.'}
          </p>
        </div>
      )}
      {view === 'calendar' && timezone && week ? (
        <AssignmentCalendar
          items={filtered}
          timezone={timezone}
          startDay={week}
          onMove={(days) =>
            setWeek(
              days
                ? shiftAcademicDay(week, days)
                : dateKeyForInstant(new Date(), timezone),
            )
          }
          onEdit={(item) => setEditor({ item })}
        />
      ) : (
        <div className="academic-card-grid">
          {filtered.map((item) => (
            <AssignmentCard
              key={item.id}
              item={item}
              busy={Boolean(busy)}
              onFinish={() => void finish(item)}
              onEdit={() => setEditor({ item })}
              onDelete={() => void deleteItem(item)}
              onRestore={() =>
                void run(
                  item,
                  () =>
                    patch(`/api/assignments/${item.id}`, {
                      expectedRevision: item.revision,
                      status: 'active',
                    }),
                  'Ready to pick this back up.',
                )
              }
              onStep={(id) =>
                void run(
                  item,
                  () =>
                    patch(`/api/assignments/${item.id}`, {
                      expectedRevision: item.revision,
                      subtasks: item.subtasks.map((s) =>
                        s.id === id ? { ...s, completed: !s.completed } : s,
                      ),
                    }),
                  'Step updated. One thing at a time.',
                  !item.subtasks.find((s) => s.id === id)?.completed,
                )
              }
            />
          ))}
        </div>
      )}
      {activeOverdue && (
        <aside
          className="academic-resolution-dock"
          aria-label="Overdue resolution"
        >
          <div>
            <label>
              Ready to pick this back up?
              <select
                aria-label="Overdue item"
                value={activeOverdue.id}
                onChange={(e) => setSelected(e.target.value)}
              >
                {overdue.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.course_code ? `${i.course_code} · ` : ''}
                    {i.title}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Reschedule moves it to tomorrow at{' '}
              {timezone
                ? localDateTimeValue(activeOverdue.deadline, timezone).slice(11)
                : 'the same time'}
              .
            </p>
          </div>
          <div className="academic-resolution-actions">
            <button
              disabled={Boolean(busy)}
              onClick={() => reschedule(activeOverdue)}
            >
              Reschedule
            </button>
            <button
              className="goal-primary"
              disabled={Boolean(busy)}
              onClick={() => void finish(activeOverdue)}
            >
              Finish Late
            </button>
            <button
              disabled={Boolean(busy)}
              onClick={() => void drop(activeOverdue)}
            >
              Drop
            </button>
          </div>
        </aside>
      )}
      {editor && timezone && (
        <AssignmentEditor
          assignment={editor.item}
          timezone={timezone}
          defaultChannels={channels}
          onClose={() => {
            setEditor(null);
            void load();
          }}
          onSaved={(item) => {
            publish(item);
            setNotice(
              editor.item ? 'Assignment updated.' : 'Your next step is ready.',
            );
            setUndo(null);
          }}
        />
      )}
      {burst > 0 && !reducedMotion && (
        <div key={burst} className="goal-particles" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <i key={i} style={{ '--particle': i } as React.CSSProperties} />
          ))}
        </div>
      )}
    </div>
  );
}
