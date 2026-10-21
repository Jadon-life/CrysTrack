'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';
import { fetcher } from '@/lib/api';
import { cn } from '@/lib/utils';
import { dayInTimezone } from '@/lib/today-progress';
import { calendarDeadlineDay } from '@/lib/calendar-date';

const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => dateKey(new Date()));
  const [timezone, setTimezone] = useState('UTC');
  const [hovered, setHovered] = useState<string | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const profile = await fetcher('/api/profile').catch(() => null);
      let zone = String(profile?.scheduling_timezone || profile?.timezone || 'UTC');
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
      } catch {
        zone = 'UTC';
      }
      const current = dayInTimezone(zone);
      const [taskData, goalData, assignmentData] = await Promise.all([
        fetcher(`/api/tasks?date=${current.dateKey}&weekday=${current.weekday}`).catch(() => []),
        fetcher('/api/goals').catch(() => []),
        fetcher('/api/assignments').catch(() => []),
      ]);
      if (!active) return;
      setTimezone(zone);
      setSelected(current.dateKey);
      setCursor(new Date(Number(current.dateKey.slice(0, 4)), Number(current.dateKey.slice(5, 7)) - 1, 1));
      setTasks(Array.isArray(taskData) ? taskData : []);
      setGoals(Array.isArray(goalData) ? goalData : []);
      setAssignments(Array.isArray(assignmentData) ? assignmentData : []);
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, []);

  const cells = useMemo(() => {
    const first = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      1,
    );

    const last = new Date(
      cursor.getFullYear(),
      cursor.getMonth() + 1,
      0,
    );

    const gridStart = new Date(first);
    gridStart.setDate(
      first.getDate() - first.getDay(),
    );

    const cellCount =
      Math.ceil(
        (
          first.getDay() +
          last.getDate()
        ) / 7,
      ) * 7;

    return Array.from(
      { length: cellCount },
      (_, index) => {
        const date = new Date(gridStart);

        date.setDate(
          gridStart.getDate() + index,
        );

        return {
          date,
          inMonth:
            date.getFullYear() ===
              cursor.getFullYear() &&
            date.getMonth() ===
              cursor.getMonth(),
        };
      },
    );
  }, [cursor]);

  const eventDay = (value: unknown) => calendarDeadlineDay(value, timezone);
  const todayKey = dayInTimezone(timezone).dateKey;
  const eventsFor = (date: Date) => {
    const key = dateKey(date);
    // The cells are pure civil dates. Get their weekday without consulting the
    // browser's current clock or interpreting a deadline in browser local time.
    const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
    const taskEvents = tasks.filter((task: any) => task.task_schedules?.some((schedule: any) => schedule.weekday === weekday)).map((task: any) => ({ type: 'task', title: task.title, tone: 'bg-emerald-400' }));
    const assignmentEvents = assignments.filter((item: any) => eventDay(item.deadline) === key).map((item: any) => ({ type: 'assignment', title: item.title, tone: 'bg-amber-400' }));
    const goalEvents = goals.filter((goal: any) => eventDay(goal.deadline) === key).map((goal: any) => ({ type: 'goal', title: goal.title, tone: 'bg-violet-400' }));
    return [...assignmentEvents, ...goalEvents, ...taskEvents];
  };

  const selectedDate = new Date(`${selected}T12:00:00`);
  const selectedEvents = eventsFor(selectedDate);
  const groupsForSelected = [
    { type: 'task', label: 'Routines', tone: 'bg-emerald-400' },
    { type: 'assignment', label: 'Assignments', tone: 'bg-amber-400' },
    { type: 'goal', label: 'Goals', tone: 'bg-violet-400' },
  ].map((category) => ({
    ...category,
    events: selectedEvents.filter((event) => event.type === category.type),
  })).filter((category) => category.events.length > 0);

  const monthLabel = cursor.toLocaleDateString([], { month: 'long', year: 'numeric' });

  if (loading) return <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[var(--theme-primary)]" /></div>;

  return (
    <div className="space-y-6">
      <header className="scenic-readable-strip max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-primary)]">Plan · Time</p>
        <h1 className="text-2xl font-bold text-white mt-1">Calendar</h1>
        <p className="text-sm text-white/85 mt-1">See recurring routines, goal dates and assignment deadlines in one place.</p>
      </header>
      <div className="grid xl:grid-cols-[1fr_330px] gap-4">
        <GlassCard padding="md" depth="substantial" className="calendar-glass calendar-glass--grid">
          <div className="flex items-center justify-between mb-5"><button type="button" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="glass-button !p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"><ChevronLeft className="w-4 h-4" /></button><p className="text-sm font-semibold text-white">{monthLabel}</p><button type="button" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="glass-button !p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"><ChevronRight className="w-4 h-4" /></button></div>
          <div className="grid grid-cols-7 gap-1">
            {weekdayNames.map((day) => (
              <div
                key={day}
                className="text-xs uppercase tracking-wide text-center text-[var(--theme-text-muted)] py-2"
              >
                {day}
              </div>
            ))}

            {cells.map(({ date, inMonth }) => {
              const key = dateKey(date);
              const events = eventsFor(date);
              const active = key === selected;
              const today = key === todayKey;
              const groups = [
                { type: 'task', tone: 'bg-emerald-400' },
                { type: 'assignment', tone: 'bg-amber-400' },
                { type: 'goal', tone: 'bg-violet-400' },
              ].filter((group) => events.some((item) => item.type === group.type));

              return (
                <div key={key} className="relative min-w-0" onMouseEnter={() => setHovered(key)} onMouseLeave={() => setHovered(null)}>
                  <button
                    type="button"
                    aria-pressed={active}
                    aria-label={date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + ', ' + events.length + ' scheduled items'}
                    aria-describedby={hovered === key && events.length ? 'calendar-preview-' + key : undefined}
                    onClick={() => { setSelected(key); setHovered(null); }}
                    className={cn(
                      'calendar-day flex min-h-16 w-full flex-col items-center justify-center rounded-xl border px-1 py-2 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 sm:min-h-20',
                      active ? 'border-[var(--theme-primary)] bg-white/10' : 'border-white/[0.07] bg-black/10 hover:bg-white/[0.04]',
                      !inMonth && 'opacity-35',
                    )}
                  >
                    <span className={cn('grid h-7 w-7 place-items-center text-xs', today ? 'rounded-full bg-[var(--theme-primary)] font-bold text-white' : 'text-white/85')}>{date.getDate()}</span>
                    <span className="mt-1 flex min-h-2 items-center justify-center gap-1" aria-hidden="true">
                      {groups.map((group) => <span key={group.type} className={cn('h-1.5 w-1.5 rounded-full', group.tone)} />)}
                    </span>
                  </button>
                  {hovered === key && events.length > 0 && (
                    <div id={'calendar-preview-' + key} role="tooltip" className={cn(
                      'pointer-events-none absolute bottom-[calc(100%+6px)] z-50 hidden w-56 rounded-xl border border-white/20 bg-[#071424]/95 p-3 text-left shadow-2xl backdrop-blur-xl md:block',
                      date.getDay() === 0 ? 'left-0' : date.getDay() === 6 ? 'right-0' : 'left-1/2 -translate-x-1/2',
                    )}>
                      <p className="text-xs font-semibold text-white">{date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                      <div className="mt-2 space-y-1.5">
                        {events.slice(0, 4).map((event, index) => (
                          <p key={event.type + index} className="flex items-start gap-2 text-xs text-white/85">
                            <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', event.tone)} />
                            <span className="line-clamp-2">{event.title}</span>
                          </p>
                        ))}
                        {events.length > 4 && <p className="text-xs text-[var(--theme-text-muted)]">+ {events.length - 4} more · Click to see all</p>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </GlassCard>
        <GlassCard padding="md" depth="substantial" className="calendar-glass h-fit">
          <h2 className="text-sm font-semibold text-white">
            {selectedDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </h2>
          <p className="mt-1 text-xs text-[var(--theme-text-muted)]">
            {selectedEvents.length} scheduled item{selectedEvents.length === 1 ? '' : 's'} · Open a category to see everything
          </p>
          {selectedEvents.length === 0 ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/10 px-3 py-5 text-center">
              <p className="text-sm font-medium text-white">Nothing scheduled for this day</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--theme-text-muted)]">
                A clear day. Add a routine, goal or assignment whenever you need one.
              </p>
              <Link href="/plan" className="mt-3 inline-flex min-h-10 items-center text-xs font-semibold text-[var(--theme-primary)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">Open Plan</Link>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {groupsForSelected.map((category) => (
                <details key={selected + '-' + category.type} className="calendar-day-details overflow-hidden rounded-xl border border-white/10 bg-black/10">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 py-3 text-sm font-medium text-white hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 [&::-webkit-details-marker]:hidden">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', category.tone)} aria-hidden="true" />
                    <span className="min-w-0 flex-1">{category.label}</span>
                    <span className="text-xs text-[var(--theme-text-muted)]">{category.events.length}</span>
                    <ChevronDown className="calendar-group-chevron h-4 w-4 text-[var(--theme-text-muted)]" aria-hidden="true" />
                  </summary>
                  <div className="space-y-2 border-t border-white/10 p-2">
                    {category.events.map((event, index) => (
                      <p key={event.type + index} className="calendar-event-glass rounded-lg border border-white/[0.06] p-3 text-sm text-white">
                        {event.title}
                      </p>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
