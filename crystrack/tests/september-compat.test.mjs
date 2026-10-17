import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { loadTs } from "./load-ts.mjs";
const { toKobo, fromKobo, signedKobo } = loadTs("src/lib/money.ts");
const { entryCreate, entryPatch, legacyEntryInput } = loadTs(
  "src/lib/finance/validation.ts",
);
test("money preserves exact kobo, DECIMAL boundary, signed totals and rejects fractional/exponential amounts", () => {
  assert.equal(fromKobo(toKobo("0.10") + toKobo("0.20")), "0.30");
  assert.equal(fromKobo(signedKobo("-0.10") + toKobo("0.30")), "0.20");
  assert.equal(toKobo("9999999999.99"), BigInt("999999999999"));
  for (const v of ["1.001", "-1", "NaN", "Infinity", "1e3", "10000000000.00"])
    assert.throws(() => toKobo(v));
});
test("legacy field aliases preserve entry response contract while rejecting conflicting/untrusted fields", () => {
  const body = legacyEntryInput({
    type: "saving",
    target_id: null,
    amount: "0.10",
  });
  assert.equal(entryCreate.parse(body).flowKind, "saving");
  assert.equal(
    entryCreate.safeParse(
      legacyEntryInput({ type: "income", flowKind: "expense", amount: "1" }),
    ).success,
    false,
  );
  for (const key of [
    "user_id",
    "deleted_at",
    "savings_bps",
    "import_key",
    "current_amount",
  ])
    assert.equal(
      entryCreate.safeParse({ flowKind: "income", amount: "1", [key]: "1" })
        .success,
      false,
    );
});
test("transfer validation requires explicit distinct accounts and edits require revisions", () => {
  const a = "00000000-0000-4000-8000-000000000001",
    b = "00000000-0000-4000-8000-000000000002";
  for (const p of [
    {},
    { accountId: a },
    { accountId: a, destinationAccountId: a },
  ])
    assert.equal(
      entryCreate.safeParse({ flowKind: "transfer", amount: "1", ...p })
        .success,
      false,
    );
  assert.equal(
    entryCreate.safeParse({
      flowKind: "transfer",
      amount: "1",
      accountId: a,
      destinationAccountId: b,
    }).success,
    true,
  );
  assert.equal(entryPatch.safeParse({ amount: "1" }).success, false);
  assert.equal(
    entryPatch.safeParse({ expectedRevision: 1, amount: "1.01" }).success,
    true,
  );
});
test("money reports exclude tombstones, opening balances and savings releases are exact", () => {
  const { summaryWithAccounts } = loadTs("src/lib/finance/data.ts", {
      "@/lib/supabase/server": {},
    }),
    now = new Date().toISOString();
  const data = [
    { type: "income", amount: "0.10", date: now },
    { type: "income", amount: "0.20", date: now },
    { type: "expense", amount: "99", date: now, deleted_at: now },
    { type: "saving", amount: "0.10", date: now },
    {
      type: "transfer",
      flow_kind: "savings_release",
      amount: "0.05",
      date: now,
    },
  ];
  const s = summaryWithAccounts(
    data,
    [],
    [],
    [{ opening_balance: "1.00" }],
    "Africa/Lagos",
  );
  assert.equal(s.exact.availableBalance, "1.25");
  assert.equal(s.exact.savedBalance, "0.05");
});
test("ledger pagination reads beyond PostgREST row limits and always requests owner/tombstone filtering", async () => {
  const rows = Array.from({ length: 2005 }, (_, i) => ({ id: String(i) })),
    calls = [];
  const db = {
    from: (table) => ({
      select() {
        return this;
      },
      eq(k, v) {
        calls.push([k, v]);
        return this;
      },
      is(k, v) {
        calls.push([k, v]);
        return this;
      },
      order() {
        return this;
      },
      async range(a, b) {
        return { data: rows.slice(a, b + 1), error: null };
      },
    }),
  };
  const { readLedger } = loadTs("src/lib/finance/data.ts", {
    "@/lib/supabase/server": {},
  });
  assert.equal((await readLedger(db, "owned")).length, 2005);
  assert.equal(
    calls.filter(([k, v]) => k === "user_id" && v === "owned").length,
    3,
  );
  assert.equal(
    calls.filter(([k, v]) => k === "deleted_at" && v === null).length,
    3,
  );
});
test("database details are logged only server-side and preview writes fail closed by default", async () => {
  const { financeError, financeWriteGuard } = loadTs(
    "src/lib/finance/server.ts",
    { "@/lib/supabase/server": {} },
  );
  const r = financeError({ code: "40001", message: "PRIVATE_DATABASE_SQL" });
  assert.equal(r.status, 409);
  assert.ok(!JSON.stringify(await r.json()).includes("PRIVATE_DATABASE_SQL"));
  const original = process.env.SEPTEMBER_COMPAT_DATABASE_VERIFIED;
  delete process.env.SEPTEMBER_COMPAT_DATABASE_VERIFIED;
  assert.equal(financeWriteGuard().status, 503);
  if (original !== undefined)
    process.env.SEPTEMBER_COMPAT_DATABASE_VERIFIED = original;
});
test("September layout/navigation/themes/styles remain byte-for-byte historical", () => {
  for (const p of [
    "src/app/page.tsx",
    "src/app/plan/page.tsx",
    "src/components/navigation/top-navigation.tsx",
    "src/components/layout/app-layout.tsx",
    "src/components/layout/theme-provider.tsx",
    "src/components/layout/environment-background.tsx",
    "src/lib/environment.ts",
    "src/app/globals.css",
    "src/app/premium-physical-ui.css",
    "src/app/premium-physical-ui-phase2.css",
    "src/app/premium-physical-ui-phase3.css",
    "src/app/premium-physical-ui-final.css",
    "src/lib/theme.ts",
  ]) {
    const old = execFileSync("git", [
      "show",
      "83b83542f27e1ff700248fcdb359891fb461c472:crystrack/" + p,
    ]);
    assert.deepEqual(readFileSync(p), old, p);
  }
});

test("September compact currency notation is preserved after exact arithmetic", () => {
  const { formatWealthMoney } = loadTs("src/lib/wealth.ts");
  assert.equal(
    formatWealthMoney("22500.00", "NGN", null, { compact: true }),
    "₦23K",
  );
  assert.equal(formatWealthMoney("22500.00", "NGN"), "₦22,500");
});

test('future-dated historical money does not fund today or inflate posted monthly totals',()=>{
 const {summarizeWealth}=loadTs('src/lib/wealth.ts');
 const s=summarizeWealth([{type:'income',amount:'0.30',date:'2026-10-17T10:00:00Z'},{type:'income',amount:'100.00',date:'2026-10-18T10:00:00Z'}],[],[],new Date('2026-10-17T12:00:00Z'),'Africa/Lagos');
 assert.equal(s.exact.availableBalance,'0.30');assert.equal(s.exact.monthIncome,'0.30');
});
