'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { GlassCard } from '@/components/shared/glass-card';
import { DomainInsightCard } from '@/components/ai/domain-insight-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CreateModal } from '@/components/shared/create-modal';
import { del, fetcher, post } from '@/lib/api';
import { cn, getLocalDateKey } from '@/lib/utils';
import { groupTodayTasks, summarizeToday } from '@/lib/today-progress';
import { Plus, Flame, Calendar, Clock, Filter, Loader2, CheckCircle2, Bell, SkipForward, Archive, Trash2, ChevronDown } from 'lucide-react';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TasksPage() {
  const searchParams = useSearchParams();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterDay, setFilterDay] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<any>(null);
  const [archiving, setArchiving] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '', description: '', preferredTime: '', category: '', schedules: [] as number[],
    remindersEnabled: true, reminderChannel: 'push', beforeMinutes: 15, atPreferredTime: true, followUp: true, endOfDayReminder: true,
  });
  const today = new Date().getDay();

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTasks(await fetcher(`/api/tasks?date=${getLocalDateKey()}&weekday=${new Date().getDay()}`));
    } catch (e: any) {
      setError(e.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetcher('/api/preferences').then((prefs: any) => {
      const channels = prefs?.default_reminder_channels || ['push'];
      const reminderChannel = channels.includes('push') && channels.includes('telegram') ? 'both' : channels.includes('telegram') ? 'telegram' : 'push';
      setNewTask((current: any) => ({ ...current, reminderChannel }));
    }).catch(() => null);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadTasks();
    });
  }, [loadTasks]);

  useEffect(() => {
    if (searchParams.get('create') !== 'task') return;

    queueMicrotask(() => {
      setShowCreate(true);
    });
  }, [searchParams]);

  const handleCreate = async () => {
    if (!newTask.title.trim()) throw new Error('Title is required');
    if (newTask.schedules.length === 0) throw new Error('Select at least one day');
    await post('/api/tasks', {
      title: newTask.title, description: newTask.description, preferredTime: newTask.preferredTime, category: newTask.category, schedules: newTask.schedules,
      reminderConfig: {
        enabled: newTask.remindersEnabled,
        channels: newTask.reminderChannel === 'both' ? ['push', 'telegram'] : [newTask.reminderChannel],
        beforeMinutes: newTask.beforeMinutes, atPreferredTime: newTask.atPreferredTime,
        followUpMinutes: newTask.followUp ? [120] : [], endOfDayReminder: newTask.endOfDayReminder,
      },
    });
    await loadTasks();
    window.dispatchEvent(new Event('crystrack-activity-updated'));
    setNewTask((current) => ({ title: '', description: '', preferredTime: '', category: '', schedules: [], remindersEnabled: true, reminderChannel: current.reminderChannel, beforeMinutes: 15, atPreferredTime: true, followUp: true, endOfDayReminder: true }));
  };

  const toggleDay = (day: number) => {
    setNewTask((prev) => ({
      ...prev,
      schedules: prev.schedules.includes(day) ? prev.schedules.filter((value) => value !== day) : [...prev.schedules, day],
    }));
  };

  const toggleTaskCompletion = async (taskId: string) => {
    setError('');
    try {
      await post(`/api/tasks/${taskId}/occurrences/${getLocalDateKey()}/toggle`, {});
      await loadTasks();
      window.dispatchEvent(new Event('crystrack-activity-updated'));
    } catch (e: any) {
      setError(e.message || 'Failed to update task');
    }
  };

  const toggleTaskSkip = async (taskId: string) => {
    setError('');
    try {
      await post(`/api/tasks/${taskId}/occurrences/${getLocalDateKey()}/skip`, {});
      await loadTasks();
      window.dispatchEvent(new Event('crystrack-activity-updated'));
    } catch (e: any) {
      setError(e.message || 'Failed to skip task');
    }
  };

  const archiveRoutine = async () => {
    if (!archiveTarget || archiving) return;

    setArchiving(true);
    setError('');

    try {
      const response = await fetch(`/api/tasks/${archiveTarget.id}/archive`, {
        method: 'POST',
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to archive routine');
      }

      setArchiveTarget(null);
      await loadTasks();
      window.dispatchEvent(new Event('crystrack-activity-updated'));
    } catch (e: any) {
      setError(e.message || 'Failed to archive routine');
    } finally {
      setArchiving(false);
    }
  };

  const deleteTask = async (task: any) => {
    if (!window.confirm(`Delete "${task.title}" permanently? Its schedules, occurrences and reminders will be removed.`)) return;
    setError('');
    try {
      await del(`/api/tasks/${task.id}`);
      await loadTasks();
      window.dispatchEvent(new Event('crystrack-activity-updated'));
    } catch (e: any) {
      setError(e.message || 'Failed to delete task');
    }
  };

  const todayTasks = useMemo(
    () => tasks.filter((task: any) => task.scheduled_today).sort((a: any, b: any) => (a.preferred_time || '99:99').localeCompare(b.preferred_time || '99:99')),
    [tasks],
  );
  const todayGroups = useMemo(() => groupTodayTasks(todayTasks), [todayTasks]);
  const progress = summarizeToday(tasks);
  const completedToday = progress.completed;
  const completionPercent = progress.percent;

  const filteredTasks = filterDay !== null
    ? tasks.filter((task: any) => task.task_schedules?.some((schedule: any) => schedule.weekday === filterDay))
    : tasks;

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-start sm:flex-row sm:items-center justify-between gap-4 scenic-readable-copy">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">Plan · Routines</p>
          <h1 className="text-2xl font-bold text-white mt-1">Tasks</h1>
          <p className="text-sm text-[var(--theme-text-muted)] mt-1">Do today first; manage the recurring schedule second.</p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> New task
        </Button>
      </div>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      <DomainInsightCard domain="tasks" />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4 scenic-readable-strip">
          <div>
            <h2 className="text-lg font-semibold text-white">Today</h2>
            <p className="mt-1 text-xs text-[var(--theme-text-muted)]" aria-live="polite">
              {completedToday} of {todayTasks.length} scheduled routines complete
              {progress.skipped > 0 ? ' · ' + progress.skipped + ' skipped' : ''}
              {progress.remaining > 0 ? ' · ' + progress.remaining + ' remaining' : ''}
            </p>
          </div>
          <div className="relative h-[66px] w-[66px] shrink-0" role="img" aria-label={completionPercent + '% of scheduled routines completed'}>
            <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden="true">
              <circle cx="40" cy="40" r="31" pathLength="100" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="7" />
              <circle cx="40" cy="40" r="31" pathLength="100" fill="none" stroke="var(--theme-primary)" strokeWidth="7" strokeLinecap="round" strokeDasharray={completionPercent + ' 100'} />
            </svg>
            <span className="absolute inset-0 grid place-items-center text-sm font-semibold text-white">{completionPercent}%</span>
          </div>
        </div>

        {loading && <div className="flex justify-center py-10" role="status"><Loader2 className="h-7 w-7 animate-spin text-[var(--theme-primary)]" /><span className="sr-only">Loading today's routines</span></div>}
        {!loading && todayTasks.length === 0 && (
          <GlassCard padding="lg" className="py-8 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-[var(--theme-primary)]" aria-hidden="true" />
            <p className="text-sm font-semibold text-white">No routines are scheduled for today.</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--theme-text-muted)]">
              Add a routine when you are ready.
            </p>
            <Button variant="primary" onClick={() => setShowCreate(true)} className="mt-4">
              <Plus className="mr-1.5 h-4 w-4" /> Create a routine
            </Button>
          </GlassCard>
        )}
        {!loading && progress.allDone && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100" role="status">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> All scheduled routines are complete
          </div>
        )}
        {!loading && todayTasks.length > 0 && (
          <GlassCard padding="md" className="max-h-[34rem] overflow-y-auto">
            <div className="space-y-4">
              {todayGroups.map((group) => (
                <div key={group.key} className="space-y-1">
                  <h3 className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--theme-text-muted)]">{group.label}</h3>
                  {group.tasks.map((task: any) => (
                    <div key={task.id} className="flex items-center gap-2 rounded-xl px-1 py-1.5 transition-colors hover:bg-white/[0.045]">
                      <Checkbox
                        checked={task.today_status === 'completed'}
                        disabled={task.today_status === 'skipped' || task.today_status === 'missed'}
                        aria-label={task.today_status === 'completed' ? 'Mark ' + task.title + ' incomplete' : 'Complete ' + task.title}
                        onCheckedChange={() => void toggleTaskCompletion(task.id)}
                        className="h-10 w-10 shrink-0 rounded-full border-white/25 data-[state=checked]:border-emerald-500 data-[state=checked]:bg-emerald-500"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cn('break-words text-sm font-medium', task.today_status === 'completed' ? 'text-white/55 line-through' : 'text-white')}>{task.title}</p>
                        <p className="mt-0.5 text-xs text-[var(--theme-text-muted)]">
                          {task.preferred_time || 'Any time'}
                          {task.today_status === 'skipped' ? ' · Skipped' : ''}
                          {task.category ? ' · ' + task.category : ''}
                          {' · '}
                          <span title="Routine streak">{task.streak || 0} streak</span>
                        </p>
                      </div>
                      {task.today_status !== 'completed' && task.today_status !== 'missed' && (
                        <button
                          type="button"
                          aria-label={(task.today_status === 'skipped' ? 'Undo skip for ' : 'Skip ') + task.title}
                          onClick={() => void toggleTaskSkip(task.id)}
                          className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-[var(--theme-text-muted)] hover:bg-white/10 hover:text-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
                        >
                          <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
                          {task.today_status === 'skipped' ? 'Unskip' : 'Skip'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </GlassCard>
        )}
      </section>

      <section className="routine-readable-section">
        <details className="group overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-black/15">
          <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-4 text-white hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-sky-300 [&::-webkit-details-marker]:hidden">
            <Calendar className="h-5 w-5 shrink-0 text-[var(--theme-primary)]" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold">All routines</span>
              <span className="mt-1 block text-xs text-[var(--theme-text-muted)]">
                {tasks.length} routine{tasks.length === 1 ? '' : 's'} · Open to manage schedules, archive or delete
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--theme-text-muted)] transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
          </summary>
          <div className="space-y-4 border-t border-white/10 px-3 py-4 sm:px-4">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
          <button onClick={() => setFilterDay(null)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all border', filterDay === null ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' : 'bg-white/[0.025] text-slate-400 border-white/10 hover:bg-white/5')}>
            <Filter className="w-3.5 h-3.5" /> All
          </button>
          {weekdays.map((day, i) => (
            <button key={day} onClick={() => setFilterDay(i)} className={cn('px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all border', filterDay === i ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' : i === today ? 'bg-white/[0.06] text-white border-white/15' : 'bg-white/[0.025] text-slate-400 border-white/10 hover:bg-white/5')}>
              {day}
            </button>
          ))}
        </div>

        {!loading && filteredTasks.length === 0 && (
          <GlassCard padding="lg" className="text-center py-8">
            <p className="text-sm font-semibold text-white">
              {tasks.length === 0 ? 'No routines created yet.' : 'No routines match this day.'}
            </p>
            <p className="mt-1 text-xs text-[var(--theme-text-muted)]">
              {tasks.length === 0 ? 'Build a routine that fits your week.' : 'Try another day or show all routines.'}
            </p>
            {tasks.length === 0 ? (
              <Button variant="primary" onClick={() => setShowCreate(true)} className="mt-4">
                <Plus className="w-4 h-4 mr-1.5" /> Create your first routine
              </Button>
            ) : (
              <button type="button" onClick={() => setFilterDay(null)} className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-[var(--theme-border)] bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">
                Show all routines
              </button>
            )}
          </GlassCard>
        )}

        <div className="space-y-2">
          {filteredTasks.map((task: any) => {
            const schedules = task.task_schedules?.map((schedule: any) => schedule.weekday) || [];
            return (
              <GlassCard key={task.id} padding="md">
                <div className="flex items-start gap-4">
                  <div className="mt-0.5 w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-white">{task.title}</h3>
                      <StatusBadge status={task.scheduled_today ? task.today_status : 'not_scheduled'} />
                    </div>
                    {task.description && <p className="text-sm text-[var(--theme-text-muted)] mt-1">{task.description}</p>}
                    <div className="flex items-center gap-4 mt-3 flex-wrap text-xs text-slate-500">
                      <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /><span>{schedules.map((day: number) => weekdays[day]).join(', ')}</span></div>
                      {task.preferred_time && <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /><span>{task.preferred_time}</span></div>}
                      <div className="flex items-center gap-1.5 text-amber-400"><Flame className="w-3.5 h-3.5" /><span>{task.streak || 0} streak</span></div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {task.category && <span className="text-xs px-2 py-1 rounded-full bg-white/[0.035] text-slate-400 border border-white/10 shrink-0">{task.category}</span>}
                    <button
                      type="button"
                      onClick={() => setArchiveTarget(task)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.045] px-2.5 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:border-amber-400/35 hover:bg-amber-500/12 hover:text-amber-100"
                      title="Archive routine"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Archive</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteTask(task)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/20"
                      title="Delete task permanently"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
          </div>
        </details>
      </section>

      {archiveTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close archive confirmation"
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            onClick={() => !archiving && setArchiveTarget(null)}
          />
          <GlassCard padding="lg" className="relative w-full max-w-md">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-500/10">
                <Archive className="h-5 w-5 text-amber-300" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-white">Archive routine?</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-100">
                  <span className="font-medium text-white">{archiveTarget.title}</span> will disappear from Tasks and stop generating future routine reminders.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-200">
                  Your completion history will be preserved. This is not a permanent delete.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                disabled={archiving}
                onClick={() => setArchiveTarget(null)}
              >
                Cancel
              </Button>
              <button
                type="button"
                disabled={archiving}
                onClick={() => void archiveRoutine()}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-400/20 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/25 disabled:cursor-wait disabled:opacity-60"
              >
                {archiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                {archiving ? 'Archiving...' : 'Archive routine'}
              </button>
            </div>
          </GlassCard>
        </div>
      )}

      <CreateModal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create recurring task" onSubmit={handleCreate}>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Task name *</label><input value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} placeholder="e.g. Morning workout" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" required /></div>
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label><textarea value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} placeholder="What does this routine involve?" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 resize-none h-20" /></div>
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Days *</label><div className="flex gap-2 flex-wrap">{weekdays.map((day, i) => <button key={day} type="button" onClick={() => toggleDay(i)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all border', newTask.schedules.includes(i) ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' : 'bg-white/[0.035] text-slate-400 border-white/10 hover:bg-white/5')}>{day}</button>)}</div></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Preferred time</label><input type="time" value={newTask.preferredTime} onChange={(e) => setNewTask({ ...newTask, preferredTime: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" /></div>
            <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Category</label><input value={newTask.category} onChange={(e) => setNewTask({ ...newTask, category: e.target.value })} placeholder="e.g. Health" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" /></div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/10 p-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-2"><Bell className="w-4 h-4 text-[var(--theme-primary)] mt-0.5" /><div><p className="text-sm font-medium text-white">Reminders</p><p className="text-xs text-slate-400 mt-0.5">Time helps CrysTrack prompt you; completion still counts any time that day.</p></div></div>
              <button type="button" onClick={() => setNewTask({ ...newTask, remindersEnabled: !newTask.remindersEnabled })} className={cn('w-11 h-6 rounded-full relative transition-colors shrink-0', newTask.remindersEnabled ? 'bg-[var(--theme-primary)]' : 'bg-white/10')}><span className={cn('absolute top-1 w-4 h-4 rounded-full bg-white transition-all', newTask.remindersEnabled ? 'left-6' : 'left-1')} /></button>
            </div>
            {newTask.remindersEnabled && (
              <>
                <div><label className="block text-xs text-slate-400 mb-1.5">Delivery channel</label><select value={newTask.reminderChannel} onChange={(e) => setNewTask({ ...newTask, reminderChannel: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"><option value="push" className="bg-slate-950">Web Push</option><option value="telegram" className="bg-slate-950">Telegram</option><option value="both" className="bg-slate-950">Web Push + Telegram</option></select></div>
                {newTask.preferredTime && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="block text-xs text-slate-400 mb-1.5">Before preferred time</label><select value={newTask.beforeMinutes} onChange={(e) => setNewTask({ ...newTask, beforeMinutes: Number(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"><option value={0} className="bg-slate-950">No early reminder</option><option value={10} className="bg-slate-950">10 minutes before</option><option value={15} className="bg-slate-950">15 minutes before</option><option value={30} className="bg-slate-950">30 minutes before</option><option value={60} className="bg-slate-950">1 hour before</option></select></div>
                    <label className="flex items-center gap-2 text-xs text-slate-300 mt-6"><input type="checkbox" checked={newTask.atPreferredTime} onChange={(e) => setNewTask({ ...newTask, atPreferredTime: e.target.checked })} /> Remind me at the preferred time</label>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300"><label className="flex items-center gap-2"><input type="checkbox" checked={newTask.followUp} onChange={(e) => setNewTask({ ...newTask, followUp: e.target.checked })} /> Follow up later if still incomplete</label><label className="flex items-center gap-2"><input type="checkbox" checked={newTask.endOfDayReminder} onChange={(e) => setNewTask({ ...newTask, endOfDayReminder: e.target.checked })} /> End-of-day reminder if still incomplete</label></div>
              </>
            )}
          </div>
        </div>
      </CreateModal>
    </div>
  );
}
