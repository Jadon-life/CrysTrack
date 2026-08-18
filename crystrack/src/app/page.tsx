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
  Target,
} from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';
import { MiniCalendar } from '@/components/dashboard/mini-calendar';
import { useAuth } from '@/components/layout/auth-provider';
import { useTheme } from '@/components/layout/theme-provider';
import { fetcher } from '@/lib/api';
import { formatCurrency, getLocalDateKey } from '@/lib/utils';

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
  const scheduled =
    frequency === 'daily' ||
    (Array.isArray(config.days) && config.days.map(Number).includes(weekday));

  if (!scheduled) return false;

  return !(goal.goal_checkins || []).some(
    (item: any) =>
      new Date(item.created_at).toDateString() === new Date().toDateString(),
  );
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

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const weekday = new Date().getDay();
      const date = getLocalDateKey();

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

      setTasks(taskData);
      setGoals(goalData);
      setAssignments(assignmentData);
      setWealth(wealthData);
      setHistory(historyData);
      setReminders(reminderData);
      setLoading(false);
    };

    void load();
  }, []);

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'there';

  const todayTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.scheduled_today)
        .sort((a, b) =>
          (a.preferred_time || '99:99').localeCompare(
            b.preferred_time || '99:99',
          ),
        ),
    [tasks],
  );

  const completedTasks = todayTasks.filter(
    (task) => task.today_status === 'completed',
  ).length;

  const dueGoals = goals.filter(checkInDue);

  const urgentAssignments = assignments.filter(
    (item) =>
      item.computed_status === 'overdue' ||
      item.computed_status === 'due_today',
  ).length;

  const wealthSummary = wealth.summary || {};
  const totalSavings = Number(wealthSummary.savedBalance || 0);

  const summary = [
    {
      label: 'Tasks today',
      value: `${completedTasks}/${todayTasks.length}`,
      note: todayTasks.length
        ? `${Math.round((completedTasks / todayTasks.length) * 100)}% complete`
        : 'Nothing scheduled',
      icon: CheckCircle2,
      tone: 'text-emerald-300',
    },
    {
      label: 'Goal check-ins',
      value: String(dueGoals.length),
      note: dueGoals.length ? 'need attention today' : 'all caught up',
      icon: Target,
      tone: 'text-violet-300',
    },
    {
      label: 'Assignments',
      value: String(assignments.length),
      note: urgentAssignments
        ? `${urgentAssignments} urgent today`
        : 'no immediate deadline',
      icon: CalendarClock,
      tone: 'text-amber-300',
    },
    {
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
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 px-1">
        <div>
          <p className="text-sm text-white/75">{greetingForPhase(environment.phase)},</p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white mt-1">
            {displayName} <span aria-hidden="true">👋</span>
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
        {summary.map(({ label, value, note, icon: Icon, tone }) => (
          <GlassCard key={label} padding="md">
            <div className="flex items-center justify-between">
              <div className={tone}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
            <p className="text-xs text-[var(--theme-text-muted)] mt-4">{label}</p>
            <p className="text-2xl font-semibold text-white mt-1 truncate">{value}</p>
            <p className="text-[11px] text-[var(--theme-text-muted)] mt-1">{note}</p>
          </GlassCard>
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <GlassCard padding="md" className="xl:col-span-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-white">Today&apos;s plan</p>
              <p className="text-[11px] text-[var(--theme-text-muted)]">
                Execution matters more than the exact time.
              </p>
            </div>
            <Link href="/tasks" className="text-xs text-[var(--theme-primary)]">
              View all
            </Link>
          </div>

          <div className="space-y-1.5">
            {todayTasks.length === 0 ? (
              <p className="text-xs text-[var(--theme-text-muted)] py-6 text-center">
                No routines scheduled today.
              </p>
            ) : (
              todayTasks.slice(0, 7).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 hover:bg-white/[0.04]"
                >
                  <span
                    className={
                      task.today_status === 'completed'
                        ? 'w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-300 grid place-items-center'
                        : task.today_status === 'skipped'
                          ? 'w-6 h-6 rounded-full bg-amber-500/10 text-amber-300 grid place-items-center'
                          : 'w-6 h-6 rounded-full border border-white/20 grid place-items-center text-transparent'
                    }
                  >
                    {task.today_status === 'completed' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      '•'
                    )}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-medium truncate ${
                        task.today_status === 'completed'
                          ? 'text-white/45 line-through'
                          : 'text-white'
                      }`}
                    >
                      {task.title}
                    </p>
                    <p className="text-[10px] text-[var(--theme-text-muted)]">
                      {task.preferred_time || 'Any time today'}
                      {task.category ? ` · ${task.category}` : ''}
                    </p>
                  </div>

                  <span className="text-[10px] uppercase tracking-wide text-[var(--theme-text-muted)]">
                    {task.today_status}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="pt-3 mt-3 border-t border-white/10">
            <Link
              href="/tasks"
              className="text-xs text-[var(--theme-primary)] inline-flex items-center gap-1"
            >
              Manage routines <ArrowRight className="w-3 h-3" />
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
                <p className="text-xs text-[var(--theme-text-muted)] py-4">
                  No active goals.
                </p>
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
                          <p className="text-[10px] text-[var(--theme-text-muted)] mt-1">
                            {checkInDue(goal)
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
                        <p className="text-[10px] text-white/65 mt-2 line-clamp-2">
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
                <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">
                  Actual Naira ledger
                </p>
              </div>
              <Link href="/finance" className="text-xs text-[var(--theme-primary)]">
                Wealth
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                <p className="text-[10px] text-[var(--theme-text-muted)]">Available</p>
                <p className="wealth-number text-sm font-semibold text-emerald-300 mt-1">
                  {formatCurrency(Number(wealthSummary.availableBalance || 0))}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                <p className="text-[10px] text-[var(--theme-text-muted)]">Safe to spend</p>
                <p className="wealth-number text-sm font-semibold text-amber-300 mt-1">
                  {formatCurrency(Number(wealthSummary.safeToSpend || 0))}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                <p className="text-[10px] text-[var(--theme-text-muted)]">Net position</p>
                <p className="wealth-number text-sm font-semibold text-sky-300 mt-1">
                  {formatCurrency(Number(wealthSummary.netPosition || 0))}
                </p>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-white/85">Spending pattern</p>
                <p className="text-[10px] text-[var(--theme-text-muted)] capitalize">
                  {wealthSummary.spendingVelocity || 'learning'}
                </p>
              </div>

              {(wealthSummary.categoryPatterns || []).length === 0 ? (
                <p className="text-[10px] text-[var(--theme-text-muted)] mt-2">
                  Add expenses to begin learning your pattern.
                </p>
              ) : (
                <div className="space-y-2 mt-2">
                  {(wealthSummary.categoryPatterns || [])
                    .slice(0, 3)
                    .map((item: any) => (
                      <div key={item.category}>
                        <div className="flex items-center justify-between text-[9px]">
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
              {assignments.slice(0, 4).map((assignment) => (
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
                  <p className="text-[10px] text-[var(--theme-text-muted)] mt-1">
                    {new Date(assignment.deadline).toLocaleString([], {
                      weekday: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              ))}

              {assignments.length === 0 && (
                <p className="text-xs text-[var(--theme-text-muted)] py-4">
                  No active assignments.
                </p>
              )}
            </div>

            {reminders.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <div className="flex items-center gap-2 text-[11px] text-[var(--theme-text-muted)]">
                  <Bell className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
                  {reminders.length} reminder event
                  {reminders.length === 1 ? '' : 's'} visible
                </div>
              </div>
            )}
          </GlassCard>

          <GlassCard padding="md">
            <p className="text-sm font-semibold text-white">Today note</p>
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
            <p className="text-xs text-[var(--theme-text-muted)]">
              Your activity will appear here.
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
                <p className="text-[10px] text-[var(--theme-text-muted)] mt-1">
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
