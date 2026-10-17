'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Loader2,
  MessageSquareText,
  Plus,
  RotateCcw,
  SkipForward,
  Target,
} from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';
import { MiniCalendar } from '@/components/dashboard/mini-calendar';
import { useAuth } from '@/components/layout/auth-provider';
import { useTheme } from '@/components/layout/theme-provider';
import { fetcher, post } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  dayInTimezone,
  dueSoonAssignments,
  groupTodayTasks,
  nextTodayTaskStatus,
  summarizeToday,
  type TodayMutation,
} from '@/lib/today-progress';

function greetingForLocalTime(localTime: string) {
  const hour = Number(
    localTime.slice(11, 13),
  );

  if (!Number.isFinite(hour)) {
    return 'Hello';
  }

  if (hour >= 5 && hour < 12) {
    return 'Good morning';
  }

  if (hour >= 12 && hour < 17) {
    return 'Good afternoon';
  }

  if (hour >= 17 && hour < 21) {
    return 'Good evening';
  }

  return 'Good night';
}

function checkInDue(goal: any, dateKey: string, weekday: number, timezone: string) {
  const config = goal.checkin_config || {};
  const frequency = config.frequency || 'weekly';
  const scheduled =
    frequency === 'daily' ||
    (Array.isArray(config.days) && config.days.map(Number).includes(weekday));

  if (!scheduled) return false;

  return !(goal.goal_checkins || []).some((item: any) => {
    const date = new Date(item.created_at);
    return !Number.isNaN(date.getTime()) && dayInTimezone(timezone, date).dateKey === dateKey;
  });
}

