import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const owner = '00000000-0000-4000-8000-000000000001',
  id = '11111111-1111-4111-8111-111111111111';
const base = {
  id,
  title: 'Physics lab',
  deadline: '2026-10-18T12:00:00Z',
  status: 'upcoming',
  revision: 2,
  subtasks: [],
  finished_late: false,
};
function setup({
  user = { id: owner },
  error = null,
  result = base,
  rows = [base],
} = {}) {
  const calls = [];
  const db = {
    auth: { getUser: async () => ({ data: { user } }) },
    from(table) {
      const q = {
        select() {
          return q;
        },
        eq(key, value) {
          calls.push({ table, key, value });
          return q;
        },
        neq(key, value) {
          calls.push({ table, exclude: value });
          return q;
        },
        order() {
          return q;
        },
        maybeSingle: async () => ({
          data: table === 'profiles' ? { timezone: 'Africa/Lagos' } : result,
          error: null,
        }),
        then(resolve) {
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return q;
    },
    rpc(name, payload) {
      calls.push({ name, payload });
      return { single: async () => ({ data: result, error }) };
    },
  };
  const mocks = { '@/lib/supabase/server': { createClient: async () => db } };
  return {
    calls,
    post: loadTs('src/app/api/assignments/route.ts', mocks).POST,
    get: loadTs('src/app/api/assignments/route.ts', mocks).GET,
    patch: loadTs('src/app/api/assignments/[id]/route.ts', mocks).PATCH,
    finish: loadTs('src/app/api/assignments/[id]/complete/route.ts', mocks)
      .PATCH,
  };
}
const req = (body) =>
  new Request('http://localhost/api/assignments', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
const props = { params: Promise.resolve({ id }) };
test('assignment writes require authentication before reading profiles or data', async () => {
  const app = setup({ user: null });
  for (const response of [
    await app.post(req({})),
    await app.patch(req({}), props),
    await app.finish(req({}), props),
  ])
    assert.equal(response.status, 401);
  assert.deepEqual(app.calls, []);
});
test('overdue completion returns Finished Late rather than a deadline conflict', async () => {
  const app = setup({
    result: {
      ...base,
      status: 'completed',
      deadline: '2020-01-01T00:00:00Z',
      completed_at: '2026-10-17T12:00:00Z',
      finished_late: true,
    },
  });
  const response = await app.finish(req({}), props);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.completion_label, 'Finished Late');
  assert.equal(data.status, 'completed');
  assert.deepEqual(
    app.calls.find((c) => c.name),
    { name: 'finish_academic_assignment', payload: { p_id: id } },
  );
});
test('on-time completion remains Finished and duplicate completion can return the stored result', async () => {
  const app = setup({
    result: { ...base, status: 'completed', finished_late: false },
  });
  for (let i = 0; i < 2; i++) {
    const response = await app.finish(req({}), props);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).completion_label, 'Finished');
  }
});
test('PATCH whitelists partial fields, uses revisions, and converts saved-zone local times', async () => {
  const app = setup();
  const response = await app.patch(
    req({
      expectedRevision: 2,
      deadline: '2026-10-20T16:00',
      courseCode: 'PHY 101',
      estimatedMinutes: 150,
    }),
    props,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(app.calls.find((c) => c.name).payload, {
    p_id: id,
    p_revision: 2,
    p_plan: {
      deadline: '2026-10-20T15:00:00.000Z',
      course_code: 'PHY 101',
      estimated_minutes: 150,
    },
  });
  assert.ok(
    app.calls.some(
      (c) => c.table === 'profiles' && c.key === 'user_id' && c.value === owner,
    ),
  );
});
test('POST validates fields, preserves unknown estimates, and maps timeboxes', async () => {
  const app = setup();
  const response = await app.post(
    req({
      title: 'Lab',
      deadline: '2026-10-20T16:00',
      workStartAt: '2026-10-19T12:00',
      estimatedMinutes: null,
      pointWeight: 20,
      academicKind: 'Lab',
    }),
  );
  assert.equal(response.status, 201);
  const payload = app.calls.find((c) => c.name).payload;
  assert.equal(payload.p_id, null);
  assert.equal(payload.p_plan.work_start_at, '2026-10-19T11:00:00.000Z');
  assert.equal(payload.p_plan.estimated_minutes, null);
  const invalid = setup();
  assert.equal(
    (await invalid.post(req({ title: 'Lab', deadline: '2026-02-30T12:00' })))
      .status,
    400,
  );
  assert.deepEqual(invalid.calls, []);
});
test('PATCH rejects ownership injection, arbitrary completion flags, and missing revisions', async () => {
  for (const body of [
    { title: 'Edited' },
    { expectedRevision: 1, user_id: owner },
    { expectedRevision: 1, finished_late: false },
    { expectedRevision: 1, status: 'completed' },
  ]) {
    const app = setup();
    assert.equal((await app.patch(req(body), props)).status, 400);
    assert.deepEqual(app.calls, []);
  }
});
test('safe error responses preserve conflict, not-found, and ownership status without raw DB outputs', async () => {
  for (const [code, status] of [
    ['40001', 409],
    ['P0002', 404],
    ['42501', 403],
    ['XX000', 500],
  ]) {
    const app = setup({ error: { code, message: 'PRIVATE SQL DETAIL' } });
    const response = await app.patch(
      req({ expectedRevision: 2, title: 'Changed' }),
      props,
    );
    assert.equal(response.status, status);
    assert.doesNotMatch(JSON.stringify(await response.json()), /PRIVATE SQL/);
  }
});
test('default GET is owner-scoped and excludes terminal items while archive GET retains them', async () => {
  const app = setup();
  assert.equal(
    (await app.get(new Request('http://localhost/api/assignments'))).status,
    200,
  );
  assert.ok(
    app.calls.some(
      (c) =>
        c.table === 'assignments' && c.key === 'user_id' && c.value === owner,
    ),
  );
  assert.deepEqual(
    app.calls.filter((c) => c.exclude).map((c) => c.exclude),
    ['completed', 'dropped'],
  );
  const archive = setup();
  await archive.get(new Request('http://localhost/api/assignments?status=all'));
  assert.equal(
    archive.calls.some((c) => c.exclude),
    false,
  );
});

test('assignment responses normalize numeric database weightings to the typed decimal string', async () => {
 const app=setup({result:{...base,point_weight:20.5}});
 const response=await app.patch(req({expectedRevision:2,title:'Changed'}),props);
 assert.equal(response.status,200);assert.equal((await response.json()).point_weight,'20.5');
});

test('academic AI context keeps dropped work out of active and overdue counts', async () => {
 const {buildIntelligenceContext}=loadTs('src/lib/ai/context.ts');
 const rows=[{title:'Dropped',deadline:'2000-01-01T00:00:00Z',status:'dropped'},{title:'Finished',deadline:'2000-01-01T00:00:00Z',status:'completed'},{title:'Open',deadline:'2000-01-01T00:00:00Z',status:'overdue'}];
 const db={from(table){const q={select(){return q;},eq(){return q;},order(){return q;},limit:async()=>({data:rows,error:null}),maybeSingle:async()=>({data:{timezone:'Africa/Lagos'},error:null})};return q;}};
 const context=await buildIntelligenceContext(db,owner,'assignments');assert.equal(context.assignments.active,1);assert.equal(context.assignments.overdue,1);assert.equal(context.assignments.dropped,1);assert.equal(context.assignments.completed,1);
});
