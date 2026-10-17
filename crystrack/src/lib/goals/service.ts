import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { dateKeyForInstant } from '@/lib/reminders';
import { goalCheckinState } from './checkin-occurrence';
import {
  goalPacing,
  milestonePercentage,
  numericPercentage,
  routinePercentage,
} from './progress';
import type { GoalPlan } from '@/types/goals';
export function goalError(error: { code?: string; message?: string }) {
  console.error('Goal operation failed:', error);
  const status =
    error.code === '40001'
      ? 409
      : error.code === 'P0002'
        ? 404
        : error.code === '42501'
          ? 403
          : ['22023', '23514', '23503', '22P02'].includes(error.code || '')
            ? 400
            : 500;
  return NextResponse.json(
    {
      error:
        status === 409
          ? 'This goal changed. Refresh and try again.'
          : status === 404
            ? 'Goal not found'
            : status === 403
              ? 'Choose your own routines and Wealth targets.'
              : status === 400
                ? 'Check your goal details and try again.'
                : 'We could not save this goal. Please try again.',
    },
    { status },
  );
}
/** Convert a saved-zone calendar date to its final instant, including DST transitions. */
export function deadlineInstant(day: string, timezone: string) {
  if (day.includes('T')) return day;
  let low = Date.parse(`${day}T00:00:00Z`) - 86400000,
    high = low + 3 * 86400000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (dateKeyForInstant(new Date(middle), timezone) <= day) low = middle;
    else high = middle;
  }
  return new Date(low).toISOString();
}
export async function savedTimezone(
  db: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data, error } = await db
    .from('profiles')
    .select('timezone, current_timezone')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  const timezone = data?.current_timezone || data?.timezone || 'UTC';
  new Intl.DateTimeFormat('en', { timeZone: timezone });
  return timezone;
}
export function planPayload(body: Record<string, unknown>, timezone: string) {
  const map: Record<string, string> = {
    progressMode: 'progress_mode',
    startingValue: 'starting_value',
    targetValue: 'target_value',
    progressValue: 'progress_value',
    progressUnit: 'progress_unit',
    aiCoaching: 'ai_coaching',
    checkinConfig: 'checkin_config',
    deadlineReminderConfig: 'deadline_reminder_config',
    whyMatters: 'why_matters',
    progressSource: 'progress_source',
    routineTarget: 'routine_target',
    financeTargetId: 'finance_target_id',
    taskIds: 'task_ids',
  };
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body))
    if (key !== 'expectedRevision')
      result[map[key] || key] =
        key === 'deadline' && typeof value === 'string'
          ? deadlineInstant(value, timezone)
          : value;
  if (body.progressMode) result.measurable = body.progressMode === 'percentage';
  return result;
}
export async function loadGoals(
  db: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  all = false,
) {
  const timezone = await savedTimezone(db, userId);
  let query = db
    .from('goals')
    .select('*, goal_checkins(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (!all) query = query.eq('status', 'active');
  const { data, error } = await query;
  if (error) throw error;
  const ids = [
    ...new Set((data || []).flatMap((g) => g.task_ids || [])),
  ] as string[];
  const targetIds = [
    ...new Set((data || []).map((g) => g.finance_target_id).filter(Boolean)),
  ] as string[];
  const [tasks, targets] = await Promise.all([
    ids.length
      ? db
          .from('recurring_tasks')
          .select('id, task_occurrences(date, status, completed_at)')
          .eq('user_id', userId)
          .in('id', ids)
      : { data: [], error: null },
    targetIds.length
      ? db
          .from('finance_targets')
          .select('id,title,current_amount,target_amount')
          .eq('user_id', userId)
          .in('id', targetIds)
      : { data: [], error: null },
  ]);
  if (tasks.error) throw tasks.error;
  if (targets.error) throw targets.error;
  const now = new Date(),
    today = dateKeyForInstant(now, timezone);
  return (data || []).map((raw) => {
    const goal = raw as GoalPlan;
    const checkins = [...(goal.goal_checkins || [])].sort(
      (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
    );
    const startDay = dateKeyForInstant(
      new Date(goal.linked_at || goal.created_at),
      timezone,
    );
    // Occurrence dates are calendar keys stored at UTC midnight; completion instants use the saved zone.
    const events = (tasks.data || [])
      .filter((t) => (goal.task_ids || []).includes(t.id))
      .flatMap((t) => t.task_occurrences || [])
      .filter(
        (o) =>
          o.status === 'completed' &&
          o.completed_at &&
          Date.parse(o.completed_at) <= now.getTime() &&
          o.date.slice(0, 10) >= startDay &&
          o.date.slice(0, 10) <= today,
      );
    const completedTasks = events.length;
    const milestones = goal.milestones || [];
    const percent =
      goal.progress_source === 'milestones'
        ? milestonePercentage(milestones)
        : goal.progress_source === 'tasks'
          ? routinePercentage(completedTasks, goal.routine_target)
          : numericPercentage(
              Number(goal.progress_value ?? goal.starting_value ?? 0),
              Number(goal.starting_value ?? 0),
              Number(goal.target_value),
            );
    let points = checkins
      .filter(
        (c) =>
          c.progress_percent != null &&
          Date.parse(c.created_at) >=
            Date.parse(goal.linked_at || goal.created_at),
      )
      .map((c) => ({
        day: dateKeyForInstant(new Date(c.created_at), timezone),
        percent: Number(c.progress_percent),
      }));
    if (goal.progress_source !== 'manual') {
      const days =
        goal.progress_source === 'tasks'
          ? events.map((e) =>
              dateKeyForInstant(new Date(e.completed_at!), timezone),
            )
          : milestones
              .filter((m) => m.completedAt)
              .map((m) =>
                dateKeyForInstant(new Date(m.completedAt!), timezone),
              );
      points = [
        { day: startDay, percent: 0 },
        ...[...new Set(days)].sort().map((day) => ({
          day,
          percent: routinePercentage(
            days.filter((d) => d <= day).length,
            goal.progress_source === 'tasks'
              ? goal.routine_target
              : milestones.length,
          ),
        })),
      ];
    }
    if (percent != null) points.push({ day: today, percent });
    const state = goalCheckinState(
      goal.checkin_config,
      checkins,
      now,
      timezone,
    );
    const eligible =
      goal.status === 'active' &&
      (!goal.deadline || Date.parse(goal.deadline) >= now.getTime());
    return {
      ...goal,
      status:
        goal.status === 'completed'
          ? 'achieved'
          : goal.status === 'abandoned'
            ? 'let_go'
            : goal.status,
      milestones,
      task_ids: goal.task_ids || [],
      goal_checkins: checkins.reverse(),
      timezone,
      effort_percent: percent,
      completed_tasks: completedTasks,
      checkin_state: {
        ...state,
        due: eligible && state.due,
        available: eligible && state.available,
      },
      finance_target:
        (targets.data || []).find((t) => t.id === goal.finance_target_id) ||
        null,
      pacing: goalPacing(points, now, timezone, goal.deadline, goal.status),
    };
  });
}
