"use client";
import React, { useMemo, useState } from "react";
import { GlassCard } from "@/components/shared/glass-card";
import { GoalDialog } from "@/components/goals/goal-dialog";
import { post, patch, fetcher } from "@/lib/api";
import { toKobo, signedKobo, fromKobo, ratioPercent } from "@/lib/money";
import { formatWealthMoney } from "@/lib/wealth";
import {
  accountBalances,
  budgetStatus,
  velocityRunway,
  cashForecast,
  annualBillCost,
  weeklySavingsStreak,
  occurrences,
} from "@/lib/finance/logic";
import { statementPreview } from "@/lib/finance/statement";
import type { StatementRow } from "@/lib/finance/statement";
import { dateKeyForInstant } from "@/lib/reminders";
import { shiftAcademicDay } from "@/lib/assignments/time";
import type { WealthSuite, LedgerEntry, FinanceTarget } from "@/types/finance";
import type { ExpectedFlowLike } from "@/lib/wealth";
import type { WealthDisplayCurrency } from "@/config/experience";
type Data = WealthSuite & {
  entries: LedgerEntry[];
  targets: FinanceTarget[];
  expectedFlows: ExpectedFlowLike[];
  summary: { availableBalance: number; exact?: Record<string, string> };
};
const titles: Record<string, string> = {
  account: "Add an account",
  budget: "Set a category cap",
  reallocate: "Move category balance",
  bill: "Recurring bill",
  settings: "Spend & Save",
  circle: "Start an Ajo / Esusu circle",
  contribution: "Record a contribution",
  payBill: "Record bill payment",
  entry: "Edit money entry",
  import: "Review bank statement",
};
function ledgerFields(e: LedgerEntry) {
  return {
    flowKind: e.flow_kind || e.type,
    amount: String(e.amount),
    source: e.source || "",
    category: e.category || "",
    note: e.note || "",
    accountId: e.account_id || undefined,
    destinationAccountId: e.destination_account_id,
    targetId: e.target_id,
    date: e.date,
  };
}
export function WealthSuitePanel({
  data,
  reload,
  currency,
  rate,
}: {
  data: Data;
  reload: () => Promise<void>;
  currency: WealthDisplayCurrency;
  rate?: number;
}) {
  const [burst, setBurst] = useState(0);
  const [panel, setPanel] = useState(""),
    [form, setForm] = useState<Record<string, string>>({}),
    [editing, setEditing] = useState<LedgerEntry | null>(null),
    [rows, setRows] = useState<StatementRow[]>([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [undo, setUndo] = useState<null | {
      label: string;
      run: () => Promise<void>;
    }>(null),
    [horizon, setHorizon] = useState<30 | 60 | 90>(30),
    [search, setSearch] = useState("");
  const today = dateKeyForInstant(new Date(), data.timezone || "UTC"),
    money = (v: string | number) => formatWealthMoney(v, currency, rate);
  const balances = useMemo(
    () =>
      accountBalances(data.accounts || [], data.entries, today, data.timezone),
    [data.accounts, data.entries, today, data.timezone],
  );
  const budget = budgetStatus(
    data.caps || [],
    data.entries,
    today,
    data.timezone,
    data.summary?.exact?.availableBalance ||
      String(data.summary?.availableBalance || 0),
  );
  const velocity = velocityRunway(
    data.entries,
    data.summary?.exact?.availableBalance ||
      String(data.summary?.availableBalance || 0),
    today,
    data.timezone,
  );
  const forecast = cashForecast(
    data.summary?.exact?.availableBalance ||
      String(data.summary?.availableBalance || 0),
    data.bills || [],
    data.expectedFlows,
    today,
    horizon,
    data.timezone,
  );
  const low = forecast.find(
    (p) => signedKobo(p.low) < toKobo(data.settings?.low_balance || "0"),
  );
  const graph = useMemo(() => {
    const values = forecast.map((p) => signedKobo(p.low)),
      min = values.reduce((a, b) => (a < b ? a : b), BigInt(0)),
      max = values.reduce((a, b) => (a > b ? a : b), BigInt(1)),
      span = max - min || BigInt(1);
    return values
      .map(
        (n, i) =>
          `${(i * 100) / (values.length - 1)},${95 - Number(((n - min) * BigInt(9000)) / span) / 100}`,
      )
      .join(" ");
  }, [forecast]);
  const changed = async () => {
    await reload();
    window.dispatchEvent(new Event("crystrack-activity-updated"));
  };
  const open = (kind: string, seed: Record<string, string> = {}) => {
    setPanel(kind);
    setForm({
      amount: "",
      name: "",
      accountKind: "cash",
      openingBalance: "0",
      month: today.slice(0, 7) + "-01",
      category: "Food",
      cap: "",
      from: budget.rows[0]?.id || "",
      to: budget.rows[1]?.id || "",
      title: "",
      nextDue: today,
      frequency: "monthly",
      active: "true",
      basisPoints: String(data.settings?.spend_save_bps || 0),
      targetId: data.settings?.target_id || "",
      lowBalance: data.settings?.low_balance || "0",
      contribution: "",
      startsOn: today,
      intervalDays: "7",
      members: "",
      circleId: data.circles?.[0]?.id || "",
      memberIndex: "0",
      round: "1",
      paidOn: today,
      accountId: data.accounts?.[0]?.id || "",
      ...seed,
    });
  };
  const input = (
    key: string,
    label: string,
    type = "text",
    required = true,
  ) => (
    <label className="wealth-field" key={key}>
      {label}
      <input
        aria-label={label}
        type={type}
        value={form[key] || ""}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        required={required}
        step={type === "number" ? "0.01" : undefined}
      />
    </label>
  );
  const select = (
    key: string,
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <label className="wealth-field" key={key}>
      {label}
      <select
        aria-label={label}
        value={form[key] || ""}
        onChange={(e) => {
          setForm((f) => ({ ...f, [key]: e.target.value }));
          if (panel === "import" && key === "accountId") setRows([]);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  const accountOptions =
    data.accounts?.map((a) => ({ value: a.id, label: a.name })) || [];
  const submit = async () => {
    if (panel === "entry" && editing) {
      const before = editing;
      const payload = {
        flowKind: form.flowKind,
        amount: form.amount,
        source: form.source,
        category: form.category,
        note: form.note,
        accountId: form.accountId,
        destinationAccountId:
          form.flowKind === "transfer" ? form.destinationAccountId : null,
        targetId: ["saving", "savings_release"].includes(form.flowKind)
          ? form.targetId || null
          : null,
        date: form.date,
        expectedRevision: editing.revision,
      };
      const saved = await patch(`/api/finance/entries/${editing.id}`, payload);
      setUndo({
        label: "Entry updated",
        run: async () => {
          await patch(`/api/finance/entries/${before.id}`, {
            ...ledgerFields(before),
            expectedRevision: saved.revision,
          });
          await changed();
        },
      });
    } else if (panel === "import") {
      const selected = rows.filter((r) => r.selected && !r.duplicate);
      if (!selected.length) throw new Error("Select at least one new row.");
      const result = await post("/api/finance/import", {
        rows: selected.map(
          ({ duplicate: _duplicate, selected: _selected, ...row }) => row,
        ),
      });
      setNotice(
        `${result.imported} transactions imported. Spend & Save follows your current rule.`,
      );
      setRows([]);
    } else {
      let body: Record<string, unknown> = { kind: panel };
      if (panel === "account")
        body = {
          ...body,
          name: form.name,
          accountKind: form.accountKind,
          openingBalance: form.openingBalance,
        };
      if (panel === "budget")
        body = {
          ...body,
          month: form.month,
          category: form.category,
          cap: form.cap,
        };
      if (panel === "reallocate")
        body = { ...body, from: form.from, to: form.to, amount: form.amount };
      if (panel === "bill")
        body = {
          ...body,
          ...(form.id ? { id: form.id } : {}),
          title: form.title,
          amount: form.amount,
          nextDue: form.nextDue,
          frequency: form.frequency,
          category: form.category,
          active: form.active === "true",
        };
      if (panel === "settings")
        body = {
          ...body,
          basisPoints: Number(form.basisPoints),
          targetId: form.targetId || null,
          lowBalance: form.lowBalance,
        };
      if (panel === "circle")
        body = {
          ...body,
          title: form.title,
          contribution: form.contribution,
          startsOn: form.startsOn,
          intervalDays: Number(form.intervalDays),
          members: form.members
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        };
      if (panel === "payBill")
        body = { ...body, billId: form.billId, accountId: form.accountId };
      if (panel === "contribution")
        body = {
          ...body,
          circleId: form.circleId,
          memberIndex: Number(form.memberIndex),
          round: Number(form.round),
          amount:
            data.circles.find((c) => c.id === form.circleId)?.contribution ||
            form.amount,
          paidOn: form.paidOn,
        };
      await post("/api/wealth/manage", body);
      setNotice("Your Wealth plan is up to date.");
    }
    await changed();
    if (panel === "payBill" || panel === "contribution" || panel === "import")
      setBurst((n) => n + 1);
  };
  const remove = async (e: LedgerEntry) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await fetcher(`/api/finance/entries/${e.id}`, {
        method: "DELETE",
        body: JSON.stringify({ expectedRevision: e.revision }),
      });
      setUndo({
        label: "Entry removed · undo within 10 minutes",
        run: async () => {
          await patch(`/api/finance/entries/${e.id}`, {
            action: "restore",
            expectedRevision: result.revision,
          });
          await changed();
        },
      });
      await changed();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const upcoming = (data.bills || [])
    .filter((b) => b.active)
    .flatMap((b) =>
      occurrences(b.next_due, b.frequency, today, shiftAcademicDay(today, 7))
        .filter((d) => !b.last_paid_on || d > b.last_paid_on)
        .map((day) => ({ bill: b, day })),
    )
    .sort((a, b) => a.day.localeCompare(b.day));
  const circle = data.circles?.find((c) => c.id === form.circleId);
  return (
    <section
      className="wealth-suite space-y-5"
      aria-label="Wealth planning tools"
    >
      {burst > 0 && (
        <div key={burst} className="goal-particles" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <i key={i} style={{ "--particle": i } as React.CSSProperties} />
          ))}
        </div>
      )}
      {notice && (
        <p role="status" className="wealth-notice">
          {notice}
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </p>
      )}
      <div className="wealth-actions">
        <h2>Plan your money</h2>
        <button onClick={() => open("account")}>+ Account</button>
        <button onClick={() => open("settings")}>Spend & Save</button>
        <button
          onClick={() => {
            setRows([]);
            open("import");
          }}
        >
          Import statement
        </button>
        <a href="/api/finance/export?format=csv" download>
          CSV export
        </a>
        <a href="/api/finance/export?format=json" download>
          JSON export
        </a>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {balances.map((a) => (
          <GlassCard key={a.id}>
            <p className="wealth-eyebrow">{a.kind.replace("_", " ")}</p>
            <h3>{a.name}</h3>
            <p className="wealth-metric">{money(a.balance)}</p>
            <p className="wealth-muted">
              {formatWealthMoney(
                a.balance,
                currency === "NGN" ? "USD" : "NGN",
                rate,
              )}{" "}
              {currency === "NGN" ? "USD reference" : "NGN valuation"}
            </p>
            {a.kind === "usd_wallet" && (
              <p className="wealth-muted">
                NGN valuation · USD reference at the current rate
              </p>
            )}
          </GlassCard>
        ))}
        {!balances.length && (
          <GlassCard>
            <h3>Your accounts</h3>
            <p>
              Start with Cash, Bank, Savings or a USD Wallet valuation. Existing
              entries stay in Cash.
            </p>
          </GlassCard>
        )}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <GlassCard>
          <p className="wealth-eyebrow">Financial velocity · last 7 days</p>
          <p className="wealth-metric">{money(velocity.daily)} / day</p>
          <p>
            {velocity.days === null
              ? "A runway estimate will appear after you log spending."
              : `At your current 7-day spending rate, your available balance will last ${velocity.days} days.`}
          </p>
          <p className="wealth-muted">
            A guide from recorded spending, not a promise. Transfers and savings
            allocations are excluded.
          </p>
        </GlassCard>
        <GlassCard>
          <div className="wealth-actions">
            <h3>Zero-based monthly plan</h3>
            <button onClick={() => open("budget")}>Set cap</button>
            <button
              disabled={budget.rows.length < 2}
              onClick={() => open("reallocate")}
            >
              Reallocate
            </button>
          </div>
          <p>
            Left to spend today: <strong>{money(budget.today)}</strong>
          </p>
          <p className="wealth-muted">
            {money(budget.unassigned)} of this month’s recorded income remains
            unassigned. Aim for zero as you give every naira a purpose.
          </p>
          <div className="wealth-data">
            {budget.rows.map((c) => (
              <div className="wealth-budget-row" key={c.id}>
                <span>{c.category}</span>
                <span>
                  {money(c.spent)} / {money(c.cap)}
                </span>
                <progress
                  aria-label={`${c.category} cap used`}
                  max={100}
                  value={Math.max(
                    0,
                    Math.min(
                      100,
                      ratioPercent(signedKobo(c.spent), toKobo(c.cap)),
                    ),
                  )}
                />
                <span>
                  {money(c.left)} left · {money(c.today)} / day
                </span>
                {(() => {
                  const donor = budget.rows.find(
                    (d) =>
                      d.id !== c.id && signedKobo(d.left) >= toKobo("1000"),
                  );
                  return donor ? (
                    <button
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await post("/api/wealth/manage", {
                            kind: "reallocate",
                            from: donor.id,
                            to: c.id,
                            amount: "1000.00",
                          });
                          await changed();
                          setNotice(
                            `Moved ₦1,000 from ${donor.category} to ${c.category}.`,
                          );
                        } catch (e) {
                          setNotice(
                            e instanceof Error
                              ? e.message
                              : "Please try again.",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Move ₦1,000 here from {donor.category}
                    </button>
                  ) : null;
                })()}
              </div>
            ))}
            {!budget.rows.length && (
              <p>Set your first category cap to make room for what matters.</p>
            )}
          </div>
        </GlassCard>
      </div>
      <GlassCard>
        <div className="wealth-actions">
          <h3>Cash-flow outlook</h3>
          <div role="group" aria-label="Forecast horizon">
            {([30, 60, 90] as const).map((d) => (
              <button
                key={d}
                aria-pressed={horizon === d}
                onClick={() => setHorizon(d)}
              >
                {d} days
              </button>
            ))}
          </div>
        </div>
        <p className="wealth-muted">
          Expected income ranges and scheduled bills only. Everyday spending and
          unscheduled income are not forecast. Avoid recording the same bill as
          expected money too.
        </p>
        {low && (
          <p role="status">
            A little planning room: balance may fall below{" "}
            {money(data.settings?.low_balance || "0")} on {low.day}.
          </p>
        )}
        <div className="wealth-data wealth-forecast">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label={`${horizon}-day forecast, ending between ${money(forecast.at(-1)!.low)} and ${money(forecast.at(-1)!.high)}`}
          >
            <polyline
              points={graph}
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        <p>
          Projected range on {forecast.at(-1)!.day}:{" "}
          <strong>
            {money(forecast.at(-1)!.low)} – {money(forecast.at(-1)!.high)}
          </strong>
        </p>
        <details>
          <summary>Day-by-day balances</summary>
          <div className="wealth-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Lower</th>
                  <th>Upper</th>
                  <th>Scheduled</th>
                </tr>
              </thead>
              <tbody>
                {forecast.map((p) => (
                  <tr key={p.day}>
                    <td>{p.day}</td>
                    <td>{money(p.low)}</td>
                    <td>{money(p.high)}</td>
                    <td>{p.charges.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </GlassCard>
      <div className="grid lg:grid-cols-2 gap-4">
        <GlassCard>
          <div className="wealth-actions">
            <h3>Bills & subscriptions</h3>
            <button onClick={() => open("bill")}>+ Bill</button>
          </div>
          {upcoming.length > 0 && (
            <p role="status">
              Heads up: {upcoming.length} upcoming charges in the next 7 days.
            </p>
          )}
          <ul className="wealth-list">
            {upcoming.map(({ bill, day }) => (
              <li key={bill.id + day}>
                {day} · {bill.title} · {money(bill.amount)}
              </li>
            ))}
          </ul>
          {(data.bills || []).map((b) => (
            <div className="wealth-data wealth-row" key={b.id}>
              <div>
                <strong>
                  {b.title}
                  {!b.active ? " · Paused" : ""}
                </strong>
                <p>
                  {money(b.amount)} · {b.frequency}
                </p>
                <p className="wealth-muted">
                  Next-year scheduled cost {money(annualBillCost(b, today))}
                </p>
              </div>
              <button
                disabled={
                  !accountOptions.length || b.next_due > today || !b.active
                }
                onClick={() =>
                  open("payBill", { billId: b.id, amount: b.amount })
                }
              >
                Record paid
              </button>
              <button
                onClick={() =>
                  open("bill", {
                    id: b.id,
                    title: b.title,
                    amount: b.amount,
                    nextDue: b.next_due,
                    frequency: b.frequency,
                    category: b.category,
                    active: String(b.active),
                  })
                }
              >
                Edit
              </button>
            </div>
          ))}
          {!data.bills?.length && (
            <p>
              Add recurring charges to see reminders and your 30–90 day outlook.
            </p>
          )}
        </GlassCard>
        <GlassCard>
          <div className="wealth-actions">
            <h3>Protected savings</h3>
            <button onClick={() => open("settings")}>Set saving rule</button>
          </div>
          <p className="wealth-muted">
            Locks protect your CrysTrack allocation until its saved unlock date.
            Your bank funds remain under your control.
          </p>
          <p>
            Spend & Save:{" "}
            {ratioPercent(
              BigInt(data.settings?.spend_save_bps || 0),
              BigInt(10000),
            )}
            % of each new expense. Savings are rounded to the nearest kobo.
          </p>
          {data.targets.map((t) => (
            <div className="wealth-data wealth-row" key={t.id}>
              <div>
                <strong>{t.title}</strong>
                <p>
                  {money(t.current_amount || "0")} / {money(t.target_amount)}
                </p>
                <p className="wealth-muted">
                  {t.locked_until && t.locked_until > today
                    ? `Protected until ${t.locked_until}`
                    : "Available to release"}{" "}
                  ·{" "}
                  {weeklySavingsStreak(
                    data.entries,
                    t.id,
                    today,
                    data.timezone,
                  )}{" "}
                  week saving streak
                </p>
              </div>
            </div>
          ))}
        </GlassCard>
      </div>
      <GlassCard>
        <div className="wealth-actions">
          <h3>Ajo / Esusu circles</h3>
          <button onClick={() => open("circle")}>+ Circle</button>
          <button
            disabled={!data.circles?.length}
            onClick={() => open("contribution")}
          >
            Log contribution
          </button>
        </div>
        <p className="wealth-muted">
          Your personal turn-order tracker. Logs do not move money or charge
          members; record actual cash movement separately.
        </p>
        {data.circles?.map((c) => (
          <details key={c.id} open>
            <summary>
              {c.title} · {money(c.contribution)} per member
            </summary>
            <ol className="wealth-list">
              {c.members.map((member, index) => {
                const due = shiftAcademicDay(
                    c.starts_on,
                    index * c.interval_days,
                  ),
                  paid = (data.contributions || [])
                    .filter(
                      (p) => p.circle_id === c.id && p.round === index + 1,
                    )
                    .reduce((n, p) => n + toKobo(p.amount), BigInt(0)),
                  pool = toKobo(c.contribution) * BigInt(c.members.length);
                return (
                  <li key={index}>
                    <strong>
                      Turn {index + 1}: {member}
                    </strong>{" "}
                    · Payout {due} · {money(fromKobo(paid))} /{" "}
                    {money(fromKobo(pool))} contributed
                  </li>
                );
              })}
            </ol>
            <details>
              <summary>Contribution log</summary>
              <ul className="wealth-list">
                {data.contributions
                  ?.filter((p) => p.circle_id === c.id)
                  .map((p) => (
                    <li key={p.id}>
                      {p.paid_on} · {c.members[p.member_index]} · Turn {p.round}{" "}
                      · {money(p.amount)}
                    </li>
                  ))}
              </ul>
            </details>
          </details>
        ))}
      </GlassCard>
      <GlassCard>
        <div className="wealth-actions">
          <h3>Manage ledger</h3>
          <label>
            Find an entry{" "}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Source or category"
            />
          </label>
        </div>
        <p className="wealth-muted">
          Removing an expense also reverses its Spend & Save allocation.
          Protected savings stay locked. Debt and confirmed expected entries are
          managed by their original flows.
        </p>
        <div className="wealth-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Entry</th>
                <th>Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.entries
                .filter(
                  (e) =>
                    !e.parent_entry_id &&
                    `${e.source} ${e.category}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                )
                .slice(0, 100)
                .map((e) => (
                  <tr key={e.id}>
                    <td>
                      {dateKeyForInstant(new Date(e.date), data.timezone)}
                    </td>
                    <td>{e.source || e.category || e.flow_kind}</td>
                    <td>{money(e.amount)}</td>
                    <td>
                      {!e.debt_id && !e.expected_flow_id ? (
                        <>
                          <button
                            disabled={busy}
                            onClick={() => {
                              setEditing(e);
                              open("entry", {
                                ...ledgerFields(e),
                                flowKind: e.flow_kind || e.type,
                                accountId:
                                  e.account_id ||
                                  accountOptions[0]?.value ||
                                  "",
                                destinationAccountId:
                                  e.destination_account_id || "",
                                targetId: e.target_id || "",
                                date: dateKeyForInstant(
                                  new Date(e.date),
                                  data.timezone,
                                ),
                              } as Record<string, string>);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => void remove(e)}
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <span>Linked flow</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="wealth-muted">
          Showing up to 100 matching entries. Exports include the complete
          ledger.
        </p>
      </GlassCard>
      {undo && (
        <div className="wealth-undo" role="status">
          <span>{undo.label}</span>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await undo.run();
                setUndo(null);
                setNotice("Your previous entry is restored.");
              } catch (e) {
                setNotice(e instanceof Error ? e.message : "Please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Undo
          </button>
          <button aria-label="Dismiss undo" onClick={() => setUndo(null)}>
            ×
          </button>
        </div>
      )}
      <GoalDialog
        isOpen={!!panel}
        onClose={() => setPanel("")}
        title={titles[panel] || "Wealth"}
        onSubmit={submit}
      >
        <div className="wealth-suite wealth-form">
          {panel === "account" && (
            <>
              {input("name", "Account name")}
              {select(
                "accountKind",
                "Account type",
                ["cash", "bank", "savings", "usd_wallet"].map((v) => ({
                  value: v,
                  label: v.replace("_", " "),
                })),
              )}
              {input("openingBalance", "Opening valuation (NGN)", "number")}
              <p>
                Use an opening amount only for money not already recorded in the
                ledger. USD Wallet stores an NGN valuation.
              </p>
            </>
          )}
          {panel === "budget" && (
            <>
              {input("month", "Budget month (first day)", "date")}
              {input("category", "Category")}
              {input("cap", "Monthly cap (NGN)", "number")}
            </>
          )}
          {panel === "reallocate" && (
            <>
              {select(
                "from",
                "Move from",
                budget.rows.map((c) => ({ value: c.id, label: c.category })),
              )}
              {select(
                "to",
                "Move to",
                budget.rows.map((c) => ({ value: c.id, label: c.category })),
              )}
              {input("amount", "Amount to move (NGN)", "number")}
              <p>
                Recorded spending stays covered. The combined allocation stays
                the same.
              </p>
            </>
          )}
          {panel === "bill" && (
            <>
              {input("title", "Bill name")}
              {input("amount", "Charge (NGN)", "number")}
              {input("nextDue", "Schedule anchor date", "date")}
              {select(
                "frequency",
                "Frequency",
                ["weekly", "monthly", "quarterly", "yearly"].map((v) => ({
                  value: v,
                  label: v,
                })),
              )}
              {input("category", "Category")}
              {select("active", "Status", [
                { value: "true", label: "Active" },
                { value: "false", label: "Paused" },
              ])}
            </>
          )}
          {panel === "payBill" && (
            <>
              {select("accountId", "Pay from account", accountOptions)}
              <p>
                Record {money(form.amount)} for the most recent due charge. This
                logs an expense and advances the reminder. It does not send a
                bank payment.
              </p>
            </>
          )}
          {panel === "settings" && (
            <>
              {input("basisPoints", "Saving basis points (100 = 1%)", "number")}
              {select("targetId", "Save toward", [
                { value: "", label: "General savings" },
                ...data.targets.map((t) => ({ value: t.id, label: t.title })),
              ])}
              {input("lowBalance", "Low balance alert (NGN)", "number")}
              <p>
                Applies to new expenses, including imports. Editing an existing
                expense keeps its original saving rate. This allocates ledger
                savings; no bank debit occurs.
              </p>
            </>
          )}
          {panel === "circle" && (
            <>
              {input("title", "Circle name")}
              {input("contribution", "Contribution per turn (NGN)", "number")}
              {input("startsOn", "First payout date", "date")}
              {input("intervalDays", "Days between payouts", "number")}
              <label className="wealth-field">
                Members in payout order (one per line)
                <textarea
                  required
                  value={form.members}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, members: e.target.value }))
                  }
                />
              </label>
            </>
          )}
          {panel === "contribution" && (
            <>
              {select(
                "circleId",
                "Circle",
                data.circles.map((c) => ({ value: c.id, label: c.title })),
              )}
              {select(
                "memberIndex",
                "Contributing member",
                circle?.members.map((m, i) => ({
                  value: String(i),
                  label: m,
                })) || [],
              )}
              {select(
                "round",
                "Payout turn",
                circle?.members.map((m, i) => ({
                  value: String(i + 1),
                  label: `Turn ${i + 1}: ${m}`,
                })) || [],
              )}
              {input("paidOn", "Contribution date", "date")}
              <p>
                Record {money(circle?.contribution || "0")} contributed. Each
                member can be logged once per turn.
              </p>
            </>
          )}
          {panel === "entry" && (
            <>
              {select(
                "flowKind",
                "Entry type",
                [
                  "income",
                  "expense",
                  "saving",
                  "savings_release",
                  "transfer",
                ].map((v) => ({ value: v, label: v.replaceAll("_", " ") })),
              )}
              {input("amount", "Amount (NGN)", "number")}
              {input("date", "Entry date", "date")}
              {select("accountId", "Account", accountOptions)}
              {form.flowKind === "transfer" &&
                select("destinationAccountId", "Destination account", [
                  { value: "", label: "Choose destination" },
                  ...accountOptions,
                ])}
              {["saving", "savings_release"].includes(form.flowKind) &&
                select("targetId", "Savings target", [
                  { value: "", label: "General savings" },
                  ...data.targets.map((t) => ({ value: t.id, label: t.title })),
                ])}
              {input("source", "Source / description", "text", false)}
              {input("category", "Category", "text", false)}
              {input("note", "Private note", "text", false)}
            </>
          )}
          {panel === "import" && (
            <>
              {select("accountId", "Import into account", [
                { value: "", label: "Choose account" },
                ...accountOptions,
              ])}
              <label className="wealth-field">
                CSV bank statement
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    try {
                      if (!form.accountId)
                        throw new Error("Choose an account first.");
                      if (!file) return;
                      if (file.size > 1000000)
                        throw new Error("Choose a CSV smaller than 1 MB.");
                      setRows(
                        statementPreview(
                          await file.text(),
                          form.accountId,
                          data.entries,
                          data.timezone,
                        ),
                      );
                      setNotice("");
                    } catch (err) {
                      setRows([]);
                      setNotice(
                        err instanceof Error
                          ? err.message
                          : "Please check your file.",
                      );
                    }
                  }}
                />
              </label>
              <p>
                Headers: Date, Description, Amount, Type; or Date, Description,
                Debit, Credit. Use YYYY-MM-DD dates. Import up to 500 rows.
                Matching date, amount, direction and source are flagged as
                duplicates for review.
              </p>
              <p>
                {rows.filter((r) => r.selected && !r.duplicate).length} selected
                · {rows.filter((r) => r.duplicate).length} possible duplicates
                excluded
              </p>
              <div className="wealth-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Import</th>
                      <th>Date / source</th>
                      <th>NGN</th>
                      <th>Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Import row ${i + 1}`}
                            checked={r.selected && !r.duplicate}
                            disabled={r.duplicate}
                            onChange={(e) =>
                              setRows((v) =>
                                v.map((s, j) =>
                                  j === i
                                    ? { ...s, selected: e.target.checked }
                                    : s,
                                ),
                              )
                            }
                          />
                          {r.duplicate ? "Duplicate" : ""}
                        </td>
                        <td>
                          {r.date}
                          <br />
                          {r.source}
                        </td>
                        <td>
                          {r.amount} {r.flowKind}
                        </td>
                        <td>
                          <input
                            aria-label={`Category row ${i + 1}`}
                            value={r.category}
                            onChange={(e) =>
                              setRows((v) =>
                                v.map((s, j) =>
                                  j === i
                                    ? { ...s, category: e.target.value }
                                    : s,
                                ),
                              )
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </GoalDialog>
    </section>
  );
}