function goalPercent(goal: any) {
  if (goal.progress_mode !== 'percentage' && !goal.measurable) return null;

  const start = goal.starting_value == null ? 0 : Number(goal.starting_value);
  const current = Number(goal.progress_value ?? start);
  const target = Number(goal.target_value);

  if (!Number.isFinite(target) || target === start) return null;

  return Math.max(
    0,
    Math.min(100, Math.round(((current - start) / (target - start)) * 100)),
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { environment } = useTheme();

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [wealth, setWealth] = useState<any>({
    summary: null,
    entries: [],
    targets: [],
    debts: [],
    expectedFlows: [],
  });
  const [history, setHistory] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [dayContext, setDayContext] = useState<{ dateKey: string; weekday: number; timezone: string } | null>(null);
  const [taskError, setTaskError] = useState('');
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [undoAction, setUndoAction] = useState<{ taskId: string; title: string; action: TodayMutation; dateKey: string } | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);

      // Use the saved profile timezone for the daily date and task schedule.
      const profile = await fetcher('/api/profile').catch(() => null);
      const timezone = profile?.timezone || profile?.current_timezone || environment.timezone || 'UTC';
      const context = { ...dayInTimezone(timezone), timezone };
      const date = context.dateKey;
      const weekday = context.weekday;

      const [
        taskData,
        goalData,
        assignmentData,
        wealthData,
        historyData,
        reminderData,
      ] = await Promise.all([
        fetcher(`/api/tasks?date=${date}&weekday=${weekday}`).catch(() => []),
        fetcher('/api/goals').catch(() => []),
        fetcher('/api/assignments').catch(() => []),
        fetcher('/api/wealth').catch(() => ({
          summary: null,
          entries: [],
          targets: [],
          debts: [],
          expectedFlows: [],
        })),
        fetcher('/api/history').catch(() => []),
        fetcher('/api/reminders?limit=6').catch(() => []),
      ]);

      if (!active) return;
      setDayContext(context);
      setTasks(Array.isArray(taskData) ? taskData : []);
      setGoals(Array.isArray(goalData) ? goalData : []);
      setAssignments(Array.isArray(assignmentData) ? assignmentData : []);
      setWealth(wealthData);
      setHistory(Array.isArray(historyData) ? historyData : []);
      setReminders(Array.isArray(reminderData) ? reminderData : []);
      setLoading(false);
    };

    void load();
    return () => { active = false; };
  }, [environment.timezone]);

  useEffect(() => {
    if (!undoAction) return;
    const timeout = window.setTimeout(() => setUndoAction(null), 7000);
    return () => window.clearTimeout(timeout);
  }, [undoAction]);

  const changeTask = async (
    task: any,
    action: TodayMutation,
    undo = false,
    undoDate?: string,
  ) => {
    if (!dayContext || busyTaskId) return;
    const date = undoDate || dayContext.dateKey;
    if (date !== dayContext.dateKey || dayInTimezone(dayContext.timezone).dateKey !== dayContext.dateKey) {
      setTaskError('The day has changed. Refresh Today before making another change.');
      return;
    }

    const before = task.today_status || 'pending';
    const next = nextTodayTaskStatus(before, action);
    if (!next) return;

    setBusyTaskId(task.id);
    setTaskError('');
    setTasks((current) => current.map((entry) =>
      entry.id === task.id ? { ...entry, today_status: next } : entry));

    try {
      const occurrence = await post(
        `/api/tasks/${encodeURIComponent(task.id)}/occurrences/${date}/${action}`, {},
      );
      setTasks((current) => current.map((entry) =>
        entry.id === task.id ? { ...entry, today_status: occurrence?.status || next } : entry));
      const refreshed = await fetcher(
        `/api/tasks?date=${dayContext.dateKey}&weekday=${dayContext.weekday}`,
      ).catch(() => null);
      if (Array.isArray(refreshed)) setTasks(refreshed);

      if (undo) {
        setUndoAction(null);
      } else {
        setUndoAction({ taskId: task.id, title: task.title, action, dateKey: date });
      }
      window.dispatchEvent(new Event('crystrack-activity-updated'));
    } catch (error) {
      setTasks((current) => current.map((entry) =>
        entry.id === task.id ? { ...entry, today_status: before } : entry));
      setTaskError(error instanceof Error ? error.message : 'Could not update this task. Please try again.');
    } finally {
      setBusyTaskId(null);
    }
  };

  const undoLastTaskAction = () => {
    if (!undoAction) return;
    const task = tasks.find((entry) => entry.id === undoAction.taskId);
    if (task) void changeTask(task, undoAction.action, true, undoAction.dateKey);
  };

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'there';

  const todayTasks = useMemo(
    () => tasks.filter((task) => task.scheduled_today),
    [tasks],
  );
  const todayGroups = useMemo(() => groupTodayTasks(todayTasks), [todayTasks]);
  const progress = summarizeToday(tasks);
  const completedTasks = progress.completed;
  const dueGoals = dayContext
    ? goals.filter((goal) => checkInDue(goal, dayContext.dateKey, dayContext.weekday, dayContext.timezone))
    : [];
  const upcomingAssignments = dueSoonAssignments(assignments);

  const urgentAssignments = assignments.filter(
    (item) =>
      item.computed_status === 'overdue' ||
      item.computed_status === 'due_today',
  ).length;

  const wealthSummary = wealth.summary || {};
  const totalSavings = Number(wealthSummary.savedBalance || 0);

  const summary = [
    {
      href: '/tasks',
      label: 'Tasks today',
      value: `${completedTasks}/${todayTasks.length}`,
      note: todayTasks.length
        ? `${Math.round((completedTasks / todayTasks.length) * 100)}% complete`
        : 'Nothing scheduled',
      icon: CheckCircle2,
      tone: 'text-emerald-300',
    },
    {
      href: '/goals',
      label: 'Goal check-ins',
      value: String(dueGoals.length),
      note: dueGoals.length ? 'need attention today' : 'all caught up',
      icon: Target,
      tone: 'text-violet-300',
    },
    {
      href: '/assignments',
      label: 'Assignments',
      value: String(assignments.length),
      note: urgentAssignments
        ? `${urgentAssignments} urgent today`
        : 'no immediate deadline',
      icon: CalendarClock,
      tone: 'text-amber-300',
    },
    {
      href: '/finance',
      label: 'Savings logged',
      value: formatCurrency(totalSavings),
      note: 'from recorded saving entries',
      icon: CircleDollarSign,
      tone: 'text-sky-300',
    },
  ];

  if (loading) {
    return (
      <div className="min-h-[55vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--theme-primary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-6">
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 px-1 scenic-readable-copy">
        <div>
          <p className="text-sm text-white/75">{greetingForLocalTime(environment.localTime)},</p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white mt-1">
            {displayName}
          </h1>
          <p className="text-sm text-[var(--theme-text-muted)] mt-2">
            See what needs attention, act on it, and keep moving.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--theme-border)] bg-black/20 px-3 py-1.5 text-xs text-[var(--theme-text-muted)]">
            {environment.city || 'Local'} ·{' '}
            {environment.temperatureC == null
              ? '--'
              : `${Math.round(environment.temperatureC)}°C`}
          </span>
          <Link
            href="/plan"
            className="glass-button-primary inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Quick add
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {summary.map(({ label, value, note, icon: Icon, tone, href }) => (
          <GlassCard key={label} padding="md">
            <div className="flex items-center justify-between">
              <div className={tone}>
                <Icon className="w-5 h-5" />
              </div>
              <Link href={href} aria-label={`Open ${label}`} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--theme-primary)] hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <p className="text-xs text-[var(--theme-text-muted)] mt-1">{label}</p>
            <p className="text-2xl font-semibold text-white mt-1 truncate">{value}</p>
            <p className="text-xs leading-relaxed text-[var(--theme-text-muted)] mt-1">{note}</p>
          </GlassCard>
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <GlassCard padding="md" className="xl:col-span-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Today&apos;s tasks</p>
              <p className="text-xs text-[var(--theme-text-muted)] mt-1" aria-live="polite">
                {progress.total === 0
                  ? 'Nothing scheduled today'
                  : `${progress.completed} of ${progress.total} done · ${progress.remaining} left`}
                {progress.skipped > 0 ? ` · ${progress.skipped} skipped` : ''}
              </p>
            </div>
            <div className="relative h-[72px] w-[72px] shrink-0" role="img" aria-label={`${progress.percent}% of scheduled tasks completed`}>
              <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden="true">
                <circle cx="40" cy="40" r="31" pathLength="100" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="7" />
                <circle cx="40" cy="40" r="31" pathLength="100" fill="none" stroke="var(--theme-primary)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${progress.percent} 100`} />
              </svg>
              <span className="absolute inset-0 grid place-items-center text-sm font-semibold text-white">{progress.percent}%</span>
            </div>
          </div>

          {progress.allDone && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100" role="status">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> All done today
            </div>
          )}
          {taskError && (
            <p className="mb-3 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">{taskError}</p>
          )}
          {undoAction && (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-[var(--theme-border)] bg-white/[0.06] px-3 py-2" role="status">
              <p className="min-w-0 truncate text-xs text-white">
                {undoAction.action === 'skip' ? 'Skip saved' : 'Task updated'}: {undoAction.title}
              </p>
              <button type="button" disabled={busyTaskId !== null} onClick={undoLastTaskAction} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-[var(--theme-primary)] hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:opacity-50">
                <RotateCcw className="h-3.5 w-3.5" /> Undo
              </button>
            </div>
          )}

          <div className="max-h-[28rem] space-y-4 overflow-y-auto pr-1">
            {todayTasks.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-5 text-center">
                <p className="text-sm font-medium text-white">Nothing scheduled today</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--theme-text-muted)]">
                  Your next routines will appear here on their scheduled days.
                </p>
              </div>
            ) : todayGroups.map((group) => (
              <div key={group.key} className="space-y-1.5">
                <p className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--theme-text-muted)]">{group.label}</p>
                {group.tasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 rounded-xl px-1.5 py-1.5 hover:bg-white/[0.04]">
                    <button
                      type="button"
                      aria-label={task.today_status === 'completed' ? `Mark ${task.title} incomplete` : `Complete ${task.title}`}
                      aria-pressed={task.today_status === 'completed'}
                      disabled={busyTaskId !== null || task.today_status === 'skipped' || task.today_status === 'missed'}
                      onClick={() => void changeTask(task, 'toggle')}
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:opacity-50 ${
                        task.today_status === 'completed'
                          ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                          : 'border-white/20 text-white/50 hover:border-[var(--theme-primary)]'
                      }`}
                    >
                      {busyTaskId === task.id ? <Loader2 className="h-4 w-4 animate-spin" /> : task.today_status === 'completed' ? <Check className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-current" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium break-words ${task.today_status === 'completed' ? 'text-white/55 line-through' : 'text-white'}`}>{task.title}</p>
                      <p className="text-xs text-[var(--theme-text-muted)]">
                        {task.preferred_time || 'Any time'}
                        {task.today_status === 'skipped' ? ' · Skipped' : ''}
                        {task.category ? ` · ${task.category}` : ''}
                      </p>
                    </div>
                    {task.today_status !== 'completed' && task.today_status !== 'missed' && (
                      <button
                        type="button"
                        disabled={busyTaskId !== null}
                        onClick={() => void changeTask(task, 'skip')}
                        className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-[var(--theme-text-muted)] hover:bg-white/10 hover:text-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:opacity-50"
                        aria-label={task.today_status === 'skipped' ? `Undo skip for ${task.title}` : `Skip ${task.title} today`}
                      >
                        <SkipForward className="h-3.5 w-3.5" />
                        {task.today_status === 'skipped' ? 'Unskip' : 'Skip'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="pt-3 mt-3 border-t border-white/10">
            <Link href="/tasks" className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-[var(--theme-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">
              Manage routines <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </GlassCard>

        <div className="xl:col-span-4 space-y-4">
          <GlassCard padding="md">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-white">Goal check-ins</p>
              <Link href="/goals" className="text-xs text-[var(--theme-primary)]">
                View all
              </Link>
            </div>

            <div className="space-y-3">
              {goals.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-4">
                  <p className="text-sm font-medium text-white">No active goals yet</p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--theme-text-muted)]">
                    Start with one outcome that matters to you.
                  </p>
                  <Link href="/goals" className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-[var(--theme-primary)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">
                    Explore goals <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ) : (
                goals.slice(0, 3).map((goal) => {
                  const percent = goalPercent(goal);
                  const latest = (goal.goal_checkins || []).find(
                    (item: any) => item.ai_analysis,
                  )?.ai_analysis;

                  return (
                    <div
                      key={goal.id}
                      className="rounded-xl border border-white/10 bg-black/10 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">
                            {goal.title}
                          </p>
                          <p className="text-xs text-[var(--theme-text-muted)] mt-1">
                            {dayContext && checkInDue(goal, dayContext.dateKey, dayContext.weekday, dayContext.timezone)
                              ? 'Check-in due today'
                              : 'Check-in up to date'}
                          </p>
                        </div>

                        {percent != null && (
                          <span className="text-xs font-semibold text-[var(--theme-primary)]">
                            {percent}%
                          </span>
                        )}
                      </div>

                      {percent != null && (
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-2">
                          <div
                            className="h-full bg-[var(--theme-primary)]"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      )}

                      {latest && (
                        <p className="text-xs text-white/65 mt-2 line-clamp-2">
                          AI: {latest.summary}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </GlassCard>

          <GlassCard padding="md">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-white">Wealth Overview</p>
                <p className="text-xs text-[var(--theme-text-muted)] mt-0.5">
                  Actual Naira ledger
                </p>
              </div>
              <Link href="/finance" className="text-xs text-[var(--theme-primary)]">
                Wealth
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs text-[var(--theme-text-muted)]">Available</p>
                <p className="wealth-number text-sm font-semibold text-emerald-300 mt-1">
                  {formatCurrency(Number(wealthSummary.availableBalance || 0))}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs text-[var(--theme-text-muted)]">Safe to spend</p>
                <p className="wealth-number text-sm font-semibold text-amber-300 mt-1">
                  {formatCurrency(Number(wealthSummary.safeToSpend || 0))}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs text-[var(--theme-text-muted)]">Net position</p>
                <p className="wealth-number text-sm font-semibold text-sky-300 mt-1">
                  {formatCurrency(Number(wealthSummary.netPosition || 0))}
                </p>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-white/85">Spending pattern</p>
                <p className="text-xs text-[var(--theme-text-muted)] capitalize">
                  {wealthSummary.spendingVelocity || 'learning'}
                </p>
              </div>

              {(wealthSummary.categoryPatterns || []).length === 0 ? (
                <p className="text-xs text-[var(--theme-text-muted)] mt-2">
                  Add expenses to begin learning your pattern.
                </p>
              ) : (
                <div className="space-y-2 mt-2">
                  {(wealthSummary.categoryPatterns || [])
                    .slice(0, 3)
                    .map((item: any) => (
                      <div key={item.category}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[var(--theme-text-muted)]">
                            {item.category}
                          </span>
                          <span className="text-white">
                            {Math.round(item.sharePct)}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full bg-[var(--theme-primary)] rounded-full"
                            style={{ width: `${Math.min(100, item.sharePct)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </GlassCard>
        </div>

        <div className="xl:col-span-3 space-y-4">
          <GlassCard padding="md">
            <MiniCalendar
              eventDates={assignments
                .map((item) => item.deadline)
                .filter(Boolean)}
            />
          </GlassCard>

          <GlassCard padding="md">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-white">
                Assignments & reminders
              </p>
              <Link
                href="/assignments"
                className="text-xs text-[var(--theme-primary)]"
              >
                View all
              </Link>
            </div>

            <div className="space-y-2">
              {upcomingAssignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="rounded-xl border border-white/10 bg-black/10 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-white line-clamp-1">
                      {assignment.title}
                    </p>
                    {assignment.computed_status === 'overdue' && (
                      <AlertTriangle className="w-3.5 h-3.5 text-red-300 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-[var(--theme-text-muted)] mt-1">
                    {new Date(assignment.deadline).toLocaleString([], {
                      weekday: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              ))}

              {upcomingAssignments.length === 0 && (
                <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-4">
                  <p className="text-sm font-medium text-white">Nothing due soon</p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--theme-text-muted)]">
                    Assignments approaching their deadlines will appear here.
                  </p>
                </div>
              )}
            </div>

            {reminders.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <div className="flex items-center gap-2 text-xs text-[var(--theme-text-muted)]">
                  <Bell className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
                  {reminders.length} reminder event
                  {reminders.length === 1 ? '' : 's'} visible
                </div>
              </div>
            )}
          </GlassCard>

          <GlassCard padding="md">
            <p className="text-sm font-semibold text-white">Daily reminder</p>
            <div className="mt-4 flex gap-3">
              <MessageSquareText className="w-4 h-4 text-[var(--theme-primary)] shrink-0" />
              <p className="text-xs leading-relaxed text-white/80">
                Small progress is still progress. CrysTrack records what you actually
                execute, not whether you followed a perfect clock.
              </p>
            </div>
          </GlassCard>
        </div>
      </section>

      <GlassCard padding="md">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-white">Recent activity</p>
          <Link href="/history" className="text-xs text-[var(--theme-primary)]">
            Full history
          </Link>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2">
          {history.length === 0 ? (
            <p className="text-sm leading-relaxed text-[var(--theme-text-muted)]">
              Completed routines, goal check-ins and other activity will appear here.
            </p>
          ) : (
            history.slice(0, 6).map((item: any) => (
              <div
                key={item.id}
                className="rounded-xl border border-white/10 bg-black/10 px-3 py-2.5"
              >
                <p className="text-xs text-white truncate">
                  {item.metadata_json?.title ||
                    item.type?.replaceAll('_', ' ') ||
                    'Activity'}
                </p>
                <p className="text-xs text-[var(--theme-text-muted)] mt-1">
                  {new Date(item.created_at).toLocaleString([], {
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            ))
          )}
        </div>
      </GlassCard>
    </div>
  );
}
