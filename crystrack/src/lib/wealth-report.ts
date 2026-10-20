// Read-only reporting. Decimal strings / integer kobo are the only money authority.
import { z } from 'zod';
import { kobo, decimal } from './budget-money';
const B = BigInt;
export const money = z
  .string()
  .max(48)
  .regex(/^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/);
const positive = money.refine((v) => kobo(v) > B(0));
const nonnegative = money.refine((v) => kobo(v) >= B(0));
export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + 'T12:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  });
const zone = z.string().refine((v) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: v });
    return true;
  } catch {
    return false;
  }
});
const instant = z.string().datetime({ offset: true });
const kind = z.enum([
  'income',
  'expense',
  'saving',
  'savings_release',
  'transfer',
  'borrow',
  'lend',
  'receivable_repayment',
  'liability_repayment',
]);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const identity = { id: z.string().uuid(), user_id: z.string().uuid() };
const bucket = z
  .object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    kind,
    category: z.string().min(1).max(100),
    amount: positive,
    count: count.refine((v) => v > 0),
  })
  .strict();
const entry = z
  .object({
    ...identity,
    type: z.string(),
    flow_kind: kind.nullable(),
    amount: positive,
    date: instant,
    source: z.string().nullable(),
    category: z.string().nullable(),
  })
  .passthrough();
const target = z
  .object({
    ...identity,
    title: z.string(),
    target_amount: positive,
    current_amount: nonnegative,
    status: z.literal('active'),
  })
  .passthrough();
const debt = z
  .object({
    ...identity,
    kind: z.enum(['receivable', 'liability']),
    original_amount: positive,
    outstanding_amount: nonnegative,
    due_date: instant.nullable(),
    status: z.enum(['open', 'settled']),
  })
  .passthrough();
const flow = z
  .object({
    ...identity,
    direction: z.enum(['income', 'expense']),
    amount_min: positive,
    amount_max: positive.nullable(),
    frequency: z.enum(['one_off', 'weekly', 'monthly', 'quarterly', 'yearly', 'irregular']),
    expected_on: instant.nullable(),
    last_confirmed_at: instant.nullable(),
    last_actual_amount: positive.nullable(),
    status: z.enum(['active', 'paused', 'completed']),
  })
  .passthrough()
  .refine((v) => v.amount_max === null || kobo(v.amount_max) >= kobo(v.amount_min));
export const snapshotSchema = z
  .object({
    timezone: zone,
    today: day,
    count,
    buckets: z.array(bucket).max(12000),
    entries: z.array(entry).max(14),
    targets: z.array(target).max(10000),
    debts: z.array(debt).max(10000),
    expectedFlows: z.array(flow).max(10000),
  })
  .strict();
