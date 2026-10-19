import { createHash } from 'crypto';
import { goalCheckinAccountability, goalCheckinState } from '@/lib/goals/checkin-occurrence';
import { readWealthReport } from '@/lib/wealth-report-server';
import { localDay } from '@/lib/wealth-report';

export type IntelligenceDomain = 'tasks' | 'goals' | 'assignments' | 'wealth' | 'overview';

const DAY_MS = 24 * 60 * 60 * 1000;

function cleanText(value: unknown, max = 180) {
  if (value == null) return null;
  return String(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/https?:\/\/\S+/gi, '[redacted-link]')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[redacted-phone]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max) || null;
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;
}

const WEEKDAY_KEYS = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
];

function dateStateInTimezone(
  date: Date,
  timezone: string,
) {
  const format = (timeZone: string) => {
    const parts = new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
      },
    ).formatToParts(date);

    const value = (type: string) =>
      parts.find((part) => part.type === type)?.value || '';

    const weekdayLabel = value('weekday');
    const weekdayIndex =
      WEEKDAY_KEYS.indexOf(weekdayLabel);

    return {
      dateKey:
        `${value('year')}-${value('month')}-${value('day')}`,
      weekday:
        weekdayIndex >= 0
          ? weekdayIndex
          : date.getUTCDay(),
    };
  };

  try {
    return format(timezone);
  } catch {
    return format('UTC');
  }
}

function occurrenceDateKey(value: unknown) {
  return String(value || '').slice(0, 10);
}

async function profileTimezone(supabase: any, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('timezone, current_timezone')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.current_timezone || data?.timezone || 'UTC';
}

async function tasksContext(
  supabase: any,
  userId: string,
  timezone: string,
  now: Date,
) {
  const current = dateStateInTimezone(
    now,
    timezone,
  );

  const historyStart = new Date(
    `${current.dateKey}T00:00:00.000Z`,
  );

  historyStart.setUTCDate(
    historyStart.getUTCDate() - 59,
  );

  const { data: tasks, error: taskError } =
    await supabase
      .from('recurring_tasks')
      .select(
        'id, title, description, category, preferred_time, active, archived_at, task_schedules(weekday)',
      )
      .eq('user_id', userId)
      .order('created_at', {
        ascending: false,
      });

  if (taskError) throw taskError;

  const ids = (tasks || []).map(
    (task: any) => task.id,
  );

  let occurrences: any[] = [];

  if (ids.length) {
    const { data, error } = await supabase
      .from('task_occurrences')
      .select(
        'task_id, date, status, completed_at',
      )
      .in('task_id', ids)
      .gte(
        'date',
        historyStart.toISOString(),
      )
      .order('date', {
        ascending: false,
      });

    if (error) throw error;

    occurrences = data || [];
  }

  const rows = (tasks || []).map(
    (task: any) => {
      const history = occurrences.filter(
        (item) =>
          item.task_id === task.id,
      );

      const weekdays = (
        task.task_schedules || []
      )
        .map((item: any) =>
          Number(item.weekday),
        )
        .filter(
          (weekday: number) =>
            Number.isInteger(weekday) &&
            weekday >= 0 &&
            weekday <= 6,
        )
        .sort(
          (a: number, b: number) =>
            a - b,
        );

      const active = Boolean(
        task.active &&
          !task.archived_at,
      );

      const todayOccurrence =
        history.find(
          (item) =>
            occurrenceDateKey(
              item.date,
            ) === current.dateKey,
        );

      const scheduledToday =
        active &&
        weekdays.includes(
          current.weekday,
        );

      const todayStatus =
        scheduledToday
          ? String(
              todayOccurrence?.status ||
                'pending',
            )
          : 'not_scheduled';

      const completed =
        history.filter(
          (item) =>
            item.status === 'completed',
        ).length;

      const missed =
        history.filter(
          (item) =>
            item.status === 'missed',
        ).length;

      const skipped =
        history.filter(
          (item) =>
            item.status === 'skipped',
        ).length;

      const decided =
        completed +
        missed +
        skipped;

      return {
        title: cleanText(task.title),
        description: cleanText(
          task.description,
          240,
        ),
        category: cleanText(
          task.category,
          80,
        ),
        preferred_time:
          task.preferred_time || null,
        active,
        weekdays,

        current_day: {
          date: current.dateKey,
          weekday: current.weekday,
          scheduled: scheduledToday,
          status: todayStatus,
          completed_at:
            todayOccurrence
              ?.completed_at || null,
        },

        last_60_days: {
          completed,
          missed,
          skipped,
          completion_rate_pct:
            percent(
              completed,
              decided,
            ),
        },
      };
    },
  );

  const activeRows =
    rows.filter(
      (row: { active: boolean }) =>
        row.active,
    );

  const todayRows =
    activeRows.filter(
      (row: any) =>
        row.current_day.scheduled,
    );

  return {
    window_days: 60,

    current_date:
      current.dateKey,

    current_weekday:
      current.weekday,

    active_routines:
      activeRows.length,

    today: {
      scheduled:
        todayRows.length,

      completed:
        todayRows.filter(
          (row: any) =>
            row.current_day.status ===
            'completed',
        ).length,

      pending:
        todayRows.filter(
          (row: any) =>
            row.current_day.status ===
            'pending',
        ).length,

      skipped:
        todayRows.filter(
          (row: any) =>
            row.current_day.status ===
            'skipped',
        ).length,

      missed:
        todayRows.filter(
          (row: any) =>
            row.current_day.status ===
            'missed',
        ).length,
    },

    routines:
      rows.slice(0, 60),
  };
}

