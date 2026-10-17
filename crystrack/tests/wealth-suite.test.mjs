import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const m = loadTs("src/lib/money.ts"),
  f = loadTs("src/lib/finance/logic.ts"),
  s = loadTs("src/lib/finance/statement.ts"),
  v = loadTs("src/lib/finance/validation.ts"),
  w = loadTs("src/lib/wealth.ts");
const uid = "00000000-0000-4000-8000-000000000001",
  account = "10000000-0000-4000-8000-000000000001";
const entry = (
  amount,
  date = "2026-10-17T12:00:00Z",
  flow_kind = "expense",
  extra = {},
) => ({
  id: "entry",
  user_id: uid,
  type: flow_kind,
  flow_kind,
  amount,
  date,
  category: "Food",
  source: "Chowdeck",
  account_id: account,
  deleted_at: null,
  ...extra,
});
const bill = (extra = {}) => ({
  id: "bill",
  user_id: uid,
  title: "Data",
  amount: "100.10",
  next_due: "2026-10-17",
  frequency: "monthly",
  category: "Bills",
  active: true,
  last_paid_on: null,
  ...extra,
});
test("integer money preserves all DECIMAL boundaries and rejects ambiguous inputs", () => {
  for (const raw of ["0", "0.01", "0.10", "99.99", "9999999999.99"])
    assert.equal(m.toKobo(m.fromKobo(m.toKobo(raw))), m.toKobo(raw));
  for (const bad of [
    "-1",
    "1e3",
    "1.001",
    "NaN",
    "Infinity",
    "",
    " 1",
    "1,000",
    "10000000000.00",
  ])
    assert.throws(() => m.toKobo(bad));
  assert.equal(m.fromKobo(m.toKobo("0.1") + m.toKobo("0.2")), "0.30");
  assert.equal(m.fromKobo(m.signedKobo("-123.45")), "-123.45");
  assert.equal(m.formatMoney("-1234.56"), "-₦1,234.56");
  assert.equal(m.formatMoney("10000000000.00"), "₦10,000,000,000.00");
});
test("money rounding uses half away from zero and integer percentage basis points", () => {
  assert.equal(m.divideMoney(BigInt(5), BigInt(2)), BigInt(3));
  assert.equal(m.divideMoney(-BigInt(5), BigInt(2)), -BigInt(3));
  assert.throws(() => m.divideMoney(BigInt(1), BigInt(0)));
  assert.equal(m.fromKobo(m.percentageOf(m.toKobo("200.25"), 1000)), "20.03");
  assert.equal(m.percentageOf(m.toKobo("0.01"), 100), BigInt(0));
  for (const bps of [-1, 10001, 1.1])
    assert.throws(() => m.percentageOf(BigInt(1), bps));
});
test("USD conversions use rational integer math and do not invent unavailable rates", () => {
  assert.equal(m.fromKobo(m.usdCents(m.toKobo("1500.50"), "1500.5")), "1.00");
  assert.equal(m.fromKobo(m.usdCents(m.toKobo("1500.50"), "3")), "500.17");
  assert.equal(w.formatWealthMoney("1500.50", "USD", 1500.5), "$1.00");
  assert.equal(w.formatWealthMoney("1", "USD", null), "—");
  assert.throws(() => m.usdCents(BigInt(10), "0"));
});
test("account transfers preserve combined balances and never become spending", () => {
  const accounts = [
    { id: account, opening_balance: "100.10" },
    { id: "b", opening_balance: "0.20" },
  ];
  const rows = [
    entry("25.15", undefined, "transfer", { destination_account_id: "b" }),
    entry("0.10", undefined, "expense"),
  ];
  const balances = f.accountBalances(accounts, rows);
  assert.equal(balances[0].balance, "74.85");
  assert.equal(balances[1].balance, "25.35");
  assert.equal(f.availableImpact(rows[0]), BigInt(0));
});
test("velocity uses exact trailing seven local days, excluding savings, transfers, removed and future entries", () => {
  const rows = [
    entry("29400"),
    entry("100000", "2026-10-10T22:59:59Z"),
    entry("5", "2026-10-17T12:00:00Z", "saving"),
    entry("100", "2026-10-18T00:00:00Z"),
    entry("99", undefined, "expense", { deleted_at: "today" }),
  ];
  const result = f.velocityRunway(rows, "75600", "2026-10-17", "Africa/Lagos");
  assert.deepEqual(result, { daily: "4200.00", spent: "29400.00", days: 18 });
  assert.equal(f.velocityRunway([], "100", "2026-10-17", "UTC").days, null);
  assert.equal(
    f.velocityRunway([entry("1")], "-1", "2026-10-17", "UTC").days,
    0,
  );
});
test("runway floors full days using unrounded 7-day rate, including tiny amounts", () => {
  assert.equal(
    f.velocityRunway([entry("0.01")], "0.01", "2026-10-17", "UTC").days,
    7,
  );
  assert.equal(
    f.velocityRunway([entry("0.03")], "0.10", "2026-10-17", "UTC").days,
    23,
  );
});
test("budget reallocation preserves total kobo and protects recorded spend", () => {
  const result = f.reallocateCaps("100.01", "20.09", "0.10", "99.91");
  assert.deepEqual(result, { from: "99.91", to: "20.19" });
  assert.equal(m.toKobo(result.from) + m.toKobo(result.to), m.toKobo("120.10"));
  assert.throws(() => f.reallocateCaps("100", "20", "1", "100"));
  assert.throws(() => f.reallocateCaps("1", "2", "0"));
});
test("budget caps and daily allowance use the saved month and clamp negative spendable room", () => {
  const caps = [{ month: "2026-11-01", category: "Food", cap: "100.00" }],
    rows = [entry("30.01", "2026-10-31T23:30:00Z")];
  const b = f.budgetStatus(caps, rows, "2026-11-01", "Africa/Lagos", "100");
  assert.equal(b.rows[0].spent, "30.01");
  assert.equal(b.rows[0].left, "69.99");
  assert.equal(b.today, "2.33");
  assert.equal(b.unassigned, "-100.00");
  assert.equal(
    f.budgetStatus(caps, rows, "2026-11-01", "Africa/Lagos", "-1").today,
    "0.00",
  );
});
test("monthly recurrence preserves anchor across February and leap years", () => {
  assert.deepEqual(
    f.occurrences("2026-01-31", "monthly", "2026-02-01", "2026-04-30"),
    ["2026-02-28", "2026-03-31", "2026-04-30"],
  );
  assert.deepEqual(
    f.occurrences("2024-02-29", "yearly", "2025-01-01", "2026-12-31"),
    ["2025-02-28", "2026-02-28"],
  );
  assert.deepEqual(
    f.occurrences("2026-01-31", "quarterly", "2026-01-01", "2026-12-31"),
    ["2026-01-31", "2026-04-30", "2026-07-31", "2026-10-31"],
  );
});
test("weekly, one-off and irregular schedules respect their anchors and bounds", () => {
  assert.deepEqual(
    f.occurrences("2026-10-01", "weekly", "2026-10-10", "2026-10-22"),
    ["2026-10-15", "2026-10-22"],
  );
  assert.deepEqual(
    f.occurrences("2026-10-17", "one_off", "2026-10-17", "2026-10-20"),
    ["2026-10-17"],
  );
  assert.deepEqual(
    f.occurrences("2026-10-01", "irregular", "2026-10-17", "2026-10-20"),
    [],
  );
});
test("cash forecast uses exact low/high income ranges and recurring expense bounds", () => {
  const flow = {
    direction: "income",
    amount_min: "200.10",
    amount_max: "300.20",
    expected_on: "2026-10-18T00:00:00Z",
    frequency: "one_off",
    status: "active",
  };
  const points = f.cashForecast(
    "100.20",
    [bill()],
    [flow],
    "2026-10-17",
    30,
    "Africa/Lagos",
  );
  assert.equal(points.length, 31);
  assert.equal(points[0].low, "0.10");
  assert.equal(points[1].low, "200.20");
  assert.equal(points[1].high, "300.30");
  assert.equal(points[30].low, "200.20");
  const expenses = f.cashForecast(
    "1.00",
    [],
    [{ ...flow, direction: "expense" }],
    "2026-10-17",
    30,
    "UTC",
  );
  assert.equal(expenses[1].low, "-299.20");
  assert.equal(expenses[1].high, "-199.10");
});
test("forecast omits paid and paused bills, and confirmed occurrences but retains future recurrences", () => {
  const flow = {
    direction: "income",
    amount_min: "50",
    expected_on: "2026-10-17T00:00:00Z",
    last_confirmed_at: "2026-10-17T12:00:00Z",
    frequency: "weekly",
    status: "active",
  };
  const points = f.cashForecast(
    "0",
    [bill({ last_paid_on: "2026-10-17" }), bill({ active: false })],
    [flow],
    "2026-10-17",
    30,
    "UTC",
  );
  assert.equal(points[0].low, "0.00");
  assert.equal(points[7].low, "50.00");
});
test("30/60/90-day forecasts emit complete day sequences across DST", () => {
  for (const d of [30, 60, 90]) {
    const p = f.cashForecast(
      "0.10",
      [],
      [],
      "2026-10-17",
      d,
      "America/New_York",
    );
    assert.equal(p.length, d + 1);
    assert.ok(p.every((r) => r.low === "0.10"));
    assert.equal(new Set(p.map((r) => r.day)).size, d + 1);
  }
});
test("annual costs use actual anchored charges rather than a float monthly multiplier", () => {
  assert.equal(
    f.annualBillCost(bill({ amount: "0.10" }), "2026-10-17"),
    "1.20",
  );
  assert.equal(
    f.annualBillCost(
      bill({ frequency: "weekly", amount: "1.00" }),
      "2026-10-17",
    ),
    "53.00",
  );
});
test("Nigerian merchant matching uses word boundaries, avoids fabricated spending categories for banks", () => {
  for (const n of ["OPay", "Moniepoint", "Kuda", "GTB"])
    assert.equal(f.merchantCategory(n + " transfer"), "Transfers & Banking");
  assert.equal(f.merchantCategory("Chowdeck lunch"), "Food");
  assert.equal(f.merchantCategory("Bolt trip"), "Transport");
  assert.equal(f.merchantCategory("Uber trip"), "Transport");
  assert.equal(f.merchantCategory("Bolton groceries"), null);
});
test("savings streak counts consecutive saved-zone weeks, excluding reversals", () => {
  const rows = [
    entry("1", "2026-10-12T00:00:00Z", "saving", { target_id: "t" }),
    entry("1", "2026-10-05T00:00:00Z", "saving", { target_id: "t" }),
    entry("1", "2026-09-28T00:00:00Z", "saving", {
      target_id: "t",
      deleted_at: "x",
    }),
  ];
  assert.equal(f.weeklySavingsStreak(rows, "t", "2026-10-17", "UTC"), 2);
});
test("legacy summary aggregates cents exactly and uses saved-zone months", () => {
  const rows = [
    entry("0.10", "2026-10-31T23:30:00Z", "income"),
    entry("0.20", "2026-10-31T23:35:00Z", "income"),
    entry("0.05", "2026-10-31T23:40:00Z", "expense"),
  ];
  const summary = w.summarizeWealth(
    rows,
    [],
    [],
    new Date("2026-11-01T00:00:00Z"),
    "Africa/Lagos",
  );
  assert.equal(summary.monthIncome, 0.3);
  assert.equal(summary.monthExpenses, 0.05);
  assert.equal(summary.availableBalance, 0.25);
});
test("CSV parser supports BOM, CRLF, embedded commas/newlines and escaped quotes", () => {
  assert.deepEqual(
    s.parseCSV('\uFEFFDate,Description\r\n2026-10-17,"a, b\n""quoted"""'),
    [
      ["Date", "Description"],
      ["2026-10-17", 'a, b\n"quoted"'],
    ],
  );
  assert.throws(() => s.parseCSV('a,"incomplete'));
});
test("statement preview normalizes kobo, suggests categories and flags within-file/existing duplicates", () => {
  const csv =
    "Date,Description,Amount,Type\n2026-10-17,Chowdeck,0.10,expense\n2026-10-17,Chowdeck,0.10,expense\n2026-10-17,Salary,100.00,income";
  const rows = s.statementPreview(csv, account, []);
  assert.equal(rows[0].category, "Food");
  assert.equal(rows[0].amount, "0.10");
  assert.equal(rows[1].duplicate, true);
  assert.equal(rows[1].selected, false);
  const existing = [entry("0.10")];
  assert.equal(s.statementPreview(csv, account, existing)[0].duplicate, true);
});
test("debit-credit import rejects ambiguous rows and invalid dates", () => {
  assert.equal(
    s.statementPreview(
      "Date,Description,Debit,Credit\n2026-10-17,OPay,,100.10",
      account,
      [],
    )[0].flowKind,
    "income",
  );
  for (const csv of [
    "Date,Description,Debit,Credit\n2026-10-17,x,1,1",
    "Date,Description,Amount,Type\n2026-02-30,x,1,expense",
    "Date,Description,Amount,Type\n2026-10-17,x,1.001,expense",
    "Date,Description,Amount,Type\n2026-10-17,x,1,unknown",
  ])
    assert.throws(() => s.statementPreview(csv, account, []));
});
test("CSV exports quote sensitive characters and neutralize spreadsheet formulas", () => {
  const csv = s.exportCSV([
    { source: '=HYPERLINK("bad")', note: "a,b\nc", amount: "0.10" },
  ]);
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"a,b\nc"'));
});
test("entry validators reject sub-kobo, forged owner fields and missing revision", () => {
  assert.equal(
    v.entryFields.safeParse({ flowKind: "expense", amount: "0.10" }).success,
    true,
  );
  for (const bad of [
    { flowKind: "expense", amount: "0.001" },
    { flowKind: "expense", amount: "1", user_id: uid },
  ])
    assert.equal(v.entryFields.safeParse(bad).success, false);
  assert.equal(v.entryPatch.safeParse({ amount: "2" }).success, false);
  assert.equal(
    v.entryPatch.safeParse({ expectedRevision: 1, action: "restore" }).success,
    true,
  );
});

