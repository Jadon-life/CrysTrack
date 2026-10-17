'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  Bell,
  BrainCircuit,
  Calendar,
  CheckCircle2,
  Loader2,
  MessageSquareText,
  Plus,
  Target,
  Trash2,
} from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';
import { DomainInsightCard } from '@/components/ai/domain-insight-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { GoalDialog as CreateModal } from '@/components/goals/goal-dialog';
import { GoalCard } from '@/components/goals/goal-card';
import { GoalDetails, GoalBadge } from '@/components/goals/goal-details';
import { GoalAtmosphere } from '@/components/goals/goal-atmosphere';
import { GoalDock } from '@/components/goals/goal-dock';
import { useTheme } from '@/components/layout/theme-provider';
import { dateKeyForInstant, localClock } from '@/lib/reminders';
import { goalThemeTokens } from '@/lib/theme';
import type { GoalMilestone, GoalPlan } from '@/types/goals';
import { del, fetcher, post, patch } from '@/lib/api';
import { cn, getRelativeTime } from '@/lib/utils';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const emptyCheckIn = {
  durationMinutes: '',
  responseText: '',
  learnedText: '',
  blockers: '',
  progressValue: '',
};

function newGoalState(timezone = 'UTC') {
  return {
    title: '',
    description: '',
    deadline: '',
    category: '',
    whyMatters: '',
    badge: 'target',
    progressSource: 'manual',
    routineTarget: 10,
    taskIds: [] as string[],
    financeTargetId: '',
    milestones: [] as GoalMilestone[],
    progressValue: '',
    progressMode: 'percentage',
    startingValue: '0',
    targetValue: '',
    progressUnit: '%',
    aiCoaching: false,
    checkinFrequency: 'weekly',
    checkinDays: [localClock(new Date(), timezone).weekday] as number[],
    checkinTime: '20:00',
    reminderChannel: 'push',
    deadlineReminders: true,
    deadlineOffsets: '10080, 4320, 1440',
    deadlineChannel: 'push',
  };
}

function goalPercent(goal: any) {
  if (goal.effort_percent != null) return goal.effort_percent;
  if (goal.progress_mode !== 'percentage' && !goal.measurable) return null;
  const start = goal.starting_value == null ? 0 : Number(goal.starting_value);
  const current = Number(goal.progress_value ?? start);
  const target = Number(goal.target_value);
  if (!Number.isFinite(target) || target === start) return null;
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(((current - start) / (target - start)) * 100 * 10) / 10,
    ),
  );
}

function checkInState(goal: any) {
  return (
    goal.checkin_state || {
      status: 'not_scheduled',
      due: false,
      available: false,
      completed: false,
    }
  );
}

function goalIsOverdue(goal: any) {
  if (!goal.deadline || goal.status !== 'active') return false;
  const deadline = new Date(goal.deadline).getTime();
  return Number.isFinite(deadline) && deadline < Date.now();
}

function latestAnalysis(goal: any) {
  return (
    (goal.goal_checkins || []).find((item: any) => item.ai_analysis)
      ?.ai_analysis || null
  );
}

function analysisTone(status: string) {
  if (status === 'strong_progress' || status === 'on_track')
    return 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10';
  if (status === 'needs_attention')
    return 'text-amber-200 border-amber-500/20 bg-amber-500/10';
  if (status === 'at_risk' || status === 'stalled')
    return 'text-red-200 border-red-500/20 bg-red-500/10';
  return 'text-slate-200 border-white/10 bg-white/5';
}