async function goalsContext(supabase: any, userId: string, timezone: string) {
  const { data: goals, error } = await supabase
    .from('goals')
    .select('id, title, description, category, deadline, measurable, starting_value, target_value, progress_value, progress_unit, progress_mode, ai_coaching, checkin_config, status, created_at, goal_checkins(created_at, response_text, learned_text, blockers, progress_value, progress_percent, occurrence_key, occurrence_start_date)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(80);
  if (error) throw error;

  const now = new Date();
  return {
    active_goals: (goals || []).filter((goal: any) => goal.status === 'active').length,
    goals: (goals || []).slice(0, 40).map((goal: any) => {
      const checkins = [...(goal.goal_checkins || [])].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const state = goal.status === 'active'
        ? goalCheckinState(goal.checkin_config, checkins, now, timezone)
        : { status: 'closed', due: false, available: false, completed: false, scheduledToday: false };
      const accountability = goal.status === 'active'
        ? goalCheckinAccountability(goal, checkins, now, timezone, 30)
        : null;
      return {
        title: cleanText(goal.title),
        description: cleanText(goal.description, 280),
        category: cleanText(goal.category, 80),
        status: goal.status,
        deadline: goal.deadline || null,
        progress_mode: goal.progress_mode,
        numeric_progress: goal.progress_mode === 'percentage' || goal.measurable ? {
          starting: goal.starting_value == null ? 0 : number(goal.starting_value),
          current: number(goal.progress_value),
          target: number(goal.target_value),
          unit: cleanText(goal.progress_unit, 40),
        } : null,
        checkin_config: goal.checkin_config,
        current_checkin: state,
        accountability_30d: accountability,
        recent_checkins: checkins.slice(0, 8).map((item: any) => ({
          date: item.created_at,
          progress_value: item.progress_value == null ? null : number(item.progress_value),
          progress_percent: item.progress_percent == null ? null : number(item.progress_percent),
          moved_forward: cleanText(item.response_text, 260),
          learned: cleanText(item.learned_text, 180),
          blockers: cleanText(item.blockers, 180),
        })),
      };
    }),
  };
}

async function assignmentsContext(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('assignments')
    .select('title, description, deadline, priority, status, category, completed_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(250);
  if (error) throw error;

  const now = Date.now();
  const rows = (data || []).map((item: any) => ({
    title: cleanText(item.title),
    description: cleanText(item.description, 220),
    category: cleanText(item.category, 80),
    deadline: item.deadline,
    priority: item.priority,
    status: item.status,
    completed_at: item.completed_at,
    overdue_now: item.status !== 'completed' && new Date(item.deadline).getTime() < now,
  }));

  return {
    total_loaded: rows.length,
    active: rows.filter((row: { status: string }) => row.status !== 'completed').length,
    overdue: rows.filter((row: { overdue_now: boolean }) => row.overdue_now).length,
    completed: rows.filter((row: { status: string }) => row.status === 'completed').length,
    assignments: rows.slice(0, 80),
  };
}

async function wealthContext(supabase: any, userId: string) {
 const r=await readWealthReport(supabase,userId);
 return {ledger_rows_processed:r.reporting.ledgerCount,ledger_truncated_for_safety:false,
 reporting:r.reporting,accounting_summary:r.summary,monthly_ledger:r.cashflow,
 recent_transactions:r.entries.map(e=>({date:localDay(e.date,r.reporting.timezone),kind:e.flow_kind||e.type,amount_ngn:e.amount,category:cleanText(e.category,80)||'Other'})),
 savings_targets:r.targets.slice(0,30).map(t=>({title:cleanText(t.title),target_amount_ngn:t.target_amount,current_amount_ngn:t.current_amount,deadline:t.deadline,status:t.status})),
 debts:r.debts.slice(0,50).map(d=>({kind:d.kind,original_amount_ngn:d.original_amount,outstanding_amount_ngn:d.outstanding_amount,due_date:d.due_date,status:d.status})),
 expected_flows:r.expectedFlows.slice(0,60).map(f=>({direction:f.direction,amount_min_ngn:f.amount_min,amount_max_ngn:f.amount_max,frequency:f.frequency,expected_on:f.expected_on,status:f.status,last_confirmed_at:f.last_confirmed_at})),
 privacy_note:'Identity, credentials, transaction notes and debt counterparties are excluded. Complete owner-scoped accounting aggregates; money is exact NGN decimal text. Six monthly chart buckets and up to fourteen recent dates/kinds/amounts/categories are shown. Side item previews are bounded; their financial aggregates are complete. No transaction descriptions, notes, references, accounts, credentials or counterparties.'};
}

export async function buildIntelligenceContext(supabase: any, userId: string, domain: IntelligenceDomain) {
  const timezone = await profileTimezone(
    supabase,
    userId,
  );

  const now = new Date();

  const current =
    dateStateInTimezone(
      now,
      timezone,
    );

  const base = {
    generated_at:
      now.toISOString(),

    as_of_date:
      current.dateKey,

    as_of_weekday:
      current.weekday,

    timezone,
  };

  if (domain === 'tasks') {
    return {
      ...base,
      tasks:
        await tasksContext(
          supabase,
          userId,
          timezone,
          now,
        ),
    };
  }

  if (domain === 'goals') {
    return {
      ...base,
      goals:
        await goalsContext(
          supabase,
          userId,
          timezone,
        ),
    };
  }

  if (domain === 'assignments') {
    return {
      ...base,
      assignments:
        await assignmentsContext(
          supabase,
          userId,
        ),
    };
  }

  if (domain === 'wealth') {
    const wealth=await wealthContext(supabase,userId);
    return {...base,timezone:wealth.reporting.timezone,as_of_date:wealth.reporting.today,wealth};
  }

  const [
    tasks,
    goals,
    assignments,
    wealth,
  ] = await Promise.all([
    tasksContext(
      supabase,
      userId,
      timezone,
      now,
    ),

    goalsContext(
      supabase,
      userId,
      timezone,
    ),

    assignmentsContext(
      supabase,
      userId,
    ),

    wealthContext(
      supabase,
      userId,
    ),
  ]);

  return {
    ...base,
    tasks,
    goals,
    assignments,
    wealth,
  };
}

export function fingerprintContext(context: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(context, (key, value) => key === 'generated_at' ? undefined : value))
    .digest('hex');
}