test("exact summaries preserve aggregates beyond Number precision at cent scale", () => {
  const rows = Array.from({ length: 1001 }, () =>
    entry("9999999999.99", "2026-10-17T00:00:00Z", "income"),
  );
  const summary = w.summarizeWealth(
    rows,
    [],
    [],
    new Date("2026-10-17T12:00:00Z"),
    "UTC",
  );
  assert.equal(
    summary.exact.availableBalance,
    m.fromKobo(m.toKobo("9999999999.99") * BigInt(1001)),
  );
});
test("safe-to-spend never relies on expected income to cover future expenses", () => {
  const flows = [
    {
      direction: "income",
      amount_min: "1000",
      expected_on: "2026-10-18T00:00:00Z",
      frequency: "one_off",
      status: "active",
    },
    {
      direction: "expense",
      amount_min: "200",
      expected_on: "2026-10-19T00:00:00Z",
      frequency: "one_off",
      status: "active",
    },
  ];
  const summary = w.summarizeWealth(
    [entry("100", "2026-10-17T00:00:00Z", "income")],
    [],
    flows,
    new Date("2026-10-17T12:00:00Z"),
    "UTC",
  );
  assert.equal(summary.safeToSpend, 0);
  assert.equal(summary.exact.reservedOutflows, "200.00");
  const data = loadTs("src/lib/finance/data.ts", {
    "@/lib/supabase/server": {},
    "@/lib/goals/service": {},
  });
  const now = new Date(),
    due = new Date(now);
  due.setUTCHours(23, 59, 0, 0);
  const adjusted = data.summaryWithAccounts(
    [],
    [],
    [{ ...flows[1], expected_on: due.toISOString() }],
    [{ opening_balance: "100" }],
    "UTC",
  );
  assert.equal(adjusted.exact.safeToSpend, "0.00");
});
test("recurring bills join the existing timeboxed calendar using anchored local dates", () => {
  const { calendarEvents } = loadTs("src/lib/rhythm/logic.ts");
  const input = {
    tasks: [],
    occurrences: [],
    assignments: [],
    goals: [],
    flows: [],
    reminders: [],
    boxes: [],
    rituals: [],
    bills: [bill({ next_due: "2026-01-31" })],
  };
  const events = calendarEvents(
    input,
    "2026-02-01",
    "2026-02-28",
    "Africa/Lagos",
  );
  assert.equal(events[0].day, "2026-02-28");
  assert.equal(events[0].type, "bill");
  assert.equal(events[0].href, "/finance");
});

test('legacy informational transfers without a destination preserve their original zero cash impact',()=>{
 const accounts=[{id:account,opening_balance:'100.10'}];const rows=[entry('50.00',undefined,'transfer',{destination_account_id:null})];assert.equal(f.accountBalances(accounts,rows)[0].balance,'100.10');
});

test('Insights period totals use integer kobo, saved-zone boundaries and savings reversals',()=>{
 const rows=[entry('0.10','2026-10-31T23:30:00Z','income'),entry('0.20','2026-11-01T00:00:00Z','income'),entry('50','2026-10-20T12:00:00Z','saving'),entry('20','2026-10-21T12:00:00Z','savings_release'),entry('100','2026-10-01T12:00:00Z','income'),entry('100','2026-11-02T00:00:00Z','income')];
 assert.deepEqual(f.periodTotals(rows,'2026-11-01','Africa/Lagos'),{income:BigInt(30),expense:BigInt(0),saving:BigInt(3000)});
});
