import type { WealthDisplayCurrency } from "@/config/experience";
import {
  toKobo,
  signedKobo,
  fromKobo,
  divideMoney,
  ratioPercent,
  usdCents,
} from "@/lib/money";
import { dateKeyForInstant } from "@/lib/reminders";
import {
  availableImpact,
  cashForecast,
  merchantCategory,
} from "@/lib/finance/logic";
export interface MoneyEntryLike {
  id?: string;
  type: string;
  deleted_at?: string | null;
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
  kind: "receivable" | "liability";
  original_amount: number | string;
  outstanding_amount: number | string;
  due_date?: string | null;
  status: "open" | "settled";
}

export interface ExpectedFlowLike {
  id: string;
  direction: "income" | "expense";
  amount_min: number | string;
  amount_max?: number | string | null;
  frequency:
    "one_off" | "weekly" | "monthly" | "quarterly" | "yearly" | "irregular";
  expected_on?: string | null;
  status: "active" | "paused" | "completed";
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
  exact: Record<string, string>;
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
  spendingVelocity: "low" | "normal" | "elevated" | "insufficient";
  deterministicRemark: string;
}

const z = BigInt(0),
  positive = (n: bigint) => (n > z ? n : z);
// Legacy numeric DTOs are display/AI boundaries only. Every calculation above that boundary is integer kobo.
const display = (n: bigint) => Number(fromKobo(n));
function remarkFromSummary(input: Omit<WealthSummary, "deterministicRemark">) {
  if (input.dataMonths < 2) {
    return "Keep recording consistently. CrysTrack needs more history before it can judge your normal spending pattern reliably.";
  }

  const anomaly = input.categoryPatterns.find(
    (item) => (item.vsBaselinePct ?? 0) >= 25,
  );
  if (input.netSpendableFlow < 0) {
    return anomaly
      ? `Your spendable cashflow is negative this month, with ${anomaly.category.toLowerCase()} running materially above its recent baseline.`
      : "Your spendable cashflow is negative this month. Review the categories driving the largest outflow before adding new commitments.";
  }

  if (input.spendingVelocity === "elevated") {
    return anomaly
      ? `${anomaly.category} is the clearest spending deviation right now. Cashflow is still positive, but your current spending pace is above your recent pattern.`
      : "Cashflow is positive, but spending is running faster than your recent monthly pattern.";
  }

  if ((input.savingsRatePct ?? 0) >= 20) {
    return "Your current cashflow is positive and your savings allocation is holding up well against your recorded income.";
  }

  return "Your cashflow is currently positive. Keep recording consistently so CrysTrack can distinguish normal variation from a genuine change in spending behaviour.";
}

