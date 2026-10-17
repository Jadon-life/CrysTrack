import { createClient } from "@/lib/supabase/server";
import { savedTimezone } from "@/lib/goals/service";
import { summarizeWealth } from "@/lib/wealth";
import { signedKobo, fromKobo } from "@/lib/money";
type DB = Awaited<ReturnType<typeof createClient>>;
export async function readLedger(db: DB, uid: string, includeDeleted = false) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = db
      .from("money_entries")
      .select("*")
      .eq("user_id", uid)
      .order("date", { ascending: false })
      .order("id", { ascending: false });
    if (!includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}
async function ownedRows(db: DB, uid: string, table: string) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const key = table === "wealth_settings" ? "user_id" : "id";
    const { data, error } = await db
      .from(table)
      .select("*")
      .eq("user_id", uid)
      .order(key, { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}
export async function loadWealth(db: DB, uid: string) {
  const tables = [
    "finance_targets",
    "wealth_debts",
    "wealth_expected_flows",
    "wealth_accounts",
    "wealth_budget_caps",
    "wealth_bills",
    "wealth_circles",
    "wealth_circle_contributions",
    "wealth_settings",
  ];
  const [entries, timezone, results] = await Promise.all([
    readLedger(db, uid),
    savedTimezone(db, uid),
    Promise.all(tables.map((t) => ownedRows(db, uid, t))),
  ]);
  const [
    targets,
    debts,
    expectedFlows,
    accounts,
    caps,
    bills,
    circles,
    contributions,
    settings,
  ] = results;
  const summary = summaryWithAccounts(
    entries,
    debts,
    expectedFlows,
    accounts,
    timezone,
  );
  return {
    entries,
    targets,
    debts,
    expectedFlows,
    accounts,
    caps,
    bills,
    circles,
    contributions,
    settings: settings[0] || null,
    timezone,
    summary,
  };
}
export function summaryWithAccounts(
  entries: any[],
  debts: any[],
  flows: any[],
  accounts: any[],
  timezone: string,
) {
  const summary = summarizeWealth(entries, debts, flows, new Date(), timezone),
    opening = accounts.reduce(
      (n: bigint, a: any) => n + signedKobo(a.opening_balance),
      BigInt(0),
    );
  for (const key of [
    "availableBalance",
    "netPosition",
    "projectedMonthEndLow",
    "projectedMonthEndHigh",
  ] as const) {
    summary.exact[key] = fromKobo(signedKobo(summary.exact[key]) + opening);
    summary[key] = Number(summary.exact[key]);
  }
  const safe =
    signedKobo(summary.exact.availableBalance) -
    signedKobo(summary.exact.reservedOutflows);
  summary.exact.safeToSpend = fromKobo(safe > BigInt(0) ? safe : BigInt(0));
  summary.safeToSpend = Number(summary.exact.safeToSpend);
  return summary;
}
