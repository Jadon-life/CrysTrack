import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const uid = "00000000-0000-4000-8000-000000000001",
  id = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id }) };
function setup({ user = { id: uid }, error = null } = {}) {
  const calls = [];
  const db = {
    auth: { getUser: async () => ({ data: { user } }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: { id, revision: 2 }, error };
    },
  };
  const mocks = {
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/goals/service": {
      savedTimezone: async () => "Africa/Lagos",
      deadlineInstant: (day) => day + "T22:59:59.999Z",
    },
  };
  return {
    calls,
    create: loadTs("src/app/api/finance/entries/route.ts", mocks).POST,
    ...loadTs("src/app/api/finance/entries/[id]/route.ts", mocks),
    bulk: loadTs("src/app/api/finance/import/route.ts", mocks).POST,
  };
}
const request = (body, method = "POST") =>
  new Request("http://localhost/api/finance", {
    method,
    body: JSON.stringify(body),
  });
test("ledger creation, edits, deletion and import reject unauthenticated calls", async () => {
  const app = setup({ user: null });
  for (const result of [
    await app.create(request({})),
    await app.PATCH(request({}, "PATCH"), context),
    await app.DELETE(request({}, "DELETE"), context),
    await app.bulk(request({})),
  ])
    assert.equal(result.status, 401);
  assert.deepEqual(app.calls, []);
});
test("ledger validates exact amounts and never forwards untrusted balance or owner fields", async () => {
  const app = setup();
  for (const body of [
    { flowKind: "expense", amount: "1.001" },
    { flowKind: "expense", amount: "1", user_id: uid },
    { flowKind: "expense", amount: "1", balance: 999 },
  ])
    assert.equal((await app.create(request(body))).status, 400);
  assert.deepEqual(app.calls, []);
});
test("new entry passes decimal strings, local date instant and Nigerian merchant category", async () => {
  const app = setup();
  assert.equal(
    (
      await app.create(
        request({
          flowKind: "expense",
          amount: "100.10",
          date: "2026-10-17",
          source: "Chowdeck",
        }),
      )
    ).status,
    201,
  );
  const p = app.calls[0].args.p_payload;
  assert.equal(p.amount, "100.10");
  assert.equal(p.date, "2026-10-17T22:59:59.999Z");
  assert.equal(p.category, "Food");
});
test("PATCH and DELETE require revisions; restore uses the same owned atomic RPC", async () => {
  const app = setup();
  assert.equal(
    (await app.PATCH(request({ amount: "2" }, "PATCH"), context)).status,
    400,
  );
  assert.equal((await app.DELETE(request({}, "DELETE"), context)).status, 400);
  await app.PATCH(
    request({ expectedRevision: 2, action: "restore" }, "PATCH"),
    context,
  );
  assert.deepEqual(app.calls[0], {
    name: "wealth_write_entry",
    args: { p_id: id, p_revision: 2, p_action: "restore", p_payload: {} },
  });
});
test("internal ledger errors are logged but hidden from API clients", async () => {
  for (const [code, status] of [
    ["40001", 409],
    ["42501", 403],
    ["23514", 400],
    ["P0002", 404],
    ["XX000", 500],
  ]) {
    const app = setup({ error: { code, message: "PRIVATE DATABASE OUTPUT" } });
    const response = await app.create(
      request({ flowKind: "expense", amount: "1" }),
    );
    assert.equal(response.status, status);
    assert.doesNotMatch(
      JSON.stringify(await response.json()),
      /PRIVATE DATABASE/,
    );
  }
});
test("statement import recomputes the fingerprint and writes the entire batch atomically", async () => {
  const app = setup();
  assert.equal(
    (
      await app.bulk(
        request({
          rows: [
            {
              flowKind: "income",
              amount: "100",
              date: "2026-10-17",
              accountId: id,
              source: "Salary",
              importKey: "untrusted-key",
            },
          ],
        }),
      )
    ).status,
    200,
  );
  assert.equal(app.calls[0].name, "wealth_import");
  assert.notEqual(app.calls[0].args.p_rows[0].importKey, "untrusted-key");
  assert.equal(app.calls[0].args.p_rows[0].amount, "100.00");
});