export type WealthSnapshot = z.infer<typeof snapshotSchema>;
export function localDay(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant.parse(value)));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return day.parse(`${get('year')}-${get('month')}-${get('day')}`);
}
function shift(month: string, n: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
function rounded(n: bigint, d: bigint) {
  if (d <= B(0)) throw Error('Invalid ratio');
  const a = n < B(0) ? -n : n;
  const r = (a + d / B(2)) / d;
  return n < B(0) ? -r : r;
}
const pct = (n: bigint, d: bigint) => Number(rounded(n * B(10000), d)) / 100;
const max0 = (n: bigint) => (n < B(0) ? B(0) : n);
const sum = (values: bigint[]) => values.reduce((a, b) => a + b, B(0));
export function expectedCount(
  f: WealthSnapshot['expectedFlows'][number],
  today: string,
  timezone: string,
) {
  const month = today.slice(0, 7),
    elapsed = Number(today.slice(8)),
    [year, m] = month.split('-').map(Number),
    days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  if (
    f.status !== 'active' ||
    (f.last_confirmed_at && localDay(f.last_confirmed_at, timezone).startsWith(month))
  )
    return 0;
  if (f.frequency === 'weekly') return Math.max(1, Math.ceil((days - elapsed + 1) / 7));
  if (f.frequency === 'monthly' || f.frequency === 'irregular') return 1;
  if (f.frequency === 'one_off' && !f.expected_on) return 1;
  return f.expected_on && localDay(f.expected_on, timezone).startsWith(month) ? 1 : 0;
}
const amountKeys = [
  'availableBalance',
  'savedBalance',
  'receivables',
  'liabilities',
  'netPosition',
  'monthIncome',
  'monthExpenses',
  'monthSaved',
  'netSpendableFlow',
  'averageDailySpend',
  'projectedMonthExpenses',
  'priorMonthExpenses',
  'safeToSpend',
  'projectedMonthEndLow',
  'projectedMonthEndHigh',
  'dueLiabilities',
  'expectedIncomeMin',
  'expectedIncomeMax',
  'expectedExpenseMin',
  'expectedExpenseMax',
] as const;
const amountShape = Object.fromEntries(amountKeys.map((k) => [k, money])) as {
  [K in (typeof amountKeys)[number]]: typeof money;
};
const ratio = z.number().finite().nullable();
const pattern = z
  .object({
    category: z.string(),
    current: money,
    baseline: money.nullable(),
    projected: money,
    vsBaselinePct: ratio,
    sharePct: z.number().finite(),
    aboveBaseline20: z.boolean(),
    aboveBaseline25: z.boolean(),
  })
  .strict();
export const summarySchema = z
  .object({
    ...amountShape,
    savingsRatePct: ratio,
    projectedExpenseChangePct: ratio,
    dataMonths: count,
    categoryPatterns: z.array(pattern),
    spendingVelocity: z.enum(['low', 'normal', 'elevated', 'insufficient']),
    deterministicRemark: z.string(),
    savingsAtLeast20: z.boolean(),
  })
  .strict();
const cashflow = z
  .object({ key: z.string(), label: z.string(), income: money, expenses: money, savings: money })
  .strict();
export const reportSchema = z
  .object({
    entries: z.array(entry).max(14),
    targets: z.array(target).max(10000),
    debts: z.array(debt).max(10000),
    expectedFlows: z.array(flow).max(10000),
    summary: summarySchema,
    cashflow: z.array(cashflow).length(6),
    reporting: z
      .object({
        complete: z.literal(true),
        timezone: zone,
        today: day,
        month: z.string(),
        ledgerCount: count,
        recentLimit: z.literal(14),
        historyRebucketed: z.literal(true),
      })
      .strict(),
  })
  .strict();
export type WealthReport = z.infer<typeof reportSchema>;
export type ExactWealthSummary = WealthReport['summary'];
export function buildWealthReport(raw: unknown, owner: string): WealthReport {
  const s = snapshotSchema.parse(raw),
    month = s.today.slice(0, 7),
    elapsed = B(Number(s.today.slice(8))),
    [year, m] = month.split('-').map(Number),
    days = B(new Date(Date.UTC(year, m, 0)).getUTCDate());
  for (const collection of [s.entries, s.targets, s.debts, s.expectedFlows]) {
    const ids = new Set<string>();
    for (const row of collection) {
      if (row.user_id !== owner || ids.has(row.id)) throw Error('Invalid owner/identity coverage');
      ids.add(row.id);
    }
  }
  if (s.entries.length !== Math.min(s.count, 14)) throw Error('Incomplete recent coverage');
  const keys = new Set<string>();
  let rows = B(0);
  const months = new Set<string>();
  for (const b of s.buckets) {
    const key = JSON.stringify([b.month, b.kind, b.category]);
    if (keys.has(key) || b.month > month) throw Error('Invalid bucket coverage');
    keys.add(key);
    rows += B(b.count);
    months.add(b.month);
  }
  if (rows !== B(s.count)) throw Error('Incomplete ledger coverage');
  for (const e of s.entries)
    if (localDay(e.date, s.timezone) > s.today) throw Error('Future actual');
  const total = (k: string, mo?: string, category?: string) =>
    sum(
      s.buckets
        .filter(
          (b) =>
            b.kind === k &&
            (mo === undefined || b.month === mo) &&
            (category === undefined || b.category === category),
        )
        .map((b) => kobo(b.amount)),
    );
  const available =
    sum(['income', 'borrow', 'receivable_repayment', 'savings_release'].map((k) => total(k))) -
    sum(['expense', 'saving', 'lend', 'liability_repayment'].map((k) => total(k)));
  const saved = max0(total('saving') - total('savings_release'));
  const open = s.debts.filter((d) => d.status === 'open');
  const rec = sum(
      open.filter((d) => d.kind === 'receivable').map((d) => kobo(d.outstanding_amount)),
    ),
    liab = sum(open.filter((d) => d.kind === 'liability').map((d) => kobo(d.outstanding_amount)));
  const income = total('income', month),
    expense = total('expense', month),
    savedMonth = max0(total('saving', month) - total('savings_release', month)),
    prior = total('expense', shift(month, -1));
  const due = sum(
    open
      .filter(
        (d) =>
          d.kind === 'liability' &&
          (!d.due_date || localDay(d.due_date, s.timezone) < shift(month, 1) + '-01'),
      )
      .map((d) => kobo(d.outstanding_amount)),
  );
  let inMin = B(0),
    inMax = B(0),
    outMin = B(0),
    outMax = B(0);
  for (const f of s.expectedFlows) {
    const n = B(expectedCount(f, s.today, s.timezone)),
      lo = kobo(f.amount_min) * n,
      hi = kobo(f.amount_max ?? f.amount_min) * n;
    if (f.direction === 'income') {
      inMin += lo;
      inMax += hi;
    } else {
      outMin += lo;
      outMax += hi;
    }
  }
  const baselineKeys = [
    ...new Set(
      s.buckets.filter((b) => b.kind === 'expense' && b.month < month).map((b) => b.month),
    ),
  ]
    .sort()
    .slice(-3);
  const categories = [
    ...new Set(s.buckets.filter((b) => b.kind === 'expense').map((b) => b.category)),
  ];
  const patterns = categories
    .map((category) => {
      const current = total('expense', month, category),
        base = sum(baselineKeys.map((m) => total('expense', m, category))),
        n = B(baselineKeys.length),
        projected = current * days;
      const delta = projected * n - base * elapsed,
        den = base * elapsed;
      return {
        category,
        current: decimal(current),
        baseline: n ? decimal(rounded(base, n)) : null,
        projected: decimal(rounded(projected, elapsed)),
        vsBaselinePct: den > B(0) ? pct(delta, den) : null,
        sharePct: expense > B(0) ? pct(current, expense) : 0,
        aboveBaseline20: den > B(0) && delta * B(100) >= den * B(20),
        aboveBaseline25: den > B(0) && delta * B(100) >= den * B(25),
      };
    })
    .sort((a, b) =>
      kobo(a.current) === kobo(b.current)
        ? a.category.localeCompare(b.category)
        : kobo(a.current) > kobo(b.current)
          ? -1
          : 1,
    );
  const delta = expense * days - prior * elapsed,
    den = prior * elapsed;
  const velocity =
    prior === B(0)
      ? 'insufficient'
      : delta * B(100) >= den * B(15)
        ? 'elevated'
        : delta * B(100) <= -den * B(15)
          ? 'low'
          : 'normal';
  const atLeast20 = income > B(0) && savedMonth * B(100) >= income * B(20),
    netFlow = income - expense - savedMonth;
  const anomaly = patterns.find((p) => p.aboveBaseline25);
  const remark =
    months.size < 2
      ? 'Keep recording consistently. CrysTrack needs more history before it can judge your normal spending pattern reliably.'
      : netFlow < B(0)
        ? anomaly
          ? `Your spendable cashflow is negative this month, with ${anomaly.category.toLowerCase()} running materially above its recent baseline.`
          : 'Your spendable cashflow is negative this month. Review the categories driving the largest outflow before adding new commitments.'
        : velocity === 'elevated'
          ? anomaly
            ? `${anomaly.category} is the clearest spending deviation right now. Cashflow is still positive, but your current spending pace is above your recent pattern.`
            : 'Cashflow is positive, but spending is running faster than your recent monthly pattern.'
          : atLeast20
            ? 'Your current cashflow is positive and your savings allocation is holding up well against your recorded income.'
            : 'Your cashflow is currently positive. Keep recording consistently so CrysTrack can distinguish normal variation from a genuine change in spending behaviour.';
  const summary = {
    availableBalance: decimal(available),
    savedBalance: decimal(saved),
    receivables: decimal(rec),
    liabilities: decimal(liab),
    netPosition: decimal(available + saved + rec - liab),
    monthIncome: decimal(income),
    monthExpenses: decimal(expense),
    monthSaved: decimal(savedMonth),
    netSpendableFlow: decimal(netFlow),
    averageDailySpend: decimal(rounded(expense, elapsed)),
    projectedMonthExpenses: decimal(rounded(expense * days, elapsed)),
    priorMonthExpenses: decimal(prior),
    safeToSpend: decimal(max0(available - outMax - due)),
    projectedMonthEndLow: decimal(available + inMin - outMax - due),
    projectedMonthEndHigh: decimal(available + inMax - outMin - due),
    dueLiabilities: decimal(due),
    expectedIncomeMin: decimal(inMin),
    expectedIncomeMax: decimal(inMax),
    expectedExpenseMin: decimal(outMin),
    expectedExpenseMax: decimal(outMax),
    savingsRatePct: income > B(0) ? pct(savedMonth, income) : null,
    projectedExpenseChangePct: prior > B(0) ? pct(delta, den) : null,
    dataMonths: months.size,
    categoryPatterns: patterns,
    spendingVelocity: velocity,
    deterministicRemark: remark,
    savingsAtLeast20: atLeast20,
  };
  return reportSchema.parse({
    entries: s.entries,
    targets: s.targets,
    debts: s.debts,
    expectedFlows: s.expectedFlows,
    summary,
    cashflow: Array.from({ length: 6 }, (_, i) => {
      const key = shift(month, i - 5);
      return {
        key,
        label: new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(
          new Date(key + '-15T12:00:00Z'),
        ),
        income: decimal(total('income', key)),
        expenses: decimal(total('expense', key)),
        savings: decimal(total('saving', key) - total('savings_release', key)),
      };
    }),
    reporting: {
      complete: true,
      timezone: s.timezone,
      today: s.today,
      month,
      ledgerCount: s.count,
      recentLimit: 14,
      historyRebucketed: true,
    },
  });
}
export function sanitizedExactMetrics(s: ExactWealthSummary) {
  return {
    data_months: s.dataMonths,
    cashflow:
      kobo(s.netSpendableFlow) > B(0)
        ? 'positive'
        : kobo(s.netSpendableFlow) < B(0)
          ? 'negative'
          : 'neutral',
    savings_rate_pct: s.savingsRatePct === null ? null : Math.round(s.savingsRatePct),
    projected_expense_change_pct:
      s.projectedExpenseChangePct === null ? null : Math.round(s.projectedExpenseChangePct),
    spending_velocity: s.spendingVelocity,
    largest_category_share_pct: s.categoryPatterns[0]
      ? Math.round(s.categoryPatterns[0].sharePct)
      : null,
    category_anomalies: s.categoryPatterns
      .filter((p) => p.aboveBaseline20)
      .slice(0, 4)
      .map((p) => ({ category: p.category, vs_baseline_pct: Math.round(p.vsBaselinePct!) })),
    debt_position:
      kobo(s.liabilities) === B(0)
        ? 'none'
        : kobo(s.netPosition) > kobo(s.liabilities)
          ? 'contained'
          : 'material',
    receivable_position: kobo(s.receivables) === B(0) ? 'none' : 'present',
  };
}
