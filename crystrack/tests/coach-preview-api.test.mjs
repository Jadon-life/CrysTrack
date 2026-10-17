import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const uid = "00000000-0000-4000-8000-000000000001";
process.env.PIECE9_SIGNING_SECRET =
  "local-test-only-preview-signing-secret-123456";
const signing = loadTs("src/lib/coach-preview/signing.ts");
const request = (body = {}, headers = {}) =>
  new Request("https://staging.example/api/preview/coach/actions", {
    method: "POST",
    headers: {
      origin: "https://staging.example",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
const guard = {
  previewEnabled: () => true,
  sameOrigin: (r) => r.headers.get("origin") === new URL(r.url).origin,
  allowPreviewRequest: () => true,
};
const blocks = {
  "@/lib/supabase/server": {
    createClient: () => {
      throw new Error("Must not access the database");
    },
  },
  "@/lib/supabase/admin": {
    createAdminClient: () => {
      throw new Error("Must not access the database");
    },
  },
  "@/lib/coach-preview/context": {},
  "@/lib/coach-preview/telegram": {},
  "@/lib/rhythm/cache": { invalidateToday: () => {} },
};
test("every preview API returns 404 before touching auth, data or bot when disabled", async () => {
  for (const file of [
    "coach/chat",
    "coach/actions",
    "coach/inspect",
    "telegram/connect",
    "telegram/webhook",
  ]) {
    const { POST } = loadTs(`src/app/api/preview/${file}/route.ts`, {
      ...blocks,
      "@/lib/coach-preview/guard": { ...guard, previewEnabled: () => false },
    });
    assert.equal((await POST(request())).status, 404, file);
  }
});
function actions(user = { id: uid }) {
  const calls = [];
  const { POST } = loadTs("src/app/api/preview/coach/actions/route.ts", {
    "@/lib/coach-preview/guard": guard,
    "@/lib/rhythm/cache": { invalidateToday: () => {} },
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user } }) },
        rpc: async (name, args) => {
          calls.push({ name, args });
          return {
            data: { status: args.p_approve ? "approved" : "dismissed" },
            error: null,
          };
        },
      }),
    },
  });
  return { POST, calls };
}
test("action route rejects anonymous, cross-origin, expired and foreign-user confirmations", async () => {
  const token = signing.signProposal(uid, {
    kind: "create_task",
    title: "Read",
    weekdays: [1],
  });
  assert.equal(
    (await actions(null).POST(request({ token, decision: "approve" }))).status,
    401,
  );
  const app = actions();
  assert.equal(
    (
      await app.POST(
        request(
          { token, decision: "approve" },
          { origin: "https://elsewhere.example" },
        ),
      )
    ).status,
    403,
  );
  const foreign = signing.signProposal("00000000-0000-4000-8000-000000000002", {
    kind: "create_task",
    title: "Read",
    weekdays: [1],
  });
  for (const invalid of [
    foreign,
    "tampered",
    signing.signProposal(
      uid,
      { kind: "create_task", title: "Read", weekdays: [1] },
      undefined,
      Date.now() - 16 * 60000,
    ),
  ])
    assert.equal(
      (await app.POST(request({ token: invalid, decision: "approve" }))).status,
      400,
    );
  assert.equal(app.calls.length, 0);
});
test("only exact signed tools reach the atomic approval RPC; dismiss never sets approve", async () => {
  const tool = { kind: "log_expense", amount: "2500.05", note: "Lunch" },
    token = signing.signProposal(uid, tool),
    app = actions();
  assert.equal(
    (
      await app.POST(
        request({ token, decision: "approve", tool: { kind: "delete_all" } }),
      )
    ).status,
    400,
  );
  const result = await app.POST(request({ token, decision: "approve" }));
  assert.equal(result.status, 200);
  assert.deepEqual(app.calls[0].args.p_tool, tool);
  assert.equal(app.calls[0].args.p_approve, true);
  await app.POST(request({ token, decision: "dismiss" }));
  assert.equal(app.calls[1].args.p_approve, false);
});
function webhook() {
  const messages = [],
    calls = [];
  const db = {
    from(table) {
      calls.push(table);
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => ({ data: { user_id: uid }, error: null }),
      };
    },
  };
  const { POST } = loadTs("src/app/api/preview/telegram/webhook/route.ts", {
    "@/lib/coach-preview/guard": guard,
    "@/lib/supabase/admin": { createAdminClient: () => db },
    "@/lib/coach-preview/telegram": {
      telegramProposalId: () => uid,
      confirmationUrl: (t) =>
        "https://staging.example/preview/coach#confirm=" + t,
      sendPreviewTelegram: async (...args) => messages.push(args),
      dailyAgenda: async () =>
        "Your preview agenda for 2026-10-17 (Africa/Lagos)",
    },
  });
  return { POST, messages, calls };
}
const update = (text = "Spent 2500 on lunch", type = "private") => ({
  update_id: 1,
  message: {
    message_id: 2,
    text,
    chat: { id: 123, type },
    from: { id: 123, is_bot: false },
  },
});
test("staging webhook rejects missing/mismatched secret before database access", async () => {
  process.env.PIECE9_TELEGRAM_WEBHOOK_SECRET = "staging-only-secret";
  const app = webhook();
  assert.equal((await app.POST(request(update()))).status, 401);
  assert.equal(
    (
      await app.POST(
        request(update(), { "x-telegram-bot-api-secret-token": "wrong" }),
      )
    ).status,
    401,
  );
  assert.equal(app.calls.length, 0);
});
test("Telegram expense produces a signed review link and never writes a financial row", async () => {
  process.env.PIECE9_TELEGRAM_WEBHOOK_SECRET = "staging-only-secret";
  const app = webhook();
  const response = await app.POST(
    request(update(), {
      "x-telegram-bot-api-secret-token": "staging-only-secret",
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(app.calls, ["telegram_connections"]);
  assert.equal(app.messages.length, 1);
  assert.match(app.messages[0][1], /Nothing is saved/);
  const token = app.messages[0][2].split("#confirm=")[1];
  assert.deepEqual(signing.readProposal(token, uid).tool, {
    kind: "log_expense",
    amount: "2500",
    note: "lunch",
  });
});
test("Telegram agenda is read-only and group messages never access account data", async () => {
  const headers = { "x-telegram-bot-api-secret-token": "staging-only-secret" },
    app = webhook();
  assert.equal(
    (await app.POST(request(update("/today", "group"), headers))).status,
    200,
  );
  assert.equal(app.calls.length, 0);
  await app.POST(request(update("/today"), headers));
  assert.match(app.messages[0][1], /Africa\/Lagos/);
  assert.deepEqual(app.calls, ["telegram_connections"]);
});
test("proxy rejects disabled preview pages before session refresh or streamed rendering", async () => {
  let refreshed = false;
  const { proxy } = loadTs("src/proxy.ts", {
    "@/lib/coach-preview/guard": { previewEnabled: () => false },
    "@/lib/supabase/middleware": {
      updateSession: async () => {
        refreshed = true;
        return new Response(null);
      },
    },
  });
  for (const pathname of [
    "/preview/coach",
    "/preview/coach/",
    "/api/preview/coach/chat",
  ])
    assert.equal((await proxy({ nextUrl: { pathname } })).status, 404);
  assert.equal(refreshed, false);
  assert.equal((await proxy({ nextUrl: { pathname: "/ai" } })).status, 200);
  assert.equal(refreshed, true);
});
