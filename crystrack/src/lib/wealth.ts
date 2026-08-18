import type { WealthDisplayCurrency } from '@/config/experience';

export interface MoneyEntryLike {
  id?: string;
  type: string;
  flow_kind?: string | null;
  amount: number | string;
  date: string;
  source?: string | null;
  category?: string | null;
  debt_id?: string | null;
  expected_flow_id?: string | null;
}

export interface WealthDebtLike {
  id: string;
  kind: 'receivable' | 'liability';
  original_amount: number | string;
  outstanding_amount: number | string;
  due_date?: string | null;
  status: 'open' | 'settled';
}

export interface ExpectedFlowLike {
  id: string;
  direction: 'income' | 'expense';
  amount_min: number | string;
  amount_max?: number | string | null;
  frequency: 'one_off' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'irregular';
  expected_on?: string | null;
  status: 'active' | 'paused' | 'completed';
  last_confirmed_at?: string | null;
}

export interface ExchangeRateSnapshot {
  usdNgn: number;
  ngnUsd: number;
  updatedAt: string | null;
  nextUpdateAt?: string | null;
  provider: string;
  stale?: boolean;
}

export interface CategoryPattern {
  category: string;
  current: number;
  baseline: number | null;
  projected: number;
  vsBaselinePct: number | null;
  sharePct: number;
}

export interface WealthSummary {
  availableBalance: number;
  savedBalance: number;
  receivables: number;
  liabilities: number;
  netPosition: number;
  monthIncome: number;
  monthExpenses: number;
  monthSaved: number;
  netSpendableFlow: number;
  savingsRatePct: number | null;
  averageDailySpend: number;
  projectedMonthExpenses: number;
  priorMonthExpenses: number;
  projectedExpenseChangePct: number | null;
  safeToSpend: number;
  projectedMonthEndLow: number;
  projectedMonthEndHigh: number;
  dataMonths: number;
  categoryPatterns: CategoryPattern[];
  spendingVelocity: 'low' | 'normal' | 'elevated' | 'insufficient';
  deterministicRemark: string;
}

const amountOf = (value: number | string | null | undefined) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const flowKind = (entry: MoneyEntryLike) => String(entry.flow_kind || entry.type || '').toLowerCase();

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function previousMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function affectsAvailable(kind: string, amount: number) {
  switch (kind) {
    case 'income':
    case 'borrow':
    case 'receivable_repayment':
    case 'savings_release':
      return amount;
    case 'expense':
    case 'saving':
    case 'lend':
    case 'liability_repayment':
      return -amount;
    default:
      return 0;
  }
}

function affectsSavings(kind: string, amount: number) {
  if (kind === 'saving') return amount;
  if (kind === 'savings_release') return -amount;
  return 0;
}

function isConfirmedThisMonth(flow: ExpectedFlowLike, now: Date) {
  if (!flow.last_confirmed_at) return false;
  return sameMonth(new Date(flow.last_confirmed_at), now);
}

function expectedFlowCount(flow: ExpectedFlowLike, now: Date) {
  if (flow.status !== 'active' || isConfirmedThisMonth(flow, now)) return 0;

  if (flow.frequency === 'one_off') {
    if (!flow.expected_on) return 1;
    const expected = new Date(flow.expected_on);
    return sameMonth(expected, now) ? 1 : 0;
  }

  if (flow.frequency === 'weekly') {
    const daysInMonth = endOfMonth(now).getDate();
    const remainingDays = Math.max(0, daysInMonth - now.getDate() + 1);
    return Math.max(1, Math.ceil(remainingDays / 7));
  }

  if (flow.frequency === 'monthly' || flow.frequency === 'irregular') return 1;

  if (flow.frequency === 'quarterly' || flow.frequency === 'yearly') {
    if (!flow.expected_on) return 0;
    return sameMonth(new Date(flow.expected_on), now) ? 1 : 0;
  }

  return 0;
}

function expectedRange(flows: ExpectedFlowLike[], now: Date) {
  let incomeMin = 0;
  let incomeMax = 0;
  let expenseMin = 0;
  let expenseMax = 0;

  for (const flow of flows) {
    const count = expectedFlowCount(flow, now);
    if (!count) continue;
    const min = amountOf(flow.amount_min) * count;
    const max = amountOf(flow.amount_max ?? flow.amount_min) * count;
    if (flow.direction === 'income') {
      incomeMin += min;
      incomeMax += max;
    } else {
      expenseMin += min;
      expenseMax += max;
    }
  }

  return { incomeMin, incomeMax, expenseMin, expenseMax };
}

function dueLiabilities(debts: WealthDebtLike[], now: Date) {
  const monthEnd = endOfMonth(now).getTime();
  return debts
    .filter((debt) => debt.kind === 'liability' && debt.status === 'open')
    .filter((debt) => !debt.due_date || new Date(debt.due_date).getTime() <= monthEnd)
    .reduce((sum, debt) => sum + amountOf(debt.outstanding_amount), 0);
}

