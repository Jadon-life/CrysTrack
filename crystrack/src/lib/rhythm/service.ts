import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { savedTimezone, loadGoals } from '@/lib/goals/service';
import { readAssignments } from '@/lib/assignments/service';
import { academicWorkload } from '@/lib/assignments/workload';
import { dateKeyForInstant } from '@/lib/reminders';
import { shiftAcademicDay, academicDeadline } from '@/lib/assignments/time';
import { summaryWithAccounts, readLedger } from '@/lib/finance/data';
// summarizeWealth is used by summaryWithAccounts for exact ledger aggregation.
import {
  calendarEvents,
  calendarDayBounds,
  dailyCapacity,
  weekStart,
  weeklyAggregation,
} from './logic';
import type { TodayData } from '@/types/rhythm';
export { savedTimezone };
export function rhythmError(error: any) {
  console.error('Daily rhythm operation failed:', error);
  const status = ['40001', '23505', '23P01'].includes(error?.code)
    ? 409
    : error?.code === 'P0002'
      ? 404
      : error?.code === '42501'
        ? 403
        : ['22023', '23514', '22P02', '23502'].includes(error?.code)
          ? 400
          : 500;
  return NextResponse.json(
    {
      error:
        status === 409
          ? 'This plan changed or the slot is already in use. Refresh and choose another time.'
          : status === 404
            ? 'That item is no longer available.'
            : status === 403
              ? 'Choose an item from your own plan.'
              : status === 400
                ? 'Check your local dates and planning details.'
                : 'Your rhythm could not load. Please try again.',
    },
    { status },
  );
}
export async function rhythmRows(
  db: Awaited<ReturnType<typeof createClient>>,
  uid: string,
  start: string,
  end: string,
  timezone: string,
) {
  const from = calendarDayBounds(start,timezone).start,until=calendarDayBounds(end,timezone).end;
  const queries = [
    db
      .from('recurring_tasks')
      .select('id,title,category,preferred_time,created_at,task_schedules(*)')
      .eq('user_id', uid)
      .is('archived_at', null)
      .eq('active', true),
    db
      .from('task_occurrences')
      .select('task_id,date,status,completed_at,recurring_tasks!inner(user_id)')
      .eq('recurring_tasks.user_id', uid)
      .or(
        `and(date.gte.${shiftAcademicDay(start, -1)}T00:00:00Z,date.lt.${shiftAcademicDay(end, 2)}T00:00:00Z),completed_at.gte.${from}`,
      ),
    db
      .from('task_timeboxes')
      .select('*')
      .eq('user_id', uid)
      .lt('starts_at', until)
      .gt('ends_at', from),
    db
      .from('daily_rituals')
      .select('*')
      .eq('user_id', uid)
      .or(`day.gte.${start},deferred_to.gte.${start}`)
      .lte('day', end),
    db
      .from('task_focus_sessions')
      .select('*')
      .eq('user_id', uid)
      .or(`completed_at.gte.${from},status.in.(running,paused)`),
    db
      .from('reminders')
      .select('*')
      .eq('user_id', uid)
      .in('status', ['pending', 'sent', 'snoozed'])
      .gte('scheduled_for', from)
      .lt('scheduled_for', until),
    db
      .from('wealth_expected_flows')
      .select('*')
      .eq('user_id', uid)
      .eq('status', 'active'),
    readAssignments(db, uid, true).then((data) => ({ data, error: null })),
    db.from('goals').select('*').eq('user_id', uid),
    db.from('wealth_bills').select('*').eq('user_id',uid).eq('active',true),
  ];
  const results = await Promise.all(queries);
  for (const result of results) if (result.error) throw result.error;
  const [
    tasks,
    occurrences,
    boxes,
    rituals,
    sessions,
    reminders,
    flows,
    assignments,
    goals,
    bills,
  ] = results.map((r) => r.data || []);
  return {
    tasks,
    occurrences,
    boxes,
    rituals,
    sessions,
    reminders,
    flows,
    assignments,
    goals,
    bills,
  };
}
export async function loadToday(
  db: Awaited<ReturnType<typeof createClient>>,
  uid: string,
  timezone: string,
): Promise<TodayData> {
  const now = new Date(),
    day = dateKeyForInstant(now, timezone),
    start = weekStart(day),
    end = shiftAcademicDay(day, 7);
  const [raw, goals, history, entries, targets, debts, accounts] = await Promise.all([
    rhythmRows(db, uid, start, end, timezone),
    loadGoals(db, uid),
    db
      .from('activity_events')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(12),
    readLedger(db,uid).then(data=>({data,error:null})),
    db
      .from('finance_targets')
      .select('*')
      .eq('user_id', uid)
      .eq('status', 'active'),
    db.from('wealth_debts').select('*').eq('user_id', uid),
    db.from('wealth_accounts').select('*').eq('user_id',uid),
  ]);
  for (const r of [history, entries, targets, debts, accounts])
    if (r.error) throw r.error;
  const events = calendarEvents(raw, day, day, timezone),
    ritual = raw.rituals.find((r: any) => r.day === day) || null;
  const tasks = raw.tasks.map((t: any) => ({
    ...t,
    scheduled_today: events.some(
      (e) => e.type === 'task' && e.task_id === t.id,
    ),
    today_status:
      raw.occurrences.find(
        (o: any) => o.task_id === t.id && o.date.slice(0, 10) === day,
      )?.status || 'pending',
    focus_minutes: raw.sessions
      .filter((s: any) => s.task_id === t.id && s.status === 'completed')
      .reduce((n: number, s: any) => n + s.planned_minutes, 0),
  }));
  const focus =
    raw.sessions.find((s: any) => ['running', 'paused'].includes(s.status)) ||
    null;
  return {
    day,
    timezone,
    asOf: now.toISOString(),
    tasks,
    goals,
    assignments: raw.assignments.filter(
      (a: any) => !['completed', 'dropped'].includes(a.status),
    ),
    wealth: {
      entries: (entries.data || []).slice(0, 10),
      targets: targets.data || [],
      debts: debts.data || [],
      expectedFlows: raw.flows,
      summary: summaryWithAccounts(
        entries.data || [],
        debts.data || [],
        raw.flows,
        accounts.data||[],
        timezone,
      ),
    },
    history: history.data || [],
    reminders: raw.reminders
      .filter(
        (r: any) =>
          r.status === 'pending' && r.scheduled_for >= now.toISOString(),
      )
      .slice(0, 6),
    boxes: raw.boxes,
    ritual,
    priorities: (ritual?.top_three || []).map((ref: any) => {
      const list =
        ref.type === 'task'
          ? tasks
          : ref.type === 'assignment'
            ? raw.assignments
            : raw.goals;
      const item = list.find((i: any) => i.id === ref.id);
      return {
        ...ref,
        title: item?.title || 'A priority you chose',
        completed:
          ref.type === 'task'
            ? item?.today_status === 'completed'
            : ['completed', 'achieved'].includes(item?.status),
      };
    }),
    weekRitual: raw.rituals.find((r: any) => r.day === start) || null,
    focus: focus ? { ...focus, as_of: now.toISOString() } : null,
    focusMinutes: raw.sessions
      .filter(
        (s: any) =>
          s.status === 'completed' &&
          dateKeyForInstant(new Date(s.completed_at), timezone) === day,
      )
      .reduce((n: number, s: any) => n + s.planned_minutes, 0),
    weekly: weeklyAggregation(
      raw.occurrences,
      raw.assignments,
      raw.goals,
      raw.sessions,
      raw.tasks,
      start,
      day,
      timezone,
    ),
    capacity: dailyCapacity(
      raw.boxes,
      day,
      timezone,
      ritual?.capacity_minutes ?? 480,
    ),
    workload: academicWorkload(raw.assignments, now, timezone),
  };
}
