import { toKobo, signedKobo, fromKobo, divideMoney } from "@/lib/money";
import { dateKeyForInstant } from "@/lib/reminders";
import { shiftAcademicDay } from "@/lib/assignments/time";
import type {
  LedgerEntry,
  WealthAccount,
  BudgetCap,
  RecurringBill,
  ForecastPoint,
} from "@/types/finance";
import type { ExpectedFlowLike } from "@/lib/wealth";
const zero = BigInt(0);
export function availableImpact(entry: {
  flow_kind?: string | null;
  type: string;
  amount: string | number;
}) {
  const kind = entry.flow_kind || entry.type,
    n = toKobo(entry.amount);
  return [
    "income",
    "borrow",
    "receivable_repayment",
    "savings_release",
  ].includes(kind)
    ? n
    : ["expense", "saving", "lend", "liability_repayment"].includes(kind)
      ? -n
      : zero;
}
export function accountBalances(
  accounts: WealthAccount[],
  entries: LedgerEntry[],
  today?: string,
  timezone = "UTC",
) {
  const balances = new Map(
    accounts.map((a) => [a.id, signedKobo(a.opening_balance)]),
  );
  for (const e of entries) {
    if (
      e.deleted_at ||
      (today && dateKeyForInstant(new Date(e.date), timezone) > today)
    )
      continue;
    const id = e.account_id || accounts[0]?.id;
    if (!id) continue;
    const transfer = (e.flow_kind || e.type) === "transfer";
    balances.set(
      id,
      (balances.get(id) || zero) +
        (transfer && e.destination_account_id
          ? -toKobo(e.amount)
          : availableImpact(e)),
    );
    if (transfer && e.destination_account_id)
      balances.set(
        e.destination_account_id,
        (balances.get(e.destination_account_id) || zero) + toKobo(e.amount),
      );
  }
  return accounts.map((a) => ({
    ...a,
    balance: fromKobo(balances.get(a.id) || zero),
  }));
}
export function velocityRunway(
  entries: Pick<
    LedgerEntry,
    "type" | "flow_kind" | "amount" | "date" | "deleted_at"
  >[],
  available: string,
  today: string,
  timezone: string,
) {
  const start = shiftAcademicDay(today, -6);
  const spent = entries
    .filter(
      (e) =>
        !e.deleted_at &&
        (e.flow_kind || e.type) === "expense" &&
        dateKeyForInstant(new Date(e.date), timezone) >= start &&
        dateKeyForInstant(new Date(e.date), timezone) <= today,
    )
    .reduce((n, e) => n + toKobo(e.amount), zero);
  const balance = signedKobo(available);
  return {
    daily: fromKobo(divideMoney(spent, BigInt(7))),
    spent: fromKobo(spent),
    days:
      spent > zero
        ? Number(((balance > zero ? balance : zero) * BigInt(7)) / spent)
        : null,
  };
}
export function reallocateCaps(
  from: string,
  to: string,
  amount: string,
  spent = "0",
) {
  const delta = toKobo(amount),
    source = toKobo(from),
    destination = toKobo(to);
  if (delta <= zero || source - delta < toKobo(spent))
    throw new Error(
      "Keep enough in this category for spending already recorded.",
    );
  return { from: fromKobo(source - delta), to: fromKobo(destination + delta) };
}
export function budgetStatus(
  caps: BudgetCap[],
  entries: LedgerEntry[],
  today: string,
  timezone: string,
  available: string,
) {
  const month = today.slice(0, 7),
    last = new Date(`${month}-01T00:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const days = last.getUTCDate() - Number(today.slice(8)) + 1;
  const rows = caps
    .filter((c) => c.month === `${month}-01`)
    .map((c) => {
      const spent = entries
        .filter(
          (e) =>
            !e.deleted_at &&
            (e.flow_kind || e.type) === "expense" &&
            e.category === c.category &&
            dateKeyForInstant(new Date(e.date), timezone).slice(0, 7) === month,
        )
        .reduce((n, e) => n + toKobo(e.amount), zero);
      const left = toKobo(c.cap) - spent;
      return {
        ...c,
        spent: fromKobo(spent),
        left: fromKobo(left),
        today: fromKobo(divideMoney(left > zero ? left : zero, BigInt(days))),
      };
    });
  const allocated = rows.reduce((n, c) => n + toKobo(c.cap), zero);
  const income = entries
    .filter(
      (e) =>
        !e.deleted_at &&
        (e.flow_kind || e.type) === "income" &&
        dateKeyForInstant(new Date(e.date), timezone).slice(0, 7) === month,
    )
    .reduce((n, e) => n + toKobo(e.amount), zero);
  const left = rows.reduce((n, c) => n + signedKobo(c.left), zero),
    balance = signedKobo(available);
  return {
    rows,
    allocated: fromKobo(allocated),
    unassigned: fromKobo(income - allocated),
    today: fromKobo(
      divideMoney(
        left < balance
          ? left > zero
            ? left
            : zero
          : balance > zero
            ? balance
            : zero,
        BigInt(days),
      ),
    ),
  };
}
/** Anchor day is retained for short months (Jan 31 -> Feb 28 -> Mar 31). */
export function occurrences(
  anchor: string,
  frequency: string,
  start: string,
  end: string,
): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || anchor > end) return [];
  if (frequency === "irregular" || frequency === "one_off")
    return anchor >= start && anchor <= end ? [anchor] : [];
  const origin = new Date(`${anchor}T00:00:00Z`),
    result: string[] = [];
  if (frequency === "weekly") {
    const steps = Math.max(
      0,
      Math.ceil((Date.parse(start) - Date.parse(anchor)) / 604800000),
    );
    for (
      let day = shiftAcademicDay(anchor, steps * 7);
      day <= end;
      day = shiftAcademicDay(day, 7)
    )
      result.push(day);
  } else {
    const step =
      frequency === "yearly" ? 12 : frequency === "quarterly" ? 3 : 1;
    const startDate = new Date(`${start}T00:00:00Z`);
    const offset = Math.max(
      0,
      Math.floor(
        ((startDate.getUTCFullYear() - origin.getUTCFullYear()) * 12 +
          startDate.getUTCMonth() -
          origin.getUTCMonth()) /
          step,
      ),
    );
    for (let i = offset; i < offset + 100; i++) {
      const d = new Date(
        Date.UTC(
          origin.getUTCFullYear(),
          origin.getUTCMonth() + i * step + 1,
          0,
        ),
      );
      d.setUTCDate(Math.min(origin.getUTCDate(), d.getUTCDate()));
      const key = d.toISOString().slice(0, 10);
      if (key > end) break;
      if (key >= start) result.push(key);
    }
  }
  return result;
}
export function cashForecast(
  available: string,
  bills: RecurringBill[],
  flows: ExpectedFlowLike[],
  today: string,
  horizon: 30 | 60 | 90,
  timezone: string,
): ForecastPoint[] {
  let low = signedKobo(available),
    high = low;
  const end = shiftAcademicDay(today, horizon),
    events = new Map<string, { low: bigint; high: bigint; title: string }[]>();
  const add = (day: string, l: bigint, h: bigint, title: string) =>
    events.set(day, [...(events.get(day) || []), { low: l, high: h, title }]);
  for (const bill of bills.filter((b) => b.active))
    for (const day of occurrences(bill.next_due, bill.frequency, today, end))
      if (!bill.last_paid_on || day > bill.last_paid_on)
        add(day, -toKobo(bill.amount), -toKobo(bill.amount), bill.title);
  for (const f of flows.filter((f) => f.status === "active" && f.expected_on)) {
    const anchor = dateKeyForInstant(new Date(f.expected_on!), timezone),
      confirmed = f.last_confirmed_at
        ? dateKeyForInstant(new Date(f.last_confirmed_at), timezone)
        : null;
    for (const day of occurrences(anchor, f.frequency, today, end)) {
      if (confirmed && day <= confirmed) continue;
      const min = toKobo(f.amount_min),
        max = toKobo(f.amount_max ?? f.amount_min);
      add(
        day,
        f.direction === "income" ? min : -max,
        f.direction === "income" ? max : -min,
        "Expected " + f.direction,
      );
    }
  }
  return Array.from({ length: horizon + 1 }, (_, i) => {
    const day = shiftAcademicDay(today, i),
      items = events.get(day) || [];
    for (const e of items) {
      low += e.low;
      high += e.high;
    }
    return {
      day,
      low: fromKobo(low),
      high: fromKobo(high),
      charges: items.map((e) => e.title),
    };
  });
}
export function annualBillCost(
  bill: Pick<RecurringBill, "amount" | "frequency" | "next_due">,
  today: string,
) {
  const end = shiftAcademicDay(today, 364);
  return fromKobo(
    toKobo(bill.amount) *
      BigInt(occurrences(bill.next_due, bill.frequency, today, end).length),
  );
}
export function merchantCategory(note: string): string | null {
  if (/\b(chowdeck)\b/i.test(note)) return "Food";
  if (/\b(bolt|uber)\b/i.test(note)) return "Transport";
  if (/\b(opay|moniepoint|kuda|gtb|gtbank)\b/i.test(note))
    return "Transfers & Banking";
  return null;
}
export function weeklySavingsStreak(
  entries: LedgerEntry[],
  targetId: string,
  today: string,
  timezone: string,
) {
  const day = new Date(`${today}T00:00:00Z`),
    monday = shiftAcademicDay(today, -((day.getUTCDay() + 6) % 7));
  const weeks = new Set(
    entries
      .filter(
        (e) =>
          !e.deleted_at &&
          e.target_id === targetId &&
          e.flow_kind === "saving" &&
          dateKeyForInstant(new Date(e.date), timezone) <= today,
      )
      .map((e) => {
        const key = dateKeyForInstant(new Date(e.date), timezone),
          d = new Date(`${key}T00:00:00Z`);
        return shiftAcademicDay(key, -((d.getUTCDay() + 6) % 7));
      }),
  );
  let cursor = weeks.has(monday) ? monday : shiftAcademicDay(monday, -7),
    count = 0;
  while (weeks.has(cursor)) {
    count++;
    cursor = shiftAcademicDay(cursor, -7);
  }
  return count;
}

/** Saved-zone inclusive period, for the existing Insights financial snapshot. */
export function periodTotals(
  entries: Pick<
    LedgerEntry,
    "flow_kind" | "type" | "amount" | "date" | "deleted_at"
  >[],
  today: string,
  timezone: string,
  days = 30,
) {
  const start = shiftAcademicDay(today, -(days - 1)),
    totals = { income: zero, expense: zero, saving: zero };
  for (const e of entries) {
    if (e.deleted_at) continue;
    const day = dateKeyForInstant(new Date(e.date), timezone);
    if (day < start || day > today) continue;
    const kind = e.flow_kind || e.type,
      n = toKobo(e.amount);
    if (kind === "income") totals.income += n;
    if (kind === "expense") totals.expense += n;
    if (kind === "saving") totals.saving += n;
    if (kind === "savings_release") totals.saving -= n;
  }
  return totals;
}
