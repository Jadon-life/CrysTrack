import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const owner = '00000000-0000-4000-8000-000000000001';
function setup({ user = { id: owner }, rpcError = null, rows = [] } = {}) {
  const calls = [];
  const db = {
    auth: { getUser: async () => ({ data: { user } }) },
    from(table) {
      const query = {
        select() {
          return query;
        },
        eq(key, value) {
          calls.push({ table, key, value });
          return query;
        },
        order() {
          return query;
        },
        in() {
          return query;
        },
        maybeSingle: async () => ({
          data: { timezone: 'Africa/Lagos' },
          error: null,
        }),
        then(resolve) {
          return Promise.resolve({ data: rows[table] || [], error: null }).then(
            resolve,
          );
        },
      };
      return query;
    },
    rpc(name, payload) {
      calls.push({ name, payload });
      return {
        single: async () => ({
          data: { id: 'goal', revision: 3, ...payload.p_plan },
          error: rpcError,
        }),
      };
    },
  };
  const mocks = { '@/lib/supabase/server': { createClient: async () => db } };
  return {
    db,
    calls,
    patch: loadTs('src/app/api/goals/[id]/route.ts', mocks).PATCH,
    post: loadTs('src/app/api/goals/route.ts', mocks).POST,
    get: loadTs('src/app/api/goals/route.ts', mocks).GET,
  };
}
const request = (body) =>
  new Request('http://localhost/api/goals', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
const params = {
  params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }),
};
test('goal writes reject unauthenticated requests before touching data', async () => {
  const app = setup({ user: null });
  assert.equal((await app.post(request({ title: 'Goal' }))).status, 401);
  assert.equal(
    (await app.patch(request({ title: 'Goal' }), params)).status,
    401,
  );
  assert.deepEqual(app.calls, []);
});
test('PATCH validates revision and forbids owner injection', async () => {
  const app = setup();
  assert.equal(
    (await app.patch(request({ title: 'Edit' }), params)).status,
    400,
  );
  assert.equal(
    (await app.patch(request({ expectedRevision: 1, user_id: owner }), params))
      .status,
    400,
  );
  assert.deepEqual(app.calls, []);
});
test('PATCH sends partial fields and resolves date-only deadlines using saved timezone', async () => {
  const app = setup();
  const response = await app.patch(
    request({
      expectedRevision: 2,
      deadline: '2026-10-17',
      whyMatters: 'Family',
    }),
    params,
  );
  assert.equal(response.status, 200);
  const call = app.calls.find((c) => c.name === 'save_goal_alignment');
  assert.deepEqual(call.payload, {
    p_id: '11111111-1111-4111-8111-111111111111',
    p_revision: 2,
    p_plan: { deadline: '2026-10-17T22:59:59.999Z', why_matters: 'Family' },
  });
  assert.ok(
    app.calls.some(
      (c) => c.table === 'profiles' && c.key === 'user_id' && c.value === owner,
    ),
  );
});
test('POST initializes numeric progress from the supplied starting value', async () => {
  const app = setup();
  const response = await app.post(
    request({
      title: 'Grow',
      startingValue: '10',
      targetValue: '20',
      progressMode: 'percentage',
    }),
  );
  assert.equal(response.status, 201);
  const call = app.calls.find((c) => c.name === 'save_goal_alignment');
  assert.equal(call.payload.p_plan.progress_value, '10');
  assert.equal(call.payload.p_id, null);
});
test('API returns safe conflicts and suppresses raw database errors', async () => {
  for (const [code, status] of [
    ['40001', 409],
    ['42501', 403],
    ['P0002', 404],
    ['XX000', 500],
  ]) {
    const app = setup({
      rpcError: { code, message: 'PRIVATE DATABASE DETAILS' },
    });
    const response = await app.patch(
      request({ expectedRevision: 1, title: 'Edit' }),
      params,
    );
    assert.equal(response.status, status);
    assert.doesNotMatch(
      JSON.stringify(await response.json()),
      /PRIVATE DATABASE/,
    );
  }
});
test('GET derives effort from completed linked occurrences and keeps financial progress separate', async () => {
  const start = '2026-10-10T00:00:00Z';
  const app = setup({
    rows: {
      goals: [
        {
          id: 'goal',
          created_at: start,
          linked_at: start,
          title: 'Laptop',
          status: 'active',
          task_ids: ['routine'],
          routine_target: 4,
          progress_source: 'tasks',
          milestones: [],
          goal_checkins: [],
          checkin_config: { frequency: 'daily' },
          finance_target_id: 'fund',
        },
      ],
      recurring_tasks: [
        {
          id: 'routine',
          task_occurrences: [
            {
              date: '2026-10-11T00:00:00Z',
              status: 'completed',
              completed_at: '2026-10-11T10:00:00Z',
            },
            {
              date: '2026-10-12T00:00:00Z',
              status: 'pending',
              completed_at: null,
            },
            {
              date: '2026-10-09T00:00:00Z',
              status: 'completed',
              completed_at: '2026-10-09T10:00:00Z',
            },
            {
              date: '2099-01-01T00:00:00Z',
              status: 'completed',
              completed_at: '2099-01-01T10:00:00Z',
            },
          ],
        },
      ],
      finance_targets: [
        {
          id: 'fund',
          title: 'Laptop fund',
          current_amount: '25.25',
          target_amount: '100.00',
        },
      ],
    },
  });
  const response = await app.get(
    new Request('http://localhost/api/goals?status=all'),
  );
  assert.equal(response.status, 200);
  const [goal] = await response.json();
  assert.equal(goal.completed_tasks, 1);
  assert.equal(goal.effort_percent, 25);
  assert.equal(goal.finance_target.current_amount, '25.25');
  assert.ok(
    app.calls.some(
      (c) =>
        c.table === 'recurring_tasks' &&
        c.key === 'user_id' &&
        c.value === owner,
    ),
  );
});