function buildCategoryPatterns(entries: MoneyEntryLike[], now: Date): CategoryPattern[] {
  const currentMonth = monthKey(now);
  const priorMonths = new Set<string>();
  const categoryMonthTotals = new Map<string, Map<string, number>>();

  for (const entry of entries) {
    if (flowKind(entry) !== 'expense') continue;
    const date = new Date(entry.date);
    if (Number.isNaN(date.getTime())) continue;
    const key = monthKey(date);
    if (key !== currentMonth) priorMonths.add(key);
    const category = String(entry.category || 'Other').trim() || 'Other';
    const monthMap = categoryMonthTotals.get(category) || new Map<string, number>();
    monthMap.set(key, (monthMap.get(key) || 0) + amountOf(entry.amount));
    categoryMonthTotals.set(category, monthMap);
  }

  const baselineKeys = Array.from(priorMonths).sort().slice(-3);
  const daysInMonth = endOfMonth(now).getDate();
  const elapsed = Math.max(1, now.getDate());
  const projectionFactor = daysInMonth / elapsed;
  const currentTotal = Array.from(categoryMonthTotals.values())
    .reduce((sum, monthMap) => sum + (monthMap.get(currentMonth) || 0), 0);

  return Array.from(categoryMonthTotals.entries())
    .map(([category, monthMap]) => {
      const current = monthMap.get(currentMonth) || 0;
      const baselineValues = baselineKeys.map((key) => monthMap.get(key) || 0);
      const baseline = baselineValues.length
        ? baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length
        : null;
      const projected = current * projectionFactor;
      const vsBaselinePct = baseline && baseline > 0 ? ((projected - baseline) / baseline) * 100 : null;
      return {
        category,
        current,
        baseline,
        projected,
        vsBaselinePct,
        sharePct: currentTotal > 0 ? (current / currentTotal) * 100 : 0,
      };
    })
    .sort((a, b) => b.current - a.current);
}

function remarkFromSummary(input: Omit<WealthSummary, 'deterministicRemark'>) {
  if (input.dataMonths < 2) {
    return 'Keep recording consistently. CrysTrack needs more history before it can judge your normal spending pattern reliably.';
  }

  const anomaly = input.categoryPatterns.find((item) => (item.vsBaselinePct ?? 0) >= 25);
  if (input.netSpendableFlow < 0) {
    return anomaly
      ? `Your spendable cashflow is negative this month, with ${anomaly.category.toLowerCase()} running materially above its recent baseline.`
      : 'Your spendable cashflow is negative this month. Review the categories driving the largest outflow before adding new commitments.';
  }

  if (input.spendingVelocity === 'elevated') {
    return anomaly
      ? `${anomaly.category} is the clearest spending deviation right now. Cashflow is still positive, but your current spending pace is above your recent pattern.`
      : 'Cashflow is positive, but spending is running faster than your recent monthly pattern.';
  }

  if ((input.savingsRatePct ?? 0) >= 20) {
    return 'Your current cashflow is positive and your savings allocation is holding up well against your recorded income.';
  }

  return 'Your cashflow is currently positive. Keep recording consistently so CrysTrack can distinguish normal variation from a genuine change in spending behaviour.';
}

