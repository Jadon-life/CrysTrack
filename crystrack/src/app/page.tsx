'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Flame,
  History,
  Lightbulb,
  Loader2,
  Plus,
  Sparkles,
  Target,
  TimerReset,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';
import { FocusTimer } from '@/components/dashboard/focus-timer';
import { MiniCalendar } from '@/components/dashboard/mini-calendar';
import { QuickCapture } from '@/components/dashboard/quick-capture';
import { useAuth } from '@/components/layout/auth-provider';
import { useTheme } from '@/components/layout/theme-provider';
import { useWealthCurrency } from '@/lib/wealth-currency';
import { formatWealthMoney } from '@/lib/wealth';
import { fetcher } from '@/lib/api';
import { getLocalDateKey } from '@/lib/utils';
import { EXPERIENCE_CONFIG } from '@/config/experience';

function greetingForPhase(phase: string) {
  if (phase === 'morning') return 'Good morning';
  if (phase === 'day') return 'Good afternoon';
  if (phase === 'golden' || phase === 'evening') return 'Good evening';
  return 'Good night';
}

function checkInDue(goal: any) {
  const config = goal.checkin_config || {};
  const frequency = config.frequency || 'weekly';
  const weekday = new Date().getDay();
  const scheduled = frequency === 'daily' || (Array.isArray(config.days) && config.days.map(Number).includes(weekday));
  if (!scheduled) return false;
  return !(goal.goal_checkins || []).some((item: any) => new Date(item.created_at).toDateString() === new Date().toDateString());
}

function goalPercent(goal: any) {
  if (goal.progress_mode !== 'percentage' && !goal.measurable) return null;
  const start = goal.starting_value == null ? 0 : Number(goal.starting_value);
  const current = Number(goal.progress_value ?? start);
  const target = Number(goal.target_value);
  if (!Number.isFinite(target) || target === start) return null;
  return Math.max(0, Math.min(100, Math.round(((current - start) / (target - start)) * 100)));
}

function focusSecondsForDate(date: Date) {
  if (typeof window === 'undefined') return 0;
  const key = getLocalDateKey(date);
  return Number(window.localStorage.getItem(`crystrack-focus-seconds:${key}`) || 0);
}

function focusLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function completionStreak(history: any[]) {
  const days = new Set(
    history
      .filter((item) => item.type === 'task_completed')
      .map((item) => new Date(item.created_at).toDateString()),
  );

  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 60; i += 1) {
    if (!days.has(cursor.toDateString())) {
      if (i === 0) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    }
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { environment } = useTheme();
  const { currency, rate } = useWealthCurrency();

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [wealth, setWealth] = useState<any>({ summary: null, entries: [], targets: [], debts: [], expectedFlows: [] });
  const [focusSeconds, setFocusSeconds] = useState(0);

  const load = async () => {
    setLoading(true);
    const weekday = new Date().getDay();
    const date = getLocalDateKey();

    const [taskData, goalData, assignmentData, historyData, reminderData, wealthData] = await Promise.all([
      fetcher(`/api/tasks?date=${date}&weekday=${weekday}`).catch(() => []),
      fetcher('/api/goals').catch(() => []),
      fetcher('/api/assignments').catch(() => []),
      fetcher('/api/history').catch(() => []),
      fetcher('/api/reminders?limit=8').catch(() => []),
      fetcher('/api/wealth').catch(() => ({ summary: null, entries: [], targets: [], debts: [], expectedFlows: [] })),
    ]);

    setTasks(taskData);
    setGoals(goalData);
    setAssignments(assignmentData);
    setHistory(historyData);
    setReminders(reminderData);
    setWealth(wealthData);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    setFocusSeconds(focusSecondsForDate(new Date()));

    const onFocusUpdate = (event: Event) => {
      const custom = event as CustomEvent<{ seconds?: number }>;
      setFocusSeconds(Number(custom.detail?.seconds || focusSecondsForDate(new Date())));
    };
    window.addEventListener('crystrack:focus-update', onFocusUpdate);
    return () => window.removeEventListener('crystrack:focus-update', onFocusUpdate);
  }, []);

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'there';

  const todayTasks = useMemo(
    () => tasks
      .filter((task) => task.scheduled_today)
      .sort((a, b) => (a.preferred_time || '99:99').localeCompare(b.preferred_time || '99:99')),
    [tasks],
  );

  const completedTasks = todayTasks.filter((task) => task.today_status === 'completed').length;
  const taskCompletionPct = todayTasks.length ? Math.round((completedTasks / todayTasks.length) * 100) : 0;
  const activeGoals = goals.filter((goal) => goal.status === 'active' || !goal.status);
  const dueGoals = activeGoals.filter(checkInDue);
  const goalPercents = activeGoals.map(goalPercent).filter((value): value is number => value != null);
  const goalsAverage = goalPercents.length ? Math.round(goalPercents.reduce((sum, value) => sum + value, 0) / goalPercents.length) : null;
  const urgentAssignments = assignments.filter((item) => item.computed_status === 'overdue' || item.computed_status === 'due_today').length;
  const streak = completionStreak(history);
  const wealthSummary = wealth.summary;

  const money = (value: number, compact = false) =>
    formatWealthMoney(Number(value || 0), currency, rate?.usdNgn, { compact });

  const lastSevenFocusSeconds = useMemo(() => {
    if (typeof window === 'undefined') return 0;
    let total = 0;
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      total += focusSecondsForDate(date);
    }
    return total;
  }, [focusSeconds]);

  const goalExecution = activeGoals.length
    ? ((activeGoals.length - dueGoals.length) / activeGoals.length) * 100
    : 100;
  const executionScore = Math.round((todayTasks.length ? taskCompletionPct : 100) * 0.7 + goalExecution * 0.3);

  const summaryCards = [
    {
      label: 'Tasks Today',
      value: `${completedTasks}/${todayTasks.length}`,
      note: todayTasks.length ? `${taskCompletionPct}% completed` : 'Nothing scheduled',
      icon: CheckCircle2,
      tone: 'text-emerald-300',
    },
    {
      label: 'Goals Progress',
      value: goalsAverage == null ? `${activeGoals.length}` : `${goalsAverage}%`,
      note: dueGoals.length ? `${dueGoals.length} check-in${dueGoals.length === 1 ? '' : 's'} due` : 'On track',
      icon: Target,
      tone: 'text-sky-300',
    },
    {
      label: 'Assignments',
      value: String(assignments.length),
      note: urgentAssignments ? `${urgentAssignments} need attention` : 'No immediate deadline',
      icon: BriefcaseBusiness,
      tone: 'text-orange-300',
    },
    {
      label: 'Focus Time',
      value: focusLabel(focusSeconds),
      note: 'Today',
      icon: TimerReset,
      tone: 'text-violet-300',
    },
    {
      label: 'Available',
      value: money(wealthSummary?.availableBalance || 0, true),
      note: `${currency} view · actual ledger`,
      icon: WalletCards,
      tone: 'text-emerald-300',
    },
  ];

  if (loading) {
    return <div className="min-h-[55vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[var(--theme-primary)]" /></div>;
  }

  return (
    <div className="space-y-4 pb-6">
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 px-1">
        <div>
          <h1 className="dashboard-hero-title text-3xl sm:text-4xl font-semibold">
            {greetingForPhase(environment.phase)}, {displayName} <span aria-hidden="true">👋</span>
          </h1>
          <p className="dashboard-hero-copy text-sm mt-2">Stay focused. Small actions today, meaningful progress tomorrow.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-[var(--theme-border)] bg-black/25 backdrop-blur-md px-3 py-1.5 text-[11px] text-white/85">
            {environment.city || 'Local'} · {environment.temperatureC == null ? '--' : `${Math.round(environment.temperatureC)}°C`}
          </span>
          <Link href="/plan" className="glass-button-primary inline-flex items-center gap-2"><Plus className="w-4 h-4" />Quick add</Link>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {summaryCards.map(({ label, value, note, icon: Icon, tone }) => (
          <GlassCard key={label} padding="md">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium text-white/90">{label}</p>
                <p className="dashboard-metric-value text-2xl font-semibold text-white mt-2 truncate">{value}</p>
                <p className="text-[10px] text-[var(--theme-text-muted)] mt-1">{note}</p>
              </div>
              <div className={`w-10 h-10 rounded-full grid place-items-center bg-black/15 border border-white/10 ${tone}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
          </GlassCard>
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        <div className="xl:col-span-3 space-y-3">
          <GlassCard padding="md">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="dashboard-panel-title text-sm">Today&apos;s Tasks</p>
                <p className="text-[10px] text-[var(--theme-text-muted)] mt-1">{completedTasks} of {todayTasks.length} completed</p>
              </div>
              <Link href="/tasks" className="text-[10px] rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-white/85">View all</Link>
            </div>

            <div className="h-1.5 rounded-full bg-black/20 overflow-hidden mb-3">
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${taskCompletionPct}%` }} />
            </div>

            <div className="divide-y divide-white/[0.08]">
              {todayTasks.slice(0, 7).map((task) => (
                <div key={task.id} className="flex items-center gap-3 py-2.5">
                  <span className={
                    task.today_status === 'completed'
                      ? 'w-5 h-5 rounded-md bg-emerald-500/85 text-slate-950 grid place-items-center'
                      : 'w-5 h-5 rounded-md border border-white/30 grid place-items-center'
                  }>
                    {task.today_status === 'completed' && <Check className="w-3.5 h-3.5" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs truncate ${task.today_status === 'completed' ? 'text-white/55 line-through' : 'text-white'}`}>{task.title}</p>
                  </div>
                  <span className="text-[10px] text-[var(--theme-text-muted)]">{task.preferred_time || 'Any time'}</span>
                </div>
              ))}
              {!todayTasks.length && <p className="text-xs text-[var(--theme-text-muted)] py-6 text-center">Nothing scheduled today.</p>}
            </div>
            <Link href="/tasks" className="inline-flex items-center gap-1 text-xs text-[var(--theme-primary)] mt-3"><Plus className="w-3 h-3" />Add Task</Link>
          </GlassCard>

          <GlassCard padding="md">
            <p className="dashboard-panel-title text-sm mb-4">Focus Timer</p>
            <FocusTimer />
          </GlassCard>
        </div>

        <div className="xl:col-span-6 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <GlassCard padding="md">
              <div className="flex items-center justify-between mb-3">
                <p className="dashboard-panel-title text-sm">Goals Progress</p>
                <Link href="/goals" className="text-[10px] rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-white/85">View all</Link>
              </div>
              <div className="space-y-2.5">
                {activeGoals.slice(0, 4).map((goal) => {
                  const percent = goalPercent(goal);
                  return (
                    <div key={goal.id} className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-violet-500/10 border border-violet-400/20 grid place-items-center text-violet-300"><Target className="w-4 h-4" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-medium text-white truncate">{goal.title}</p>
                          <span className="text-[10px] text-white/90">{percent == null ? (checkInDue(goal) ? 'Due' : 'Active') : `${percent}%`}</span>
                        </div>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-1.5">
                          <div className="h-full bg-[var(--theme-primary)] rounded-full" style={{ width: `${percent ?? (checkInDue(goal) ? 25 : 65)}%` }} />
                        </div>
                        <p className="text-[9px] text-[var(--theme-text-muted)] mt-1">{checkInDue(goal) ? 'Check-in due today' : 'Check-in up to date'}</p>
                      </div>
                    </div>
                  );
                })}
                {!activeGoals.length && <p className="text-xs text-[var(--theme-text-muted)] py-6 text-center">No active goals.</p>}
              </div>
            </GlassCard>

            <GlassCard padding="md">
              <div className="flex items-center justify-between mb-3">
                <p className="dashboard-panel-title text-sm">Assignments</p>
                <Link href="/assignments" className="text-[10px] rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-white/85">View all</Link>
              </div>
              <div className="space-y-2">
                {assignments.slice(0, 4).map((assignment) => {
                  const overdue = assignment.computed_status === 'overdue';
                  return (
                    <div key={assignment.id} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/10 px-3 py-2.5">
                      <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 grid place-items-center text-white/75"><CalendarClock className="w-4 h-4" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white truncate">{assignment.title}</p>
                        <p className="text-[9px] text-[var(--theme-text-muted)] mt-1">{new Date(assignment.deadline).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      {overdue ? <AlertTriangle className="w-4 h-4 text-red-300" /> : <ChevronRight className="w-4 h-4 text-white/35" />}
                    </div>
                  );
                })}
                {!assignments.length && <p className="text-xs text-[var(--theme-text-muted)] py-6 text-center">No active assignments.</p>}
              </div>
              <Link href="/assignments" className="inline-flex items-center gap-1 text-xs text-[var(--theme-primary)] mt-3"><Plus className="w-3 h-3" />Add Assignment</Link>
            </GlassCard>
          </div>

          <div className="grid md:grid-cols-5 gap-3">
            <GlassCard padding="md" className="md:col-span-3">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="dashboard-panel-title text-sm">Wealth Overview</p>
                  <p className="text-[10px] text-[var(--theme-text-muted)] mt-1">Real ledger · {currency} view</p>
                </div>
                <Link href="/finance" className="text-[10px] rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-white/85">Open Wealth</Link>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                  <p className="text-[9px] text-[var(--theme-text-muted)]">Available</p>
                  <p className="wealth-number text-sm font-semibold text-emerald-300 mt-1">{money(wealthSummary?.availableBalance || 0, true)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                  <p className="text-[9px] text-[var(--theme-text-muted)]">Expenses</p>
                  <p className="wealth-number text-sm font-semibold text-red-300 mt-1">{money(wealthSummary?.monthExpenses || 0, true)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                  <p className="text-[9px] text-[var(--theme-text-muted)]">Saved</p>
                  <p className="wealth-number text-sm font-semibold text-sky-300 mt-1">{money(wealthSummary?.savedBalance || 0, true)}</p>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-white/85">Spending pattern</p>
                  <p className="text-[10px] text-[var(--theme-text-muted)] capitalize">{wealthSummary?.spendingVelocity || 'learning'}</p>
                </div>
                <div className="space-y-2 mt-2">
                  {(wealthSummary?.categoryPatterns || []).slice(0, 3).map((item: any) => (
                    <div key={item.category}>
                      <div className="flex items-center justify-between text-[9px]">
                        <span className="text-[var(--theme-text-muted)]">{item.category}</span>
                        <span className="text-white">{Math.round(item.sharePct)}%</span>
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-1">
                        <div className="h-full bg-[var(--theme-primary)] rounded-full" style={{ width: `${Math.min(100, item.sharePct)}%` }} />
                      </div>
                    </div>
                  ))}
                  {!(wealthSummary?.categoryPatterns || []).length && <p className="text-[10px] text-[var(--theme-text-muted)]">Add expenses to begin learning your pattern.</p>}
                </div>
              </div>
            </GlassCard>

            <GlassCard padding="md" className="md:col-span-2">
              <p className="dashboard-panel-title text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-[var(--theme-primary)]" /> AI Insight</p>
              <div className="rounded-xl border border-white/10 bg-black/10 p-3 mt-3">
                <p className="text-xs font-semibold text-white">{executionScore >= 70 ? 'You’re moving well.' : executionScore >= 45 ? 'A few things need attention.' : 'Today needs a reset.'}</p>
                <p className="text-[10px] leading-relaxed text-white/80 mt-2">{wealthSummary?.deterministicRemark || 'CrysTrack is learning your activity and money patterns from real recorded data.'}</p>
              </div>
              <div className="flex items-end justify-between mt-4">
                <div>
                  <p className="text-[9px] text-[var(--theme-text-muted)]">Execution score</p>
                  <p className="dashboard-metric-value text-3xl font-semibold text-white mt-1">{executionScore}<span className="text-xs text-white/45">/100</span></p>
                </div>
                <TrendingUp className="w-8 h-8 text-emerald-300" />
              </div>
            </GlassCard>
          </div>
        </div>

        <div className="xl:col-span-3 space-y-3">
          <GlassCard padding="md">
            <MiniCalendar eventDates={assignments.map((item) => item.deadline).filter(Boolean)} />
          </GlassCard>

          <GlassCard padding="md">
            <div className="flex items-center justify-between mb-3">
              <p className="dashboard-panel-title text-sm">Upcoming Reminders</p>
              <Link href="/settings" className="text-[10px] rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-white/85">View all</Link>
            </div>
            <div className="divide-y divide-white/[0.08]">
              {reminders.slice(0, 5).map((item) => (
                <div key={item.id} className="flex items-center gap-3 py-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 grid place-items-center text-[var(--theme-primary)]"><Bell className="w-3.5 h-3.5" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{item.title || item.entity_type?.replaceAll('_', ' ') || 'Reminder'}</p>
                    <p className="text-[9px] text-[var(--theme-text-muted)] mt-1">{item.scheduled_for ? new Date(item.scheduled_for).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'Scheduled'}</p>
                  </div>
                </div>
              ))}
              {!reminders.length && <p className="text-xs text-[var(--theme-text-muted)] py-5 text-center">No upcoming reminders.</p>}
            </div>
          </GlassCard>

          <GlassCard padding="md">
            <QuickCapture />
          </GlassCard>
        </div>
      </section>

      <section className="dashboard-bottom-rail rounded-2xl px-4 py-3 grid md:grid-cols-[1fr_auto_1.2fr_auto] gap-4 items-center">
        <p className="text-sm italic text-white/85">“{EXPERIENCE_CONFIG.dashboard.quote}”</p>
        <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
          <Flame className="w-4 h-4 text-orange-300" />
          <span className="text-xs font-semibold text-white">{streak} day streak</span>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-[10px] text-[var(--theme-text-muted)] whitespace-nowrap">Focus this week: <span className="text-white">{focusLabel(lastSevenFocusSeconds)}</span></p>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden flex-1">
            <div className="h-full bg-[var(--theme-accent)] rounded-full" style={{ width: `${Math.min(100, (lastSevenFocusSeconds / (15 * 60 * 60)) * 100)}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/history" className="glass-button inline-flex items-center gap-2 text-xs"><History className="w-4 h-4" />History</Link>
          <Link href="/insights" className="glass-button inline-flex items-center gap-2 text-xs"><Lightbulb className="w-4 h-4" />Insights</Link>
        </div>
      </section>
    </div>
  );
}
