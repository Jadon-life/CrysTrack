/** Disposable Docker only. No hosted URL, provider, dump or credential output. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { localSql, assertTarget, ROOT, readLocalKeys } from '../scripts/local-supabase.mjs';
import { DOCKER_SOCKET, PROJECT, localEnvironment } from '../scripts/local-supabase-policy.mjs';
import { createClient } from '@supabase/supabase-js';
const policy = '2026-10-20-minimal-v1',
  q = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const role = (u, sql) =>
  `BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${sql};COMMIT;`;
const serverRole = (sql) => `BEGIN;SET LOCAL ROLE service_role;SET LOCAL request.jwt.claims='{"role":"service_role"}';${sql};COMMIT;`;
const serverJson = (expr) => JSON.parse(localSql(serverRole('SELECT '+expr)).split('\n').at(-1));
const owner = (u, sql) => localSql(role(u, sql)),
  scalar = (sql) => localSql(sql).split('\n').at(-1),
  json = (u, expr) =>
    JSON.parse(
      owner(u, 'SELECT ' + expr)
        .split('\n')
        .at(-1),
    );
function fixture() {
  const u = randomUUID();
  localSql(
    `INSERT INTO auth.users(id,email)VALUES('${u}','${u}@example.invalid');INSERT INTO profiles(user_id,timezone,scheduling_timezone)VALUES('${u}','Africa/Lagos','Africa/Lagos')`,
  );
  return u;
}
const change = (u, rev, enabled, wealth = false, id = randomUUID()) =>
  json(u, `ai_privacy_mutate('consent',${rev},'${id}',${enabled},${wealth},'${policy}')`);
const begin = (u, rev, domain = 'chat') => serverJson(`ai_request_begin('${u}',${rev},'${domain}')`);
const check = (u, lease) => serverJson(`ai_request_check('${u}','${lease.id}',${lease.revision},'${lease.domain}')`);
const finish = (u, lease, data) =>
  serverJson(`ai_request_finish('${u}','${lease.id}',${lease.revision},'${lease.domain}',${q(JSON.stringify(data))}::jsonb)`);
const denied = (fn) => assert.throws(fn, /psql|docker/);
function concurrent(u, sql, trusted = false) {
  assertTarget();
  return new Promise((resolve) => {
    const p = spawn(
      'docker',
      [
        '--host',
        DOCKER_SOCKET,
        'exec',
        '-i',
        'supabase_db_' + PROJECT,
        'psql',
        '-h',
        '127.0.0.1',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-Atq',
      ],
      { cwd: ROOT, env: localEnvironment(process.env), stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let output = '';
    p.stdout.on('data', (x) => (output += x));
    p.stderr.on('data', () => {});
    p.on('close', (code) => resolve({ code, output }));
    p.stdin.end(trusted ? serverRole(sql) : role(u, sql));
  });
}
function protectedHash(u) {
  const tables = [
    'money_entries',
    'finance_targets',
    'wealth_debts',
    'wealth_expected_flows',
    'wealth_monthly_budgets',
    'wealth_recurring_bills',
    'wealth_bill_occurrences',
    'wealth_csv_batches',
    'wealth_csv_rows',
    'sep28_crystal_awards',
    'sep28_crystal_events',
    'daily_records',
    'daily_routine_records',
    'daily_notes',
    'goal_checkins',
    'recurring_tasks',
    'routine_schedule_versions',
    'daily_tracking_states',
    'sep28_crystal_preferences',
    'user_preferences',
  ];
  return createHash('sha256')
    .update(
      scalar(
        'SELECT jsonb_build_object(' +
          tables
            .map((t) => {
              const row = t === 'goal_checkins' ? "(to_jsonb(x)-'ai_analysis')" : 'to_jsonb(x)';
              return (
                q(t) +
                `,(SELECT coalesce(jsonb_agg(${row} ORDER BY ${row}::text),'[]') FROM ${t} x WHERE user_id='${u}')`
              );
            })
            .join(',') +
          ')::text',
      ),
    )
    .digest('hex');
}

test('absent/new/existing owners are OFF without inferred consent or writes', () => {
  const u = fixture(),
    p = json(u, 'ai_privacy_state()');
  assert.equal(p.enabled, false);
  assert.equal(p.wealthEnabled, false);
  assert.equal(p.revision, 0);
  assert.equal(scalar(`SELECT count(*) FROM ai_privacy_preferences WHERE user_id='${u}'`), '0');
  for (const domain of [
    'chat',
    'conversation',
    'tasks',
    'goals',
    'assignments',
    'overview',
    'goal',
    'wealth',
    'wealth_legacy',
  ])
    denied(() => begin(u, 0, domain));
  assert.equal(scalar(`SELECT count(*) FROM crystrack_ai.requests WHERE user_id='${u}'`), '0');
});
test('owner RLS and limited grants deny direct consent/request DML, anon/service and spoofed owners', () => {
  const a = fixture(),
    b = fixture();
  change(a, 0, true);
  assert.equal(owner(b, 'SELECT count(*) FROM ai_privacy_preferences').split('\n').at(-1), '0');
  denied(() => owner(b, `INSERT INTO ai_privacy_preferences(user_id,enabled)VALUES('${a}',true)`));
  denied(() =>
    owner(a, `UPDATE ai_privacy_preferences SET wealth_enabled=true WHERE user_id='${a}'`),
  );
  denied(() => owner(a, 'SELECT * FROM crystrack_ai.requests'));
  for (const r of ['anon', 'service_role'])
    denied(() =>
      localSql(
        `BEGIN;SET LOCAL ROLE ${r};SET LOCAL request.jwt.claims='{"sub":"${a}","role":"${r}"}';SELECT ai_privacy_state();COMMIT`,
      ),
    );
  denied(() => localSql('BEGIN;SET LOCAL ROLE authenticated;SELECT ai_privacy_state();COMMIT'));
});
test('explicit current policy, valid booleans, expected revision and idempotency identity are mandatory', () => {
  const u = fixture();
  denied(() => json(u, `ai_privacy_mutate('consent',0,'${randomUUID()}',true,false,'old-policy')`));
  denied(() => change(u, 0, false, true));
  const id = randomUUID();
  assert.equal(change(u, 0, true, false, id).revision, 1);
  assert.equal(change(u, 0, true, false, id).revision, 1);
  denied(() => change(u, 0, true, true, id));
  denied(() => change(u, 0, false));
  assert.equal(json(u, 'ai_privacy_state()').enabled, true);
});
test('Wealth scope is independently OFF, checked at every lease, and reset by master OFF', () => {
  const u = fixture();
  change(u, 0, true);
  for (const d of ['wealth', 'wealth_legacy']) denied(() => begin(u, 1, d));
  assert.equal(begin(u, 1, 'overview').wealthEnabled, false);
  change(u, 1, true, true);
  assert.equal(begin(u, 2, 'wealth').wealthEnabled, true);
  change(u, 2, false);
  const p = change(u, 3, true);
  assert.equal(p.wealthEnabled, false);
  denied(() => begin(u, 4, 'wealth'));
});
test('off/on ABA and obsolete consent retries cannot reauthorize old requests', () => {
  const u = fixture(),
    id = randomUUID();
  change(u, 0, true, true, id);
  const lease = begin(u, 1);
  change(u, 1, false);
  change(u, 2, true);
  const retried = change(u, 0, true, true, id);
  assert.equal(retried.revision, 3);
  assert.equal(retried.wealthEnabled, false);
  denied(() => check(u, lease));
  denied(() => finish(u, lease, { message: 'Synthetic', answer: 'Synthetic' }));
  assert.equal(scalar(`SELECT count(*) FROM ai_messages WHERE user_id='${u}'`), '0');
});
test('atomic chat commit, cascade ownership and same-generation history exclude legacy and old Wealth messages', () => {
  const u = fixture(),
    v = fixture();
  change(u, 0, true, true);
  const lease = begin(u, 1),
    a = finish(u, lease, {
      message: 'Synthetic approved message',
      answer: 'Synthetic approved answer',
      title: 'Synthetic',
    });
  denied(() => finish(u, lease, { message: 'Duplicate', answer: 'Duplicate' }));
  assert.equal(json(u, `ai_chat_history('${a.conversation.id}',1)`).length, 2);
  change(u, 1, true, false);
  assert.deepEqual(json(u, `ai_chat_history('${a.conversation.id}',2)`), []);
  denied(() => json(v, `ai_chat_history('${a.conversation.id}',2)`));
  denied(() =>
    owner(
      u,
      `INSERT INTO ai_messages(user_id,conversation_id,role,content)VALUES('${u}','${a.conversation.id}','user','Bypass')`,
    ),
  );
});
test('concurrent permission changes serialize one revision and one conflict, exact retries remain stable', async () => {
  const u = fixture(),
    a = randomUUID(),
    b = randomUUID();
  const results = await Promise.all([
    concurrent(u, `SELECT ai_privacy_mutate('consent',0,'${a}',true,false,'${policy}')`),
    concurrent(u, `SELECT ai_privacy_mutate('consent',0,'${b}',false,false,'${policy}')`),
  ]);
  assert.deepEqual(results.map((x) => x.code === 0).sort(), [false, true]);
  assert.equal(json(u, 'ai_privacy_state()').revision, 1);
  const current = json(u, 'ai_privacy_state()');
  const id = randomUUID(),
    sql = `SELECT ai_privacy_mutate('consent',1,'${id}',false,false,'${policy}')`;
  const retry = await Promise.all([concurrent(u, sql), concurrent(u, sql)]);
  assert.ok(retry.every((x) => x.code === 0));
  assert.equal(json(u, 'ai_privacy_state()').revision, 2);
  assert.equal(typeof current.enabled, 'boolean');
});
test('in-flight result versus revocation uses one atomic consent lock and never stores after revoked revision', async () => {
  const u = fixture();
  change(u, 0, true);
  const lease = begin(u, 1);
  const revoke = concurrent(
    u,
    `SELECT ai_privacy_mutate('consent',1,'${randomUUID()}',false,false,'${policy}');SELECT pg_sleep(1)`,
  );
  for (let i = 0; i < 30; i++) {
    if (scalar(`SELECT pg_try_advisory_xact_lock(hashtextextended('${u}',41))`) === 'f') break;
    await new Promise((r) => setTimeout(r, 10));
  }
  const store = concurrent(
    u,
    `SELECT ai_request_finish('${u}','${lease.id}',${lease.revision},'${lease.domain}','{"message":"Synthetic","answer":"Synthetic"}')`,
    true,
  );
  const result = await Promise.all([revoke, store]);
  assert.equal(result[0].code, 0);
  assert.notEqual(result[1].code, 0);
  assert.equal(scalar(`SELECT count(*) FROM ai_messages WHERE user_id='${u}'`), '0');
});
test('expired, unknown and other-owner request IDs fail; durable per-owner rate cap spans all domains', () => {
  const u = fixture(),
    v = fixture();
  change(u, 0, true);
  change(v, 0, true);
  const lease = begin(u, 1);
  denied(() => check(v, lease));
  denied(() => check(u, {...lease,id:randomUUID()}));
  localSql(
    `UPDATE crystrack_ai.requests SET created_at=now()-interval '3 minutes' WHERE id='${lease.id}'`,
  );
  denied(() => check(u, lease));
  for (let i = 0; i < 19; i++) begin(u, 1, 'tasks');
  denied(() => begin(u, 1, 'chat'));
  assert.ok(begin(v, 1, 'chat').id);
});
test('confirmed bulk clear removes all local AI copies but preserves check-in evidence, finance, shards and daily records', () => {
  const u = fixture(),
    v = fixture();
  const g = randomUUID(),
    c = randomUUID(),
    legacy = randomUUID();
  localSql(
    `BEGIN;SET LOCAL request.jwt.claims='{"role":"service_role"}';INSERT INTO goals(id,user_id,title,progress_mode,checkin_config)VALUES('${g}','${u}','Synthetic private goal','percentage','{"frequency":"daily"}');INSERT INTO goal_checkins(id,user_id,goal_id,response_text,ai_analysis)VALUES('${c}','${u}','${g}','Synthetic private reflection','{"summary":"Synthetic old insight"}');INSERT INTO goal_insights(goal_id,summary)VALUES('${g}','Synthetic old insight');INSERT INTO ai_conversations(id,user_id,title)VALUES('${legacy}','${u}','Synthetic legacy chat');INSERT INTO ai_messages(conversation_id,user_id,role,content)VALUES('${legacy}','${u}','assistant','Synthetic old financial context');INSERT INTO ai_domain_insights(user_id,domain,data_fingerprint,insight,model)VALUES('${u}','wealth','legacy','{}','synthetic');INSERT INTO ai_conversations(user_id,title)VALUES('${v}','Other owner');COMMIT`,
  );
  owner(
    u,
    "SELECT daily_context();SELECT sep28_crystal_state();INSERT INTO money_entries(user_id,type,amount,source)VALUES('" +
      u +
      "','expense',1.25,'Synthetic privacy fixture')",
  );
  const before = protectedHash(u),
    reflection = scalar(`SELECT response_text FROM goal_checkins WHERE id='${c}'`);
  denied(() => json(u, `ai_privacy_mutate('clear',0,'${randomUUID()}')`));
  const id = randomUUID();
  const p = json(u, `ai_privacy_mutate('clear',0,'${id}',false,false,NULL,true)`);
  assert.equal(p.revision, 1);
  assert.equal(json(u, `ai_privacy_mutate('clear',0,'${id}',false,false,NULL,true)`).revision, 1);
  for (const t of ['ai_messages', 'ai_conversations', 'ai_domain_insights'])
    assert.equal(scalar(`SELECT count(*) FROM ${t} WHERE user_id='${u}'`), '0');
  assert.equal(scalar(`SELECT count(*) FROM goal_insights WHERE goal_id='${g}'`), '0');
  assert.equal(
    scalar(`SELECT count(*) FROM goal_checkins WHERE id='${c}' AND ai_analysis IS NULL`),
    '1',
  );
  assert.equal(scalar(`SELECT response_text FROM goal_checkins WHERE id='${c}'`), reflection);
  assert.equal(protectedHash(u), before);
  assert.equal(scalar(`SELECT count(*) FROM ai_conversations WHERE user_id='${v}'`), '1');
});
test('goal result ownership, check-in provenance and late revoked analysis cannot bypass consent', () => {
  const u = fixture(),
    v = fixture(),
    g = randomUUID(),
    c = randomUUID();
  localSql(
    `INSERT INTO goals(id,user_id,title,status,progress_mode)VALUES('${g}','${u}','Synthetic','active','percentage');INSERT INTO goal_checkins(id,user_id,goal_id)VALUES('${c}','${u}','${g}')`,
  );
  change(u, 0, true);
  change(v, 0, true);
  const analysis = {
    summary: 'Synthetic approved goal analysis',
    status: 'on_track',
    confidence: 'low',
    next_action: 'Review evidence',
  };
  const before = protectedHash(u);
  const foreign = begin(v, 1, 'goal');
  denied(() => finish(v, foreign, { goalId: g, checkinId: c, analysis }));
  const lease = begin(u, 1, 'goal');
  finish(u, lease, { goalId: g, checkinId: c, analysis });
  assert.equal(
    scalar(`SELECT ai_analysis->>'summary' FROM goal_checkins WHERE id='${c}'`),
    analysis.summary,
  );
  assert.equal(protectedHash(u), before);
  const late = begin(u, 1, 'goal');
  change(u, 1, false);
  denied(() => finish(u, late, { goalId: g, checkinId: c, analysis }));
  assert.equal(scalar(`SELECT count(*) FROM goal_insights WHERE goal_id='${g}'`), '1');
});
test('single-conversation deletion invalidates pending writes and respects other-owner cascades', () => {
  const u = fixture(),
    v = fixture();
  change(u, 0, true);
  const saved = finish(u, begin(u, 1), {
    message: 'Synthetic',
    answer: 'Synthetic',
    title: 'Synthetic',
  });
  const pending = begin(u, 1);
  denied(() =>
    json(
      v,
      `ai_privacy_mutate('delete_conversation',0,'${randomUUID()}',false,false,NULL,true,'${saved.conversation.id}')`,
    ),
  );
  json(
    u,
    `ai_privacy_mutate('delete_conversation',1,'${randomUUID()}',false,false,NULL,true,'${saved.conversation.id}')`,
  );
  denied(() =>
    finish(u, pending, { conversationId: saved.conversation.id, message: 'Late', answer: 'Late' }),
  );
  assert.equal(scalar(`SELECT count(*) FROM ai_messages WHERE user_id='${u}'`), '0');
});
test('real loopback Auth/PostgREST respects defaults, granted RPCs, forbidden direct edits and forged authentication', async () => {
  const keys = readLocalKeys(),
    client = createClient(keys.NEXT_PUBLIC_SUPABASE_URL, keys.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const signup = await client.auth.signUp({
    email: `privacy-${randomUUID()}@example.invalid`,
    password: randomUUID() + 'Aa1!',
  });
  assert.equal(signup.error, null);
  assert.equal((await client.rpc('ai_privacy_state')).data.enabled, false);
  assert.ok(
    (
      await client
        .from('ai_privacy_preferences')
        .insert({ user_id: signup.data.user.id, enabled: true })
    ).error,
  );
  const on = await client.rpc('ai_privacy_mutate', {
    p_action: 'consent',
    p_expected_revision: 0,
    p_request_id: randomUUID(),
    p_enabled: true,
    p_wealth: false,
    p_policy: policy,
  });
  assert.equal(on.error, null);
  assert.equal(on.data.enabled, true);
  assert.ok((await client.rpc('ai_request_begin', { p_revision: 1, p_domain: 'wealth' })).error);
  const forged = await fetch(keys.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/rpc/ai_privacy_state', {
    method: 'POST',
    headers: {
      apikey: keys.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: 'Bearer synthetic-forged-token',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(forged.status, 401);
  await client.auth.signOut();
});

test('legacy malformed cross-owner message relationships make local clear fail atomically instead of cascading foreign data', () => {
  const u = fixture(),
    v = fixture(),
    c = randomUUID();
  localSql(
    `INSERT INTO ai_conversations(id,user_id,title)VALUES('${c}','${u}','Synthetic malformed legacy');INSERT INTO ai_messages(conversation_id,user_id,role,content)VALUES('${c}','${v}','user','Other owner synthetic row')`,
  );
  denied(() => json(u, `ai_privacy_mutate('clear',0,'${randomUUID()}',false,false,NULL,true)`));
  assert.equal(scalar(`SELECT count(*) FROM ai_messages WHERE conversation_id='${c}'`), '1');
  assert.equal(json(u, 'ai_privacy_state()').revision, 0);
  denied(() => owner(u, `DELETE FROM ai_conversations WHERE id='${c}'`));
});

test('insufficient-evidence goal output preserves full JSON while fitting the legacy short risk label', () => {
  const u = fixture(),
    g = randomUUID(),
    c = randomUUID();
  localSql(
    `INSERT INTO goals(id,user_id,title,status,progress_mode)VALUES('${g}','${u}','Synthetic','active','ai');INSERT INTO goal_checkins(id,user_id,goal_id)VALUES('${c}','${u}','${g}')`,
  );
  change(u, 0, true);
  const lease = begin(u, 1, 'goal'),
    analysis = {
      summary: 'Private evidence was not shared.',
      status: 'insufficient_evidence',
      confidence: 'low',
      next_action: 'Review locally.',
    };
  finish(u, lease, { goalId: g, checkinId: c, analysis });
  assert.equal(
    scalar(`SELECT ai_analysis->>'status' FROM goal_checkins WHERE id='${c}'`),
    'insufficient_evidence',
  );
  assert.equal(scalar(`SELECT risk_level FROM goal_insights WHERE goal_id='${g}'`), 'insufficient');
});

test('real authenticated PostgREST cannot issue permits or forge any persisted AI result, even with a known valid permit', async () => {
  const keys = readLocalKeys();
  const client = createClient(keys.NEXT_PUBLIC_SUPABASE_URL, keys.NEXT_PUBLIC_SUPABASE_ANON_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
  const account = await client.auth.signUp({email:`ai-integrity-${randomUUID()}@example.invalid`,password:randomUUID()+'Aa1!'});
  assert.equal(account.error,null);
  const uid=account.data.user.id;
  assert.equal((await client.rpc('ai_privacy_state')).data.enabled,false);
  const consent = await client.rpc('ai_privacy_mutate',{p_action:'consent',p_expected_revision:0,p_request_id:randomUUID(),p_enabled:true,p_wealth:true,p_policy:policy});
  assert.equal(consent.error,null);
  const service = createClient(keys.NEXT_PUBLIC_SUPABASE_URL,keys.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const goal=randomUUID(),checkin=randomUUID();
  localSql(`INSERT INTO profiles(user_id,timezone,scheduling_timezone)VALUES('${uid}','Africa/Lagos','Africa/Lagos') ON CONFLICT(user_id) DO NOTHING;INSERT INTO goals(id,user_id,title,status,progress_mode)VALUES('${goal}','${uid}','Synthetic integrity goal','active','percentage');INSERT INTO goal_checkins(id,user_id,goal_id,response_text)VALUES('${checkin}','${uid}','${goal}','Synthetic private local reflection')`);
  const before=protectedHash(uid);
  for (const domain of ['chat','conversation','tasks','goals','assignments','overview','wealth','goal','wealth_legacy']) {
    const untrustedBegin=await client.rpc('ai_request_begin',{p_owner:uid,p_revision:1,p_domain:domain});
    assert.ok(untrustedBegin.error,'authenticated issuance denied for '+domain);
    const issued=await service.rpc('ai_request_begin',{p_owner:uid,p_revision:1,p_domain:domain});
    assert.equal(issued.error,null,'backend issuance permitted for '+domain);
    const args={p_owner:uid,p_request:issued.data.id,p_revision:1,p_domain:domain,p_data:{message:'Forged input',answer:'FORGED_RESULT',title:'FORGED_RESULT',model:'forged-provider',fingerprint:'a'.repeat(64),goalId:goal,checkinId:checkin,analysis:{summary:'FORGED_RESULT',status:'on_track'},insight:{headline:'FORGED_RESULT'}}};
    assert.ok((await client.rpc('ai_request_finish',args)).error,'authenticated completion denied for '+domain);
    assert.ok((await client.rpc('ai_request_check',{p_owner:uid,p_request:issued.data.id,p_revision:1,p_domain:domain})).error);
    assert.equal(scalar(`SELECT stored FROM crystrack_ai.requests WHERE id='${issued.data.id}'`),'f');
    if(domain==='chat') {
      const completed=await service.rpc('ai_request_finish',{...args,p_data:{message:'Synthetic approved input',answer:'Synthetic trusted backend result',model:'synthetic-boundary-stub'}});
      assert.equal(completed.error,null);
      assert.equal((await client.from('ai_messages').select('content')).data.length,2);
      assert.ok((await client.from('ai_messages').insert({conversation_id:completed.data.conversation.id,user_id:uid,role:'assistant',content:'FORGED_RESULT'})).error);
    }
  }
  assert.ok((await client.rpc('ai_request_finish',{p_request:randomUUID(),p_data:{answer:'FORGED_RESULT'}})).error,'old overload is absent');
  assert.ok((await client.from('ai_domain_insights').insert({user_id:uid,domain:'tasks',data_fingerprint:'forged',insight:{headline:'FORGED_RESULT'},model:'forged'})).error);
  assert.ok((await client.from('goal_insights').insert({goal_id:goal,summary:'FORGED_RESULT'})).error);
  assert.ok((await client.from('goal_checkins').update({ai_analysis:{summary:'FORGED_RESULT'}}).eq('id',checkin)).error,'embedded goal result UPDATE denied');
  assert.ok((await client.from('goal_checkins').insert({user_id:uid,goal_id:goal,response_text:'Synthetic',ai_analysis:{summary:'FORGED_RESULT'}})).error,'embedded goal result INSERT denied');
  assert.equal(scalar(`SELECT count(*) FROM ai_messages WHERE user_id='${uid}' AND content='FORGED_RESULT'`),'0');
  assert.equal(scalar(`SELECT count(*) FROM goal_insights WHERE goal_id='${goal}'`),'0');
  assert.equal(protectedHash(uid),before);
  assert.equal((await client.rpc('ai_privacy_state')).data.enabled,true);
  await client.auth.signOut();
});

test('backend completion requires exact permit owner, revision and domain, with no privileged parameter rebinding', () => {
  const a=fixture(),b=fixture();change(a,0,true);change(b,0,true);
  const lease=begin(a,1,'chat');
  const data={message:'Synthetic approved',answer:'Synthetic backend response'};
  denied(()=>finish(b,lease,data));
  denied(()=>finish(a,{...lease,revision:2},data));
  denied(()=>finish(a,{...lease,domain:'goal'},data));
  denied(()=>owner(a,`SELECT ai_request_finish('${a}','${lease.id}',1,'chat','{}')`));
  assert.equal(scalar(`SELECT stored FROM crystrack_ai.requests WHERE id='${lease.id}'`),'f');
  assert.ok(finish(a,lease,data).assistantMessage.id);
  assert.equal(scalar(`SELECT count(*) FROM ai_messages WHERE user_id='${b}'`),'0');
});