export function summarizeWealth(
  entries: MoneyEntryLike[],
  debts: WealthDebtLike[] = [],
  flows: ExpectedFlowLike[] = [],
  now = new Date(),
  timezone = "UTC",
): WealthSummary {
  const day = dateKeyForInstant(now, timezone),
    month = day.slice(0, 7),
    elapsed = Number(day.slice(8));
  const end = new Date(`${month}-01T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  const days = end.getUTCDate(),
    prev = new Date(`${month}-01T00:00:00Z`);
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const prior = prev.toISOString().slice(0, 7);
  let available = z,
    saved = z,
    income = z,
    expenses = z,
    allocated = z,
    priorExpenses = z;
  const months = new Set<string>(),
    totals = new Map<string, Map<string, bigint>>();
  for (const e of entries) {
    if (e.deleted_at) continue;
    const entryDay = dateKeyForInstant(new Date(e.date), timezone);
    if (entryDay > day) continue;
    const key = entryDay.slice(0, 7);
    const amount = toKobo(e.amount),
      kind = e.flow_kind || e.type;
    months.add(key);
    available += availableImpact(e);
    if (kind === "saving") saved += amount;
    if (kind === "savings_release") saved -= amount;
    if (key === month) {
      if (kind === "income") income += amount;
      if (kind === "expense") expenses += amount;
      if (kind === "saving") allocated += amount;
      if (kind === "savings_release") allocated -= amount;
    }
    if (kind === "expense") {
      if (key === prior) priorExpenses += amount;
      const category = e.category || "Other",
        map = totals.get(category) || new Map<string, bigint>();
      map.set(key, (map.get(key) || z) + amount);
      totals.set(category, map);
    }
  }
  const projection = divideMoney(expenses * BigInt(days), BigInt(elapsed)),
    change =
      priorExpenses > z
        ? ratioPercent(projection - priorExpenses, priorExpenses)
        : null;
  const baselineKeys = Array.from(months)
    .filter((m) => m < month)
    .sort()
    .slice(-3);
  const categoryPatterns = Array.from(totals.entries())
    .map(([category, map]) => {
      const current = map.get(month) || z,
        baseline = baselineKeys.length
          ? divideMoney(
              baselineKeys.reduce((n, k) => n + (map.get(k) || z), z),
              BigInt(baselineKeys.length),
            )
          : null,
        projected = divideMoney(current * BigInt(days), BigInt(elapsed));
      return {
        category,
        current: display(current),
        baseline: baseline === null ? null : display(baseline),
        projected: display(projected),
        vsBaselinePct:
          baseline && baseline > z
            ? ratioPercent(projected - baseline, baseline)
            : null,
        sharePct: ratioPercent(current, expenses),
      };
    })
    .sort((a, b) => b.current - a.current);
  const receivables = debts
      .filter((d) => d.kind === "receivable" && d.status === "open")
      .reduce((n, d) => n + toKobo(d.outstanding_amount), z),
    liabilities = debts
      .filter((d) => d.kind === "liability" && d.status === "open")
      .reduce((n, d) => n + toKobo(d.outstanding_amount), z);
  const horizon = cashForecast(
      fromKobo(available),
      [],
      flows,
      day,
      30,
      timezone,
    ).filter((p) => p.day.slice(0, 7) === month),
    last = horizon[horizon.length - 1];
  const dueDebt = debts
    .filter(
      (d) =>
        d.kind === "liability" &&
        d.status === "open" &&
        (!d.due_date ||
          dateKeyForInstant(new Date(d.due_date), timezone) <=
            end.toISOString().slice(0, 10)),
    )
    .reduce((n, d) => n + toKobo(d.outstanding_amount), z);
  const low = (last ? signedKobo(last.low) : available) - dueDebt,
    high = (last ? signedKobo(last.high) : available) - dueDebt;
  const expensesOnly = cashForecast(
    fromKobo(available),
    [],
    flows.filter((f) => f.direction === "expense"),
    day,
    30,
    timezone,
  )
    .filter((p) => p.day.slice(0, 7) === month)
    .at(-1);
  const reserved =
    available -
    (expensesOnly ? signedKobo(expensesOnly.low) : available) +
    dueDebt;
  const amounts = {
    availableBalance: available,
    savedBalance: positive(saved),
    receivables,
    liabilities,
    netPosition: available + positive(saved) + receivables - liabilities,
    monthIncome: income,
    monthExpenses: expenses,
    monthSaved: positive(allocated),
    netSpendableFlow: income - expenses - positive(allocated),
    averageDailySpend: divideMoney(expenses, BigInt(elapsed)),
    projectedMonthExpenses: projection,
    priorMonthExpenses: priorExpenses,
    safeToSpend: positive(available - reserved),
    projectedMonthEndLow: low,
    projectedMonthEndHigh: high,
    reservedOutflows: reserved,
  };
  const result: WealthSummary = {
    exact: Object.fromEntries(
      Object.entries(amounts).map(([key, n]) => [key, fromKobo(n)]),
    ),
    availableBalance: display(available),
    savedBalance: display(positive(saved)),
    receivables: display(receivables),
    liabilities: display(liabilities),
    netPosition: display(
      available + positive(saved) + receivables - liabilities,
    ),
    monthIncome: display(income),
    monthExpenses: display(expenses),
    monthSaved: display(positive(allocated)),
    netSpendableFlow: display(income - expenses - positive(allocated)),
    savingsRatePct:
      income > z ? ratioPercent(positive(allocated), income) : null,
    averageDailySpend: display(divideMoney(expenses, BigInt(elapsed))),
    projectedMonthExpenses: display(projection),
    priorMonthExpenses: display(priorExpenses),
    projectedExpenseChangePct: change,
    safeToSpend: display(positive(available - reserved)),
    projectedMonthEndLow: display(low),
    projectedMonthEndHigh: display(high),
    dataMonths: months.size,
    categoryPatterns,
    spendingVelocity:
      change === null
        ? "insufficient"
        : change >= 15
          ? "elevated"
          : change <= -15
            ? "low"
            : "normal",
    deterministicRemark: "",
  };
  return { ...result, deterministicRemark: remarkFromSummary(result) };
}

export function convertFromNgn(
  amountNgn: number | string,
  currency: WealthDisplayCurrency,
  rate: number | null | undefined,
) {
  if (currency === "NGN") return Number(fromKobo(signedKobo(amountNgn)));
  if (!rate || !Number.isFinite(rate) || rate <= 0) return null;
  return Number(fromKobo(usdCents(signedKobo(amountNgn), rate)));
}
export function formatWealthMoney(
  amountNgn: number | string,
  currency: WealthDisplayCurrency = "NGN",
  rate?: number | null,
  options: { compact?: boolean; sign?: boolean } = {},
) {
  let n = signedKobo(amountNgn);
  if (currency === "USD") {
    if (!rate || !Number.isFinite(rate) || rate <= 0) return "—";
    n = usdCents(n, rate);
  }
  // Formatting is a display boundary; keep September's compact notation and type scale.
  const prefix = options.sign && n > z ? "+" : "";
  return (
    prefix +
    new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", {
      style: "currency",
      currency,
      notation: options.compact ? "compact" : "standard",
      maximumFractionDigits: currency === "NGN" ? 0 : 2,
    }).format(Number(fromKobo(n)))
  );
}
export function suggestCategory(source: string, entries: MoneyEntryLike[]) {
  const needle = source.trim().toLowerCase().replace(/\s+/g, " ");
  if (!needle) return null;
  const matched = merchantCategory(source);
  if (matched) return matched;

  const scores = new Map<string, number>();
  for (const entry of entries) {
    const entrySource = String(entry.source || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    const category = String(entry.category || "").trim();
    if (!entrySource || !category) continue;

    if (entrySource === needle)
      scores.set(category, (scores.get(category) || 0) + 5);
    else if (entrySource.includes(needle) || needle.includes(entrySource)) {
      scores.set(category, (scores.get(category) || 0) + 2);
    }
  }

  return (
    Array.from(scores.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null
  );
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
    cashflow:
      summary.netSpendableFlow > 0
        ? "positive"
        : summary.netSpendableFlow < 0
          ? "negative"
          : "neutral",
    savings_rate_pct:
      summary.savingsRatePct == null
        ? null
        : Math.round(summary.savingsRatePct),
    projected_expense_change_pct:
      summary.projectedExpenseChangePct == null
        ? null
        : Math.round(summary.projectedExpenseChangePct),
    spending_velocity: summary.spendingVelocity,
    largest_category_share_pct: summary.categoryPatterns[0]
      ? Math.round(summary.categoryPatterns[0].sharePct)
      : null,
    category_anomalies: anomalies,
    debt_position:
      summary.liabilities === 0
        ? "none"
        : summary.netPosition > summary.liabilities
          ? "contained"
          : "material",
    receivable_position: summary.receivables === 0 ? "none" : "present",
  };
}
