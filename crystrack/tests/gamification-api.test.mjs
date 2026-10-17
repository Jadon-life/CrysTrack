import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const uid = "00000000-0000-4000-8000-000000000001";
function preferences(user = { id: uid }) {
  const writes = [];
  const db = {
    auth: { getUser: async () => ({ data: { user } }) },
    from(table) {
      return {
        upsert(body) {
          writes.push({ table, body });
          return {
            select: () => ({
              single: async () => ({ data: body, error: null }),
            }),
          };
        },
      };
    },
  };
  return {
    writes,
    ...loadTs("src/app/api/preferences/route.ts", {
      "@/lib/supabase/server": { createClient: async () => db },
    }),
  };
}
const request = (body) =>
  new Request("http://localhost/api/preferences", {
    method: "PUT",
    body: JSON.stringify(body),
  });
test("gamification preference rejects anonymous callers and malformed boolean values", async () => {
  const anonymous = preferences(null);
  assert.equal(
    (await anonymous.PUT(request({ hideGamification: true }))).status,
    401,
  );
  assert.deepEqual(anonymous.writes, []);
  const app = preferences();
  for (const invalid of [
    { hideGamification: "true" },
    null,
    [],
    { hideGamification: 1 },
  ])
    assert.equal((await app.PUT(request(invalid))).status, 400);
  assert.deepEqual(app.writes, []);
});
test("quiet preference updates only the authenticated user and cannot accept XP grants", async () => {
  const app = preferences();
  const response = await app.PUT(
    request({
      hideGamification: true,
      user_id: "someone-else",
      xp: 999999,
      freezes: 3,
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(app.writes, [
    {
      table: "user_preferences",
      body: { user_id: uid, hide_gamification: true },
    },
  ]);
});
test("missing gamification migration returns a hidden snapshot while leaving Today usable", async () => {
  const { loadGamification } = loadTs("src/lib/gamification/service.ts", {
    "@/lib/supabase/server": {},
  });
  const db = {
    from() {
      const result = {
        data: null,
        error: { code: "42P01", message: "missing progress table" },
      };
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        range: async () => result,
        maybeSingle: async () => result,
      };
    },
  };
  const result = await loadGamification(db, uid, "Africa/Lagos", {
    targets: [],
    assignments: [],
    entries: [],
  });
  assert.equal(result.ready, false);
  assert.equal(result.hidden, true);
  assert.deepEqual(result.badges, []);
});
