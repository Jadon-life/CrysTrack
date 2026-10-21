import { z } from 'zod';
import { readWealthReport } from '@/lib/wealth-report-server';
import { localDay } from '@/lib/wealth-report';
import { EXPERIENCE_CONFIG } from '@/config/experience';
import { deterministicGoalContext } from '@/lib/goals/analyze-goal';
import { scopedGoal } from './scopes';
import { AiPrivacyError } from './privacy-server';
import type { IntelligenceDomain } from './context';

const taskStatus = z.enum(['pending', 'completed', 'skipped', 'missed']);
const safeDate = (s: string) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
async function rows(query: any) {
  const { data, error } = await query;
  if (error || !Array.isArray(data)) throw new AiPrivacyError('UNAVAILABLE');
  return data;
}
async function taskScope(client: any, user: string, date: string) {
  const start = new Date(date + 'T12:00:00Z');
  start.setUTCDate(start.getUTCDate() - 59);
  const days = await rows(
    client
      .from('daily_records')
      .select('day_key,evidence,expected_count,close_status')
      .eq('user_id', user)
      .gte('day_key', start.toISOString().slice(0, 10))
      .lte('day_key', date)
      .order('day_key', { ascending: false })
      .limit(61),
  );
  const today = days.find((d) => d.day_key === date);
  if (!today || today.evidence !== 'verified')
    return {
      current_date: date,
      today: {
        verified: false,
        scheduled: null,
        completed: null,
        pending: null,
        skipped: null,
        missed: null,
      },
      routines: [],
      observed_days: days.length,
      evidence_limit: 'Today has not been verified; never assume zero tasks or a completed day.',
    };
  const routines = await rows(
    client
      .from('daily_routine_records')
      .select('status,preferred_time')
      .eq('user_id', user)
      .eq('day_key', date)
      .order('routine_key')
      .limit(1001),
  );
  if (routines.length > 1000 || routines.length !== today.expected_count)
    throw new AiPrivacyError('UNAVAILABLE');
  for (const r of routines)
    if (!taskStatus.safeParse(r.status).success) throw new AiPrivacyError('UNAVAILABLE');
  return {
    current_date: date,
    today: {
      verified: true,
      scheduled: today.expected_count,
      ...Object.fromEntries(
        ['completed', 'pending', 'skipped', 'missed'].map((s) => [
          s,
          routines.filter((r) => r.status === s).length,
        ]),
      ),
    },
    routines: routines
      .slice(0, 60)
      .map((r, i) => ({
        routine: i + 1,
        current_day: { date, status: r.status },
        preferred_time: /^\d{2}:\d{2}$/.test(r.preferred_time || '') ? r.preferred_time : null,
      })),
    observed_days: days.length,
    closed_verified_days: days.filter(
      (d) => d.close_status === 'closed' && d.evidence === 'verified',
    ).length,
    evidence_limit:
      'Only observed durable records. Routine detail preview is bounded to 60; today counts cover every recorded routine.',
  };
}
async function goalScope(client: any, user: string) {
  const goals = await rows(
    client
      .from('goals')
      .select(
        'id,created_at,deadline,status,measurable,progress_mode,starting_value,target_value,progress_value,goal_checkins(created_at,progress_value,progress_percent,duration_minutes)',
      )
      .eq('user_id', user)
      .order('created_at', { ascending: false })
      .limit(81),
  );
  if (goals.length > 80) throw new AiPrivacyError('UNAVAILABLE');
  return {
    total: goals.length,
    goals: goals.slice(0, 40).map((g, i) => {
      const checkins = [...(g.goal_checkins || [])]
        .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, 12);
      return {
        goal: i + 1,
        status: ['active', 'completed', 'paused', 'abandoned'].includes(g.status)
          ? g.status
          : 'other',
        deadline: safeDate(g.deadline || ''),
        ...scopedGoal(g, checkins, deterministicGoalContext(g, checkins)),
      };
    }),
    evidence_limit: 'Up to 40 goals; private text and raw target measurements are excluded.',
  };
}
async function assignmentScope(client: any, user: string) {
  const a = await rows(
    client
      .from('assignments')
      .select('deadline,priority,status,completed_at')
      .eq('user_id', user)
      .order('deadline')
      .limit(251),
  );
  if (a.length > 250) throw new AiPrivacyError('UNAVAILABLE');
  return {
    total: a.length,
    assignments: a
      .slice(0, 80)
      .map((r, i) => ({
        assignment: i + 1,
        deadline: safeDate(r.deadline),
        priority: ['low', 'medium', 'high', 'urgent'].includes(r.priority) ? r.priority : 'other',
        status: ['upcoming', 'due_soon', 'due_today', 'overdue', 'completed'].includes(r.status)
          ? r.status
          : 'other',
        completed_date: r.completed_at ? safeDate(r.completed_at) : null,
      })),
    evidence_limit: 'Up to 80 assignment dates/states, not titles, courses or descriptions.',
  };
}
export async function scopedWealthContext(client: any, user: string) {
  const r = await readWealthReport(client, user),
    s = r.summary;
  const known = new Set<string>(EXPERIENCE_CONFIG.wealth.categories);
  return {
    currency: 'NGN',
    reporting: {
      today: r.reporting.today,
      month: r.reporting.month,
      timezone: r.reporting.timezone,
      ledger_count: r.reporting.ledgerCount,
    },
    totals: {
      available_ngn: s.availableBalance,
      saved_ngn: s.savedBalance,
      month_income_ngn: s.monthIncome,
      month_expenses_ngn: s.monthExpenses,
      monthly_net_ngn: s.netSpendableFlow,
      due_debt_ngn: s.dueLiabilities,
    },
    categories: s.categoryPatterns
      .slice(0, 12)
      .map((p) => ({
        category: known.has(p.category) ? p.category : 'Other',
        current_ngn: p.current,
      })),
    evidence_limit:
      'Exact aggregate NGN amounts. No individual transactions, descriptions, notes, references, bank accounts, raw CSV, target names or debt counterparties.',
  };
}
export async function buildScopedContext(
  client: any,
  user: string,
  domain: IntelligenceDomain,
  includeWealth: boolean,
) {
  if (domain === 'wealth' && !includeWealth) throw new AiPrivacyError('WEALTH_OFF', 403);
  const { data, error } = await client
    .from('profiles')
    .select('timezone,scheduling_timezone')
    .eq('user_id', user)
    .maybeSingle();
  if (error) throw new AiPrivacyError('UNAVAILABLE');
  const zone = data?.scheduling_timezone || data?.timezone || 'UTC';
  let date: string;
  try {
    date = localDay(new Date().toISOString(), zone);
  } catch {
    throw new AiPrivacyError('UNAVAILABLE');
  }
  const context: Record<string, unknown> = {
    policy: '2026-10-20-minimal-v1',
    as_of_date: date,
    timezone: zone,
    wealth_included: includeWealth && (domain === 'wealth' || domain === 'overview'),
  };
  if (domain === 'tasks' || domain === 'overview')
    context.tasks = await taskScope(client, user, date);
  if (domain === 'goals' || domain === 'overview') context.goals = await goalScope(client, user);
  if (domain === 'assignments' || domain === 'overview')
    context.assignments = await assignmentScope(client, user);
  if (includeWealth && (domain === 'wealth' || domain === 'overview'))
    context.wealth = await scopedWealthContext(client, user);
  if (new TextEncoder().encode(JSON.stringify(context)).byteLength > 49152)
    throw new AiPrivacyError('UNAVAILABLE');
  return context;
}
