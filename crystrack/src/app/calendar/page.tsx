'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { GlassCard } from '@/components/shared/glass-card';
import { useRhythm } from '@/components/rhythm/rhythm-provider';
import { assignSlot, monthCells, weekStart } from '@/lib/rhythm/logic';
import { shiftAcademicDay } from '@/lib/assignments/time';
import { dateKeyForInstant } from '@/lib/reminders';
import { fetcher, post, del } from '@/lib/api';
import type { CalendarEvent, RhythmTask, Timebox } from '@/types/rhythm';
export default function CalendarPage() {
  const { data, refresh, error:dayError } = useRhythm();
  const [cursor, setCursor] = useState(''),
    [view, setView] = useState<'day' | 'week' | 'month'>('day'),
    [events, setEvents] = useState<CalendarEvent[]>([]),
    [tasks, setTasks] = useState<RhythmTask[]>([]),
    [boxes, setBoxes] = useState<Timebox[]>([]),
    [chosen, setChosen] = useState(''),
    [minutes, setMinutes] = useState(30),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    serial = useRef(0),
    lock = useRef(false);
  useEffect(() => {
    if (data) queueMicrotask(() => setCursor((current) => current || data.day));
  }, [data]);
  const days = useMemo(
    () =>
      !cursor
        ? []
        : view === 'month'
          ? monthCells(cursor)
          : view === 'week'
            ? Array.from({ length: 7 }, (_, i) =>
                shiftAcademicDay(weekStart(cursor), i),
              )
            : [cursor],
    [cursor, view],
  );
  const start = days[0] || '',
    end = days[days.length - 1] || '';
  const load = useCallback(async () => {
    if (!start) return;
    const id = ++serial.current;
    setLoading(true);
    try {
      const result = await fetcher(`/api/calendar?start=${start}&end=${end}`);
      if (id === serial.current) {
        setEvents(result.events);
        setTasks(result.tasks);
        setBoxes(result.boxes);
        setError('');
      }
    } catch (e) {
      if (id === serial.current)
        setError(
          e instanceof Error ? e.message : 'Your calendar could not load.',
        );
    } finally {
      if (id === serial.current) setLoading(false);
    }
  }, [start, end]);
  useEffect(() => {
    queueMicrotask(() => void load());
    const update = () => void load();
    window.addEventListener('crystrack-activity-updated', update);
    return () =>
      window.removeEventListener('crystrack-activity-updated', update);
  }, [load]);
  const place = async (taskId: string, day: string, hour: number) => {
    if (lock.current || !data) return;
    lock.current = true;
    setBusy(true);
    try {
      if (!taskId) throw new Error('Choose a task or drag one onto this hour.');
      const payload = assignSlot(
        taskId,
        day,
        hour,
        minutes,
        data.timezone,
        boxes,
      );
      await post('/api/rhythm/timeboxes', payload);
      setNotice('Focus time protected. You can move or remove this block.');
      await load();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Choose another slot.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await del(`/api/rhythm/timeboxes?id=${id}`);
      await load();
      await refresh();
      setNotice('Block removed. Your task is still here.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try again.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const renderEvent = (event: CalendarEvent) => (
    <div className={`rhythm-event rhythm-event-${event.type}`} key={event.id}>
      <Link href={event.href}>
        {event.completed ? '✓ ' : ''}
        {event.title}
      </Link>
      <small>
        {event.type}
        {event.starts_at
          ? ` · ${new Intl.DateTimeFormat('en-NG', { timeZone: data?.timezone || 'UTC', hour: '2-digit', minute: '2-digit' }).format(new Date(event.starts_at))}`
          : ''}
        {event.ends_at
          ? `–${new Intl.DateTimeFormat('en-NG', { timeZone: data?.timezone || 'UTC', hour: '2-digit', minute: '2-digit' }).format(new Date(event.ends_at))}`
          : ''}
      </small>
      {event.box_id && (
        <button
          disabled={busy}
          aria-label={`Remove timebox for ${event.title}`}
          onClick={() => void remove(event.box_id!)}
        >
          Remove block
        </button>
      )}
    </div>
  );
  if(!data)return <div className="rhythm-page"><h1>Timeboxed Calendar</h1><p role={dayError?"alert":"status"}>{dayError||"Loading your saved local day…"}</p>{dayError&&<button onClick={()=>void refresh()}>Try again</button>}</div>;
  return (
    <div className="rhythm-page">
      <header>
        <p className="rhythm-eyebrow">Plan · Time</p>
        <h1>Timeboxed Calendar</h1>
        <p>
          Drag a task into an hour, or choose it and activate a slot with your
          keyboard. {data?.timezone}
        </p>
      </header>
      <div className="rhythm-calendar-toolbar">
        <div>
          {(['day', 'week', 'month'] as const).map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {v}
            </button>
          ))}
        </div>
        <div>
          <button
            aria-label="Previous period"
            onClick={() => {
              if (view === 'month') {
                const previous = new Date(`${cursor.slice(0, 7)}-01T12:00Z`);
                previous.setUTCMonth(previous.getUTCMonth() - 1);
                setCursor(previous.toISOString().slice(0, 10));
              } else
                setCursor(shiftAcademicDay(cursor, view === 'day' ? -1 : -7));
            }}
            disabled={!cursor}
          >
            ←
          </button>
          <button onClick={() => data && setCursor(data.day)}>Today</button>
          <button
            aria-label="Next period"
            onClick={() => {
              if (view === 'month') {
                const next = new Date(`${cursor.slice(0, 7)}-01T12:00Z`);
                next.setUTCMonth(next.getUTCMonth() + 1);
                setCursor(next.toISOString().slice(0, 10));
              } else
                setCursor(shiftAcademicDay(cursor, view === 'day' ? 1 : 7));
            }}
            disabled={!cursor}
          >
            →
          </button>
        </div>
        <label>
          Selected date
          <input
            type="date"
            value={cursor}
            onChange={(e) => e.target.value && setCursor(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="rhythm-alert">
          {error}
          <button onClick={() => void load()}>Refresh</button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {loading && <p role="status">Refreshing your calendar…</p>}
      <div className="rhythm-calendar-layout">
        <GlassCard className="rhythm-task-rail" hover>
          <h2>Tasks to timebox</h2>
          <label>
            Choose task
            <select
              aria-label="Choose task to timebox"
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
            >
              <option value="">Choose a task</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Block minutes
            <select
              aria-label="Block minutes"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            >
              {[15, 25, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
          {tasks
            .filter(
              (t) =>
                !boxes.some(
                  (b) => b.task_id === t.id && b.occurrence_day === cursor,
                ),
            )
            .map((t) => (
              <button
                key={t.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-crystrack-task', t.id);
                  e.dataTransfer.setData('text/plain', t.id);
                  setChosen(t.id);
                }}
                onClick={() => setChosen(t.id)}
                aria-pressed={chosen === t.id}
              >
                {t.title}
              </button>
            ))}
          {!tasks.length && <p>Create a routine in Plan to begin.</p>}
        </GlassCard>
        <GlassCard
          depth="substantial"
          className="rhythm-calendar-surface"
          hover
        >
          {view === 'month' ? (
            <div className="rhythm-month-grid">
              {days.map((day) => {
                const list = events.filter((e) => e.day === day);
                const counts = [...new Set(list.map((e) => e.type))].map(
                  (type) => ({
                    type,
                    count: list.filter((e) => e.type === type).length,
                  }),
                );
                return (
                  <button
                    key={day}
                    aria-label={`${day}, ${list.length} events`}
                    onClick={() => {
                      setCursor(day);
                      setView('day');
                    }}
                    data-today={day === data?.day}
                  >
                    <strong>{day.slice(8)}</strong>
                    {counts.map((c) => (
                      <small key={c.type}>
                        {c.count} {c.type}
                      </small>
                    ))}
                  </button>
                );
              })}
            </div>
          ) : (
            <div
              className="rhythm-hour-scroll"
              tabIndex={0}
              aria-label="Calendar hours"
            >
              <div
                className="rhythm-hour-grid"
                style={{
                  gridTemplateColumns: `repeat(${days.length},minmax(${days.length === 1 ? '220' : '140'}px,1fr))`,
                }}
              >
                {days.map((day) => (
                  <section key={day}>
                    <h2>{day}</h2>
                    <div className="rhythm-all-day">
                      <p>Unscheduled / all day</p>
                      {events
                        .filter((e) => e.day === day && !e.starts_at)
                        .map(renderEvent)}
                    </div>
                    {Array.from({ length: 24 }, (_, hour) => (
                      <div
                        key={hour}
                        className="rhythm-slot"
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          void place(
                            e.dataTransfer.getData(
                              'application/x-crystrack-task',
                            ) || e.dataTransfer.getData('text/plain'),
                            day,
                            hour,
                          );
                        }}
                      >
                        <button
                          className="rhythm-slot-target"
                          disabled={busy}
                          aria-label={`Place selected task on ${day} at ${String(hour).padStart(2, '0')}:00`}
                          onClick={() => void place(chosen, day, hour)}
                        >
                          {String(hour).padStart(2, '0')}:00 · + focus
                        </button>
                        {events
                          .filter(
                            (e) =>
                              e.day === day &&
                              e.starts_at &&
                              Number(
                                new Intl.DateTimeFormat('en-GB', {
                                  timeZone: data?.timezone || 'UTC',
                                  hour: '2-digit',
                                  hourCycle: 'h23',
                                }).format(new Date(e.starts_at)),
                              ) === hour,
                          )
                          .map(renderEvent)}
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
