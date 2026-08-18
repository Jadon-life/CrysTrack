'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';
import { fetcher } from '@/lib/api';

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
  const [tasks, setTasks] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetcher(`/api/tasks?date=${dateKey(new Date())}&weekday=${new Date().getDay()}`).catch(() => []),
      fetcher('/api/goals').catch(() => []),
      fetcher('/api/assignments').catch(() => []),
    ]).then(([taskData, goalData, assignmentData]) => {
      setTasks(taskData); setGoals(goalData); setAssignments(assignmentData); setLoading(false);
    });
  }, []);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const output: Array<{ date: Date; inMonth: boolean }> = [];
    for (let offset = first.getDay(); offset > 0; offset -= 1) {
      output.unshift({ date: new Date(cursor.getFullYear(), cursor.getMonth(), 1 - offset), inMonth: false });
    }
    for (let day = 1; day <= last.getDate(); day += 1) output.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), day), inMonth: true });
    while (output.length % 7) output.push({ date: new Date(cursor.getFullYear(), cursor.getMonth() + 1, output.length - first.getDay() - last.getDate() + 1), inMonth: false });
    return output;
  }, [cursor]);

  const eventsFor = (date: Date) => {
    const key = dateKey(date);
    const weekday = date.getDay();
    const taskEvents = tasks.filter((task: any) => task.task_schedules?.some((schedule: any) => schedule.weekday === weekday)).map((task: any) => ({ type: 'task', title: task.title, tone: 'bg-emerald-400' }));
    const assignmentEvents = assignments.filter((item: any) => dateKey(new Date(item.deadline)) === key).map((item: any) => ({ type: 'assignment', title: item.title, tone: 'bg-amber-400' }));
    const goalEvents = goals.filter((goal: any) => goal.deadline && dateKey(new Date(goal.deadline)) === key).map((goal: any) => ({ type: 'goal', title: goal.title, tone: 'bg-violet-400' }));
    return [...assignmentEvents, ...goalEvents, ...taskEvents];
  };

  const selectedDate = new Date(`${selected}T12:00:00`);
  const selectedEvents = eventsFor(selectedDate);
  const monthLabel = cursor.toLocaleDateString([], { month: 'long', year: 'numeric' });

  if (loading) return <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[var(--theme-primary)]" /></div>;

  return (
    <div className="space-y-6">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-primary)]">Plan · Time</p><h1 className="text-2xl font-bold text-white mt-1">Calendar</h1><p className="text-sm text-[var(--theme-text-muted)] mt-1">See recurring routines, goal dates and assignment deadlines in one place.</p></div>
      <div className="grid xl:grid-cols-[1fr_330px] gap-4">
        <GlassCard padding="md">
          <div className="flex items-center justify-between mb-5"><button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="glass-button !p-2"><ChevronLeft className="w-4 h-4" /></button><p className="text-sm font-semibold text-white">{monthLabel}</p><button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="glass-button !p-2"><ChevronRight className="w-4 h-4" /></button></div>
          <div className="grid grid-cols-7 gap-1">{weekdayNames.map((day) => <div key={day} className="text-[10px] uppercase tracking-wide text-center text-[var(--theme-text-muted)] py-2">{day}</div>)}{cells.map(({ date, inMonth }) => { const key = dateKey(date); const events = eventsFor(date); const active = key === selected; const today = key === dateKey(new Date()); return <button key={key} onClick={() => setSelected(key)} className={`min-h-24 sm:min-h-28 rounded-xl border p-2 text-left transition-colors ${active ? 'border-[var(--theme-primary)] bg-white/10' : 'border-white/[0.07] bg-black/10 hover:bg-white/[0.04]'} ${inMonth ? '' : 'opacity-35'}`}><div className="flex items-center justify-between"><span className={`text-xs ${today ? 'w-6 h-6 rounded-full grid place-items-center bg-[var(--theme-primary)] text-white font-bold' : 'text-white/80'}`}>{date.getDate()}</span></div><div className="mt-2 space-y-1">{events.slice(0, 3).map((event, i) => <div key={`${event.type}-${i}`} className="flex items-center gap-1.5 min-w-0"><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${event.tone}`} /><span className="text-[9px] text-white/70 truncate">{event.title}</span></div>)}{events.length > 3 && <span className="text-[9px] text-[var(--theme-text-muted)]">+{events.length - 3} more</span>}</div></button>; })}</div>
        </GlassCard>
        <GlassCard padding="md" className="h-fit"><p className="text-sm font-semibold text-white">{selectedDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p><p className="text-[11px] text-[var(--theme-text-muted)] mt-1">Scheduled items</p><div className="space-y-2 mt-4">{selectedEvents.length === 0 ? <p className="text-xs text-[var(--theme-text-muted)] py-6 text-center">Nothing scheduled for this day.</p> : selectedEvents.map((event, index) => <div key={`${event.type}-${index}`} className="rounded-xl border border-white/10 bg-black/10 p-3"><div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${event.tone}`} /><span className="text-[10px] uppercase tracking-wide text-[var(--theme-text-muted)]">{event.type}</span></div><p className="text-xs text-white mt-1.5">{event.title}</p></div>)}</div></GlassCard>
      </div>
    </div>
  );
}