export function summarizeWealth(
  entries: MoneyEntryLike[],
  debts: WealthDebtLike[] = [],
  expectedFlows: ExpectedFlowLike[] = [],
  now = new Date(),
): WealthSummary {
  let availableBalance = 0;
  let savedBalance = 0;
  let monthIncome = 0;
  let monthExpenses = 0;
  let monthSaved = 0;
  const months = new Set<string>();

  for (const entry of entries) {
    const amount = amountOf(entry.amount);
    const kind = flowKind(entry);
    const date = new Date(entry.date);
    if (!Number.isNaN(date.getTime())) months.add(monthKey(date));

    availableBalance += affectsAvailable(kind, amount);
    savedBalance += affectsSavings(kind, amount);

    if (!Number.isNaN(date.getTime()) && sameMonth(date, now)) {
      if (kind === 'income') monthIncome += amount;
      if (kind === 'expense') monthExpenses += amount;
      if (kind === 'saving') monthSaved += amount;
      if (kind === 'savings_release') monthSaved -= amount;
    }
  }

  savedBalance = Math.max(0, savedBalance);

  const receivables = debts
    .filter((debt) => debt.kind === 'receivable' && debt.status === 'open')
    .reduce((sum, debt) => sum + amountOf(debt.outstanding_amount), 0);

  const liabilities = debts
    .filter((debt) => debt.kind === 'liability' && debt.status === 'open')
    .reduce((sum, debt) => sum + amountOf(debt.outstanding_amount), 0);

  const netPosition = availableBalance + savedBalance + receivables - liabilities;
  const netSpendableFlow = monthIncome - monthExpenses - Math.max(0, monthSaved);
  const savingsRatePct = monthIncome > 0 ? (Math.max(0, monthSaved) / monthIncome) * 100 : null;
  const averageDailySpend = monthExpenses / Math.max(1, now.getDate());
  const projectedMonthExpenses = averageDailySpend * endOfMonth(now).getDate();

  const prior = previousMonth(now);
  const priorMonthExpenses = entries
    .filter((entry) => flowKind(entry) === 'expense' && sameMonth(new Date(entry.date), prior))
    .reduce((sum, entry) => sum + amountOf(entry.amount), 0);

  const projectedExpenseChangePct = priorMonthExpenses > 0
    ? ((projectedMonthExpenses - priorMonthExpenses) / priorMonthExpenses) * 100
    : null;

  const range = expectedRange(expectedFlows, now);
  const dueDebt = dueLiabilities(debts, now);
  const safeToSpend = Math.max(0, availableBalance - range.expenseMax - dueDebt);
  const projectedMonthEndLow = availableBalance + range.incomeMin - range.expenseMax - dueDebt;
  const projectedMonthEndHigh = availableBalance + range.incomeMax - range.expenseMin - dueDebt;
  const categoryPatterns = buildCategoryPatterns(entries, now);

  const spendingVelocity: WealthSummary['spendingVelocity'] =
    projectedExpenseChangePct == null
      ? 'insufficient'
      : projectedExpenseChangePct >= 15
        ? 'elevated'
        : projectedExpenseChangePct <= -15
          ? 'low'
          : 'normal';

  const partial = {
    availableBalance,
    savedBalance,
    receivables,
    liabilities,
    netPosition,
    monthIncome,
    monthExpenses,
    monthSaved: Math.max(0, monthSaved),
    netSpendableFlow,
    savingsRatePct,
    averageDailySpend,
    projectedMonthExpenses,
    priorMonthExpenses,
    projectedExpenseChangePct,
    safeToSpend,
    projectedMonthEndLow,
    projectedMonthEndHigh,
    dataMonths: months.size,
    categoryPatterns,
    spendingVelocity,
  };

  return {
    ...partial,
    deterministicRemark: remarkFromSummary(partial),
  };
}

export function convertFromNgn(amountNgn: number, currency: WealthDisplayCurrency, usdNgn: number | null | undefined) {
  if (currency === 'NGN') return amountNgn;
  if (!usdNgn || !Number.isFinite(usdNgn) || usdNgn <= 0) return null;
  return amountNgn / usdNgn;
}

export function formatWealthMoney(
  amountNgn: number,
  currency: WealthDisplayCurrency = 'NGN',
  usdNgn?: number | null,
  options: { compact?: boolean; sign?: boolean } = {},
) {
  const converted = convertFromNgn(amountNgn, currency, usdNgn);
  if (converted == null) return '—';

  const prefix = options.sign && converted > 0 ? '+' : '';
  const locale = currency === 'NGN' ? 'en-NG' : 'en-US';
  const maximumFractionDigits = currency === 'NGN' ? 0 : 2;

  return prefix + new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: options.compact ? 'compact' : 'standard',
    maximumFractionDigits,
  }).format(converted);
}

export function suggestCategory(source: string, entries: MoneyEntryLike[]) {
  const needle = source.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!needle) return null;

  const scores = new Map<string, number>();
  for (const entry of entries) {
    const entrySource = String(entry.source || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const category = String(entry.category || '').trim();
    if (!entrySource || !category) continue;

    if (entrySource === needle) scores.set(category, (scores.get(category) || 0) + 5);
    else if (entrySource.includes(needle) || needle.includes(entrySource)) {
      scores.set(category, (scores.get(category) || 0) + 2);
    }
  }

  return Array.from(scores.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

export function sanitizedWealthMetrics(summary: WealthSummary) {
  const anomalies = summary.categoryPatterns
    .filter((item) => (item.vsBaselinePct ?? 0) >= 20)
    .slice(0, 4)
    .map((item) => ({
      category: item.category,
      vs_baseline_pct: Math.round(item.vsBaselinePct || 0),
    }));

  return {
    data_months: summary.dataMonths,
    cashflow: summary.netSpendableFlow > 0 ? 'positive' : summary.netSpendableFlow < 0 ? 'negative' : 'neutral',
    savings_rate_pct: summary.savingsRatePct == null ? null : Math.round(summary.savingsRatePct),
    projected_expense_change_pct: summary.projectedExpenseChangePct == null ? null : Math.round(summary.projectedExpenseChangePct),
    spending_velocity: summary.spendingVelocity,
    largest_category_share_pct: summary.categoryPatterns[0] ? Math.round(summary.categoryPatterns[0].sharePct) : null,
    category_anomalies: anomalies,
    debt_position: summary.liabilities === 0 ? 'none' : summary.netPosition > summary.liabilities ? 'contained' : 'material',
    receivable_position: summary.receivables === 0 ? 'none' : 'present',
  };
}