export default function GoalsPage() {
  const searchParams = useSearchParams();
  const { environment, reducedMotion } = useTheme();
  const [timezone, setTimezone] = useState('UTC');
  const [editing, setEditing] = useState<any>(null);
  const [view, setView] = useState('active');
  const [choices, setChoices] = useState<{ tasks: any[]; targets: any[] }>({
    tasks: [],
    targets: [],
  });
  const [lifecycle, setLifecycle] = useState<{
    goal: any;
    status: string;
  } | null>(null);
  const [reflection, setReflection] = useState('');
  const [notice, setNotice] = useState('');
  const [burst, setBurst] = useState(0);
  const [busyGoal, setBusyGoal] = useState<string | null>(null);
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [checkInGoal, setCheckInGoal] = useState<any | null>(null);
  const [checkIn, setCheckIn] = useState(emptyCheckIn);
  const [newGoal, setNewGoal] = useState(newGoalState());

  const loadGoals = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setGoals(await fetcher('/api/goals?status=all'));
    } catch (e: any) {
      setError(e.message || 'Failed to load goals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetcher('/api/profile'),
      fetcher('/api/tasks'),
      fetcher('/api/finance'),
    ])
      .then(([profile, tasks, wealth]) => {
        const zone = profile.current_timezone || profile.timezone || 'UTC';
        setTimezone(zone);
        setNewGoal((current) => ({
          ...current,
          checkinDays: [localClock(new Date(), zone).weekday],
        }));
        setChoices({
          tasks: Array.isArray(tasks) ? tasks : tasks.tasks || [],
          targets: wealth.targets || [],
        });
      })
      .catch(() =>
        setError('Some link choices could not load. Refresh to try again.'),
      );
    fetcher('/api/preferences')
      .then((prefs: any) => {
        const channels = prefs?.default_reminder_channels || ['push'];
        const reminderChannel =
          channels.includes('push') && channels.includes('telegram')
            ? 'both'
            : channels.includes('telegram')
              ? 'telegram'
              : 'push';
        setNewGoal((current: any) => ({ ...current, reminderChannel }));
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadGoals();
    });
  }, [loadGoals]);
  useEffect(() => {
    if (searchParams.get('create') !== 'goal') return;

    queueMicrotask(() => {
      setShowCreate(true);
    });
  }, [searchParams]);

  useEffect(() => {
    const refresh = () => {
      void loadGoals();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('crystrack-activity-updated', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('crystrack-activity-updated', refresh);
    };
  }, [loadGoals]);

  const toggleCheckinDay = (day: number) =>
    setNewGoal((current) => ({
      ...current,
      checkinDays:
        current.checkinFrequency === 'weekly'
          ? [day]
          : current.checkinDays.includes(day)
            ? current.checkinDays.filter((value) => value !== day)
            : [...current.checkinDays, day],
    }));

  const setCheckinFrequency = (frequency: string) =>
    setNewGoal((current) => ({
      ...current,
      checkinFrequency: frequency,
      checkinDays:
        frequency === 'daily'
          ? []
          : frequency === 'weekly'
            ? [
                current.checkinDays[0] ??
                  localClock(new Date(), timezone).weekday,
              ]
            : current.checkinDays.length
              ? current.checkinDays
              : [localClock(new Date(), timezone).weekday],
    }));

  const handleCreate = async () => {
    if (!newGoal.title.trim()) throw new Error('Title is required');
    if (
      newGoal.progressSource === 'manual' &&
      newGoal.progressMode === 'percentage' &&
      !newGoal.targetValue
    )
      throw new Error('Numeric goals need a target value');
    if (
      newGoal.checkinFrequency !== 'daily' &&
      newGoal.checkinDays.length === 0
    )
      throw new Error('Choose at least one check-in day');

    if (newGoal.progressSource === 'milestones' && !newGoal.milestones.length)
      throw new Error('Add a milestone to begin.');
    if (newGoal.progressSource === 'tasks' && !newGoal.taskIds.length)
      throw new Error('Choose a routine to connect.');
    const offsets = newGoal.deadlineOffsets
      .split(',')
      .map((v) => Number(v.trim()));
    if (offsets.some((v) => !Number.isInteger(v) || v < 0 || v > 525600))
      throw new Error('Use whole reminder minutes, separated by commas.');
    const save = editing
      ? (body: unknown) => patch(`/api/goals/${editing.id}`, body)
      : (body: unknown) => post('/api/goals', body);
    await save({
      ...(editing ? { expectedRevision: editing.revision } : {}),
      whyMatters: newGoal.whyMatters,
      badge: newGoal.badge,
      progressSource: newGoal.progressSource,
      routineTarget: newGoal.routineTarget,
      taskIds: newGoal.taskIds,
      financeTargetId: newGoal.financeTargetId || null,
      milestones: newGoal.milestones,
      ...(editing
        ? {
            progressValue:
              newGoal.progressMode === 'percentage'
                ? newGoal.progressValue || newGoal.startingValue
                : null,
          }
        : {}),
      title: newGoal.title,
      description: newGoal.description,
      deadline: newGoal.deadline || null,
      category: newGoal.category,
      progressMode: newGoal.progressMode,
      startingValue:
        newGoal.progressMode === 'percentage' ? newGoal.startingValue : null,
      targetValue:
        newGoal.progressMode === 'percentage'
          ? newGoal.targetValue || null
          : null,
      progressUnit:
        newGoal.progressMode === 'percentage' ? newGoal.progressUnit : null,
      aiCoaching: newGoal.progressMode === 'ai' ? true : newGoal.aiCoaching,
      checkinConfig: {
        frequency: newGoal.checkinFrequency,
        days: newGoal.checkinFrequency === 'daily' ? [] : newGoal.checkinDays,
        time: newGoal.checkinTime,
        channels:
          newGoal.reminderChannel === 'both'
            ? ['push', 'telegram']
            : [newGoal.reminderChannel],
      },
      deadlineReminderConfig: {
        enabled: Boolean(newGoal.deadline && newGoal.deadlineReminders),
        offsetMinutes: offsets,
        channels:
          newGoal.deadlineChannel === 'both'
            ? ['push', 'telegram']
            : [newGoal.deadlineChannel],
      },
    });
    await loadGoals();
    setNotice(editing ? 'Your goal has been updated.' : 'Your goal is ready.');
    setNewGoal((current) => ({
      ...newGoalState(timezone),
      reminderChannel: current.reminderChannel,
    }));
  };

  const editGoal = (goal: any) => {
    setEditing(goal);
    setNewGoal({
      ...newGoalState(timezone),
      title: goal.title,
      description: goal.description || '',
      category: goal.category || '',
      deadline: goal.deadline
        ? dateKeyForInstant(new Date(goal.deadline), timezone)
        : '',
      whyMatters: goal.why_matters || '',
      badge: goal.badge || 'target',
      progressSource: goal.progress_source || 'manual',
      routineTarget: goal.routine_target || 10,
      taskIds: goal.task_ids || [],
      financeTargetId: goal.finance_target_id || '',
      milestones: goal.milestones || [],
      progressMode: goal.progress_mode,
      startingValue: String(goal.starting_value ?? 0),
      targetValue: String(goal.target_value ?? ''),
      progressValue: String(goal.progress_value ?? 0),
      progressUnit: goal.progress_unit || '',
      aiCoaching: goal.ai_coaching,
      checkinFrequency: goal.checkin_config?.frequency || 'daily',
      checkinDays: goal.checkin_config?.days || [],
      checkinTime: goal.checkin_config?.time || '20:00',
      reminderChannel:
        goal.checkin_config?.channels?.length === 2
          ? 'both'
          : goal.checkin_config?.channels?.[0] || 'push',
      deadlineReminders: goal.deadline_reminder_config?.enabled !== false,
      deadlineOffsets: (
        goal.deadline_reminder_config?.offsetMinutes || [10080, 4320, 1440]
      ).join(', '),
      deadlineChannel:
        goal.deadline_reminder_config?.channels?.length === 2
          ? 'both'
          : goal.deadline_reminder_config?.channels?.[0] || 'push',
    });
    setShowCreate(true);
  };
  const toggleMilestone = async (goal: GoalPlan, id: string) => {
    if (busyGoal) return;
    setBusyGoal(goal.id);
    setError('');
    try {
      const milestones = goal.milestones.map((m) =>
        m.id === id
          ? {
              ...m,
              completedAt: m.completedAt ? null : new Date().toISOString(),
            }
          : m,
      );
      await patch(`/api/goals/${goal.id}`, {
        expectedRevision: goal.revision,
        milestones,
      });
      if (milestones.find((m) => m.id === id)?.completedAt) {
        setBurst((current) => current + 1);
        setNotice('A meaningful step forward.');
      }
      await loadGoals();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
      await loadGoals();
    } finally {
      setBusyGoal(null);
    }
  };
  const saveLifecycle = async () => {
    if (!lifecycle) return;
    if (lifecycle.status !== 'active' && !reflection.trim())
      throw new Error('Add a few words to reflect on this change.');
    await patch(`/api/goals/${lifecycle.goal.id}`, {
      expectedRevision: lifecycle.goal.revision,
      status: lifecycle.status,
      reflection: reflection.trim() || null,
    });
    setNotice(
      lifecycle.status === 'achieved'
        ? 'A moment worth celebrating. Your goal is on the trophy shelf.'
        : 'Your goal is ready for this next chapter.',
    );
    if (lifecycle.status === 'achieved') setBurst((current) => current + 1);
    await loadGoals();
  };

  const submitCheckIn = async () => {
    if (!checkInGoal) throw new Error('No goal selected');
    if (goalIsOverdue(checkInGoal))
      throw new Error('This goal deadline has passed. Check-ins are closed.');
    if (
      checkInGoal.progress_mode === 'ai' &&
      !checkIn.responseText.trim() &&
      !checkIn.learnedText.trim() &&
      !checkIn.blockers.trim()
    ) {
      throw new Error(
        'AI-assisted check-ins need a short description of what changed or what you did',
      );
    }
    const result = await post(`/api/goals/${checkInGoal.id}/checkins`, checkIn);
    await loadGoals();
    window.dispatchEvent(new Event('crystrack-activity-updated'));
    if (
      (checkInGoal.progress_mode === 'ai' || checkInGoal.ai_coaching) &&
      result?.aiConfigured === false
    ) {
      setError(
        'Check-in saved. Goal AI is ready in the code but will remain inactive until an OpenRouter API key is added to the server environment.',
      );
    } else if (result?.analysis?.status === 'unavailable') {
      setError(
        `Check-in saved. AI analysis could not run: ${result.analysis.summary}`,
      );
    }
    setCheckInGoal(null);
    setCheckIn(emptyCheckIn);
  };

  const handleDeleteGoal = async (goal: any) => {
    if (
      !window.confirm(
        `Delete "${goal.title}" permanently? This removes its check-ins, insights and reminders.`,
      )
    )
      return;
    setError('');
    try {
      await del(`/api/goals/${goal.id}`);
      if (checkInGoal?.id === goal.id) {
        setCheckInGoal(null);
        setCheckIn(emptyCheckIn);
      }
      await loadGoals();
      window.dispatchEvent(new Event('crystrack-activity-updated'));
    } catch (e: any) {
      setError(e.message || 'Failed to delete goal');
    }
  };

  const checkInsDue = useMemo(
    () =>
      goals.filter(
        (goal) =>
          goal.status === 'active' &&
          !goalIsOverdue(goal) &&
          checkInState(goal).due,
      ),
    [goals],
  );

  return (
    <div
      className="goal-workspace space-y-6"
      style={goalThemeTokens as React.CSSProperties}
    >

      {notice && (
        <div role="status" className="goal-notice">
          <span>{notice}</span>
          <button onClick={() => setView('achieved')}>View shelf</button>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice('')}
          >
            ×
          </button>
        </div>
      )}
      {burst > 0 && !reducedMotion && (
        <div key={burst} aria-hidden="true" className="goal-particles">
          {Array.from({ length: 12 }, (_, i) => (
            <i key={i} style={{ '--particle': i } as React.CSSProperties} />
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-primary)]">
            Plan · Direction
          </p>
          <h1 className="text-2xl font-bold text-white mt-1">Goals worth growing into.</h1>
          <p className="text-sm text-[var(--theme-text-muted)] mt-1">
            Give your next chapter a direction. Connect small steps, daily
            effort, and the things you’re saving for.
          </p>
        </div>
        <Button
          variant="primary"
          className="goal-primary"
          onClick={() => {
            setEditing(null);
            setNewGoal(newGoalState(timezone));
            setShowCreate(true);
          }}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          New goal
        </Button>
      </div>

      <nav className="goal-tabs" aria-label="Goal lifecycle">
        {[
          ['active', 'In motion'],
          ['paused', 'Resting'],
          ['achieved', 'Achieved · Trophy shelf'],
          ['let_go', 'Let go'],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={view === key}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      <DomainInsightCard domain="goals" />

      {checkInsDue.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-300" />
            <p className="text-sm text-amber-100">
              {checkInsDue.length} scheduled goal check-in
              {checkInsDue.length === 1 ? '' : 's'} due today.
            </p>
          </div>
          <button
            onClick={() => setCheckInGoal(checkInsDue[0])}
            className="text-xs font-semibold text-amber-200"
          >
            Review now
          </button>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-[var(--theme-primary)] animate-spin" />
        </div>
      )}
      {!loading && goals.filter((g) => g.status === view).length === 0 && (
        <GlassCard padding="lg" className="text-center py-12">
          <p className="text-[var(--theme-text-muted)]">
            A little space for your next chapter. Your goals will appear here.
          </p>
        </GlassCard>
      )}

      <div
        className={cn(
          'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4',
          view === 'achieved' && 'goal-trophy-shelf',
        )}
      >
        {goals
          .filter((goal) => goal.status === view)
          .map((goal: any, index: number) => {
            const percent = goalPercent(goal);
            const state = checkInState(goal);
            const overdue = goalIsOverdue(goal);
            const due = !overdue && state.due;
            const analysis = latestAnalysis(goal);
            const start =
              goal.starting_value == null ? 0 : Number(goal.starting_value);
            const current = Number(goal.progress_value ?? start);
            return (
              <GoalCard
                key={goal.id}
                padding="md"
                hover={!overdue}
                className={cn(
                  'animate-enter goal-card',
                  view === 'achieved' && 'goal-trophy-card',
                )}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <GoalBadge
                      badge={goal.badge}
                      achieved={goal.status === 'achieved'}
                    />
                    <StatusBadge status={overdue ? 'overdue' : goal.status} />
                  </div>
                  <span className="text-xs uppercase tracking-wide text-[var(--theme-text-muted)]">
                    {goal.progress_mode === 'ai' ? 'AI assisted' : 'Numeric'}
                  </span>
                </div>
                <h3 id={'goal-'+goal.id} className="text-lg font-semibold text-white">
                  {goal.title}
                </h3>
                {goal.description && (
                  <p className="text-sm text-[var(--theme-text-muted)] mt-1 line-clamp-2">
                    {goal.description}
                  </p>
                )}

                <GoalDetails
                  goal={goal}
                  busy={busyGoal === goal.id}
                  onMilestone={(id) => void toggleMilestone(goal, id)}
                />
                {analysis && (
                  <div
                    className={cn(
                      'mt-4 rounded-xl border p-3',
                      analysisTone(analysis.status),
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <BrainCircuit className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wide">
                        {String(analysis.status).replaceAll('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed mt-2 text-white/90">
                      {analysis.summary}
                    </p>
                    {analysis.next_action && (
                      <p className="text-xs mt-2 text-white/70">
                        <strong>Next:</strong> {analysis.next_action}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 text-xs text-[var(--theme-text-muted)] mt-4 mb-4">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>
                      {goal.deadline
                        ? getRelativeTime(goal.deadline)
                        : 'No deadline'}
                    </span>
                  </div>
                  {overdue ? (
                    <span className="text-slate-400">Deadline passed</span>
                  ) : (
                    due && <span className="text-amber-200">Check-in due</span>
                  )}
                </div>
                <div className="flex items-stretch gap-2">
                  <button type="button" onClick={() => editGoal(goal)}>
                    Edit
                  </button>
                  {overdue ? (
                    <div className="flex-1 inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2 text-xs font-medium text-slate-400">
                      Deadline passed — check-ins closed
                    </div>
                  ) : (
                    <Button
                      variant={due ? 'primary' : 'default'}
                      size="sm"
                      className={cn('flex-1', due && 'goal-primary')}
                      disabled={goal.status !== 'active' || !state.available}
                      onClick={() => {
                        setCheckInGoal(goal);
                        setCheckIn({
                          ...emptyCheckIn,
                          progressValue: percent != null ? String(current) : '',
                        });
                      }}
                    >
                      <MessageSquareText className="w-4 h-4 mr-1.5" />
                      {state.completed
                        ? 'Checked in'
                        : state.available
                          ? 'Check in'
                          : 'Not scheduled today'}
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDeleteGoal(goal)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/20"
                    title="Delete goal permanently"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                </div>
                <div className="goal-lifecycle-actions">
                  {(goal.status === 'active'
                    ? ['achieved', 'paused', 'let_go']
                    : ['active']
                  ).map((status) => (
                    <button
                      key={status}
                      onClick={() => {
                        setLifecycle({ goal, status });
                        setReflection('');
                      }}
                    >
                      {
                        (
                          {
                            achieved: 'Celebrate achievement',
                            paused: 'Pause',
                            let_go: 'Let go',
                            active: 'Pick this back up',
                          } as Record<string, string>
                        )[status]
                      }
                    </button>
                  ))}
                </div>
              </GoalCard>
            );
          })}
      </div>

      <CreateModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title={editing ? 'Edit goal' : 'Create goal'}
        onSubmit={handleCreate}
      >
        <div className="space-y-4">
          <div>
            <label
              htmlFor="goal-editor-field-1"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Goal *
            </label>
            <input
              id="goal-editor-field-1"
              value={newGoal.title}
              onChange={(e) =>
                setNewGoal({ ...newGoal, title: e.target.value })
              }
              placeholder="e.g. Gain 10kg by December 13"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-500"
            />
          </div>
          <div>
            <label
              htmlFor="goal-editor-field-2"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Describe the outcome
            </label>
            <textarea
              id="goal-editor-field-2"
              value={newGoal.description}
              onChange={(e) =>
                setNewGoal({ ...newGoal, description: e.target.value })
              }
              placeholder="What would success look like?"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white resize-none h-20"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="goal-editor-field-3"
                className="block text-sm font-medium text-slate-300 mb-1.5"
              >
                Deadline
              </label>
              <input
                id="goal-editor-field-3"
                type="date"
                value={newGoal.deadline}
                onChange={(e) =>
                  setNewGoal({ ...newGoal, deadline: e.target.value })
                }
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white"
              />
            </div>
            <div>
              <label
                htmlFor="goal-editor-field-4"
                className="block text-sm font-medium text-slate-300 mb-1.5"
              >
                Category
              </label>
              <input
                id="goal-editor-field-4"
                value={newGoal.category}
                onChange={(e) =>
                  setNewGoal({ ...newGoal, category: e.target.value })
                }
                placeholder="Fitness, Learning, Project…"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white"
              />
            </div>
          </div>

          <label className="goal-field">
            Why this matters
            <textarea
              value={newGoal.whyMatters}
              onChange={(e) =>
                setNewGoal({ ...newGoal, whyMatters: e.target.value })
              }
              placeholder="A reminder from you, for you."
            />
          </label>
          <label className="goal-field">
            Badge
            <select
              value={newGoal.badge}
              onChange={(e) =>
                setNewGoal({ ...newGoal, badge: e.target.value })
              }
            >
              {['target', 'book', 'heart', 'sparkles', 'mountain'].map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <label className="goal-field">
            Effort progress source
            <select
              value={newGoal.progressSource}
              onChange={(e) =>
                setNewGoal({ ...newGoal, progressSource: e.target.value })
              }
            >
              <option value="manual">Measured check-ins</option>
              <option value="milestones">Milestone completion</option>
              <option value="tasks">Linked routine completions</option>
            </select>
          </label>
          <section className="goal-editor-section">
            <h3>Dated milestones</h3>
            {newGoal.milestones.map((m, i) => (
              <div key={m.id} className="goal-step-editor">
                <label>
                  Step title
                  <input
                    value={m.title}
                    onChange={(e) =>
                      setNewGoal({
                        ...newGoal,
                        milestones: newGoal.milestones.map((v, n) =>
                          n === i ? { ...v, title: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Step date
                  <input
                    type="date"
                    value={m.dueDate || ''}
                    onChange={(e) =>
                      setNewGoal({
                        ...newGoal,
                        milestones: newGoal.milestones.map((v, n) =>
                          n === i
                            ? { ...v, dueDate: e.target.value || null }
                            : v,
                        ),
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Remove step ${i + 1}`}
                  onClick={() =>
                    setNewGoal({
                      ...newGoal,
                      milestones: newGoal.milestones.filter((_, n) => n !== i),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setNewGoal({
                  ...newGoal,
                  milestones: [
                    ...newGoal.milestones,
                    {
                      id: crypto.randomUUID(),
                      title: '',
                      dueDate: null,
                      completedAt: null,
                    },
                  ],
                })
              }
            >
              Add milestone
            </button>
          </section>
          <section className="goal-editor-section">
            <h3>Link routines</h3>
            {[
              ...choices.tasks,
              ...newGoal.taskIds
                .filter((id) => !choices.tasks.some((t) => t.id === id))
                .map((id) => ({ id, title: 'Previously linked routine' })),
            ].map((t) => (
              <label key={t.id} className="goal-task-choice">
                <input
                  type="checkbox"
                  checked={newGoal.taskIds.includes(t.id)}
                  onChange={(e) =>
                    setNewGoal({
                      ...newGoal,
                      taskIds: e.target.checked
                        ? [...newGoal.taskIds, t.id]
                        : newGoal.taskIds.filter((id) => id !== t.id),
                    })
                  }
                />
                {t.title}
              </label>
            ))}
            <label className="goal-field">
              Routine completions to aim for
              <input
                type="number"
                min="1"
                max="100000"
                value={newGoal.routineTarget}
                onChange={(e) =>
                  setNewGoal({
                    ...newGoal,
                    routineTarget: Number(e.target.value),
                  })
                }
              />
            </label>
            <p>
              Completions count from the local date you connect these routines.
              Undoing a completion updates your goal too.
            </p>
          </section>
          <label className="goal-field">
            Wealth target
            <select
              value={newGoal.financeTargetId}
              onChange={(e) =>
                setNewGoal({ ...newGoal, financeTargetId: e.target.value })
              }
            >
              <option value="">No financial target</option>
              {choices.targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
              {newGoal.financeTargetId &&
                !choices.targets.some(
                  (t) => t.id === newGoal.financeTargetId,
                ) && (
                  <option value={newGoal.financeTargetId}>
                    Previously linked target
                  </option>
                )}
            </select>
          </label>
          {editing && newGoal.progressSource === 'manual' && (
            <label className="goal-field">
              Current measured value
              <input
                type="number"
                step="0.01"
                value={newGoal.progressValue}
                onChange={(e) =>
                  setNewGoal({ ...newGoal, progressValue: e.target.value })
                }
              />
            </label>
          )}
          <div className="rounded-xl border border-white/10 bg-black/10 p-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-white">
                How should progress be tracked?
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Use numbers when the outcome has a real measurement; use AI when
                progress is better described through evidence.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  setNewGoal({ ...newGoal, progressMode: 'percentage' })
                }
                className={cn(
                  'rounded-xl border p-3 text-left',
                  newGoal.progressMode === 'percentage'
                    ? 'border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_14%,transparent)]'
                    : 'border-white/10 bg-white/[0.03]',
                )}
              >
                <p className="text-xs font-semibold text-white">
                  Numeric / Percentage
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Weight, books, pages, %, projects…
                </p>
              </button>
              <button
                type="button"
                onClick={() =>
                  setNewGoal({
                    ...newGoal,
                    progressMode: 'ai',
                    aiCoaching: true,
                  })
                }
                className={cn(
                  'rounded-xl border p-3 text-left',
                  newGoal.progressMode === 'ai'
                    ? 'border-violet-400/50 bg-violet-500/10'
                    : 'border-white/10 bg-white/[0.03]',
                )}
              >
                <p className="text-xs font-semibold text-white">AI-assisted</p>
                <p className="text-xs text-slate-400 mt-1">
                  Six-pack, learning mastery, project quality…
                </p>
              </button>
            </div>
            {newGoal.progressMode === 'percentage' && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label
                      htmlFor="goal-editor-field-5"
                      className="block text-xs text-slate-400 mb-1"
                    >
                      Starting
                    </label>
                    <input
                      id="goal-editor-field-5"
                      type="number"
                      value={newGoal.startingValue}
                      onChange={(e) =>
                        setNewGoal({
                          ...newGoal,
                          startingValue: e.target.value,
                        })
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="goal-editor-field-6"
                      className="block text-xs text-slate-400 mb-1"
                    >
                      Target
                    </label>
                    <input
                      id="goal-editor-field-6"
                      type="number"
                      value={newGoal.targetValue}
                      onChange={(e) =>
                        setNewGoal({ ...newGoal, targetValue: e.target.value })
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="goal-editor-field-7"
                      className="block text-xs text-slate-400 mb-1"
                    >
                      Unit
                    </label>
                    <input
                      id="goal-editor-field-7"
                      value={newGoal.progressUnit}
                      onChange={(e) =>
                        setNewGoal({ ...newGoal, progressUnit: e.target.value })
                      }
                      placeholder="kg, books, %"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={newGoal.aiCoaching}
                    onChange={(e) =>
                      setNewGoal({ ...newGoal, aiCoaching: e.target.checked })
                    }
                  />{' '}
                  Add AI coaching to my numeric check-ins
                </label>
              </>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/10 p-4 space-y-4">
            <div className="flex gap-2">
              <Bell className="w-4 h-4 text-[var(--theme-primary)] mt-0.5" />
              <div>
                <p className="text-sm font-medium text-white">
                  Check-in rhythm
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Choose a rhythm that supports you. Each check-in is a chance
                  to reflect and begin again.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="goal-editor-field-8"
                  className="block text-xs text-slate-400 mb-1"
                >
                  Frequency
                </label>
                <select
                  id="goal-editor-field-8"
                  value={newGoal.checkinFrequency}
                  onChange={(e) => setCheckinFrequency(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="daily" className="bg-slate-950">
                    Daily
                  </option>
                  <option value="weekly" className="bg-slate-950">
                    Weekly
                  </option>
                  <option value="specific" className="bg-slate-950">
                    Specific days
                  </option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="goal-editor-field-9"
                  className="block text-xs text-slate-400 mb-1"
                >
                  Check-in time
                </label>
                <input
                  id="goal-editor-field-9"
                  type="time"
                  value={newGoal.checkinTime}
                  onChange={(e) =>
                    setNewGoal({ ...newGoal, checkinTime: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
            {newGoal.checkinFrequency !== 'daily' && (
              <div className="flex flex-wrap gap-2">
                {weekdays.map((day, index) => (
                  <button
                    type="button"
                    key={day}
                    onClick={() => toggleCheckinDay(index)}
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg border text-xs',
                      newGoal.checkinDays.includes(index)
                        ? 'border-[var(--theme-primary)] text-white bg-white/10'
                        : 'border-white/10 text-slate-400',
                    )}
                  >
                    {day}
                  </button>
                ))}
              </div>
            )}
            <div>
              <label
                htmlFor="goal-editor-field-10"
                className="block text-xs text-slate-400 mb-1"
              >
                Reminder channel
              </label>
              <select
                id="goal-editor-field-10"
                value={newGoal.reminderChannel}
                onChange={(e) =>
                  setNewGoal({ ...newGoal, reminderChannel: e.target.value })
                }
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="push" className="bg-slate-950">
                  Web Push
                </option>
                <option value="telegram" className="bg-slate-950">
                  Telegram
                </option>
                <option value="both" className="bg-slate-950">
                  Web Push + Telegram
                </option>
              </select>
            </div>
            <label className="goal-field">
              Deadline reminder minutes before deadline
              <input
                value={newGoal.deadlineOffsets}
                onChange={(e) =>
                  setNewGoal({ ...newGoal, deadlineOffsets: e.target.value })
                }
              />
            </label>
            <label className="goal-field">
              Deadline reminder channel
              <select
                value={newGoal.deadlineChannel}
                onChange={(e) =>
                  setNewGoal({ ...newGoal, deadlineChannel: e.target.value })
                }
              >
                <option value="push">Web Push</option>
                <option value="telegram">Telegram</option>
                <option value="both">Both</option>
              </select>
            </label>
            {newGoal.deadline && (
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={newGoal.deadlineReminders}
                  onChange={(e) =>
                    setNewGoal({
                      ...newGoal,
                      deadlineReminders: e.target.checked,
                    })
                  }
                />{' '}
                Warn me as the goal deadline approaches
              </label>
            )}
          </div>
        </div>
      </CreateModal>

      <CreateModal
        isOpen={Boolean(checkInGoal)}
        onClose={() => {
          setCheckInGoal(null);
          setCheckIn(emptyCheckIn);
        }}
        title={
          checkInGoal ? `Check in · ${checkInGoal.title}` : 'Goal check-in'
        }
        onSubmit={submitCheckIn}
      >
        <div className="space-y-4">
          {checkInGoal?.why_matters && (
            <blockquote className="goal-why">
              <strong>Why this matters</strong>
              <p>{checkInGoal.why_matters}</p>
            </blockquote>
          )}
          {checkInGoal?.progress_mode === 'percentage' &&
            (checkInGoal.progress_source || 'manual') === 'manual' && (
              <div>
                <label
                  htmlFor="goal-editor-field-11"
                  className="block text-sm font-medium text-slate-300 mb-1.5"
                >
                  Current {checkInGoal.progress_unit || 'value'}
                </label>
                <input
                  id="goal-editor-field-11"
                  type="number"
                  value={checkIn.progressValue}
                  onChange={(e) =>
                    setCheckIn({ ...checkIn, progressValue: e.target.value })
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white"
                />
                <p className="text-xs text-slate-500 mt-1">
                  CrysTrack calculates the real percentage from your starting
                  and target values.
                </p>
              </div>
            )}
          <div>
            <label
              htmlFor="goal-editor-field-12"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              What moved forward?
            </label>
            <textarea
              id="goal-editor-field-12"
              value={checkIn.responseText}
              onChange={(e) =>
                setCheckIn({ ...checkIn, responseText: e.target.value })
              }
              placeholder={
                checkInGoal?.progress_mode === 'ai'
                  ? 'Describe what you did or what changed. The AI will compare it with the goal and previous check-ins.'
                  : 'Optional evidence or context for this progress update.'
              }
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white resize-none h-24"
            />
          </div>
          <div>
            <label
              htmlFor="goal-editor-field-13"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              What did you learn?
            </label>
            <textarea
              id="goal-editor-field-13"
              value={checkIn.learnedText}
              onChange={(e) =>
                setCheckIn({ ...checkIn, learnedText: e.target.value })
              }
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white resize-none h-16"
            />
          </div>
          <div>
            <label
              htmlFor="goal-editor-field-14"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Blockers
            </label>
            <textarea
              id="goal-editor-field-14"
              value={checkIn.blockers}
              onChange={(e) =>
                setCheckIn({ ...checkIn, blockers: e.target.value })
              }
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white resize-none h-16"
            />
          </div>
          <div>
            <label
              htmlFor="goal-editor-field-15"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Minutes spent
            </label>
            <input
              id="goal-editor-field-15"
              type="number"
              min="0"
              value={checkIn.durationMinutes}
              onChange={(e) =>
                setCheckIn({ ...checkIn, durationMinutes: e.target.value })
              }
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white"
            />
          </div>
          {(checkInGoal?.progress_mode === 'ai' ||
            checkInGoal?.ai_coaching) && (
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-3 text-xs text-violet-100">
              <div className="flex gap-2">
                <BrainCircuit className="w-4 h-4 shrink-0" />
                <p>
                  CrysTrack will analyze this evidence against the exact goal,
                  deadline and prior check-ins. It will not invent measurements
                  or fake percentages.
                </p>
              </div>
            </div>
          )}
        </div>
      </CreateModal>
      <CreateModal
        isOpen={Boolean(lifecycle)}
        onClose={() => setLifecycle(null)}
        title={
          lifecycle?.status === 'achieved'
            ? 'Celebrate your achievement'
            : lifecycle?.status === 'paused'
              ? 'Make room to rest'
              : lifecycle?.status === 'let_go'
                ? 'A thoughtful next chapter'
                : 'Ready to pick this back up?'
        }
        onSubmit={saveLifecycle}
      >
        <label className="goal-field">
          {lifecycle?.status === 'achieved'
            ? 'What helped you get here?'
            : lifecycle?.status === 'paused'
              ? 'What would make returning feel easier?'
              : lifecycle?.status === 'let_go'
                ? 'What will you take with you?'
                : 'What feels possible now?'}
          <textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            required={lifecycle?.status !== 'active'}
          />
        </label>
      </CreateModal>
    </div>
  );
}
