/** Issue #46. Guarded disposable local database only; synthetic records, never hosted. */
import test,{after}from'node:test';import assert from'node:assert/strict';import{randomUUID}from'node:crypto';
import{spawn}from'node:child_process';import fs from'node:fs';import{createClient}from'@supabase/supabase-js';
import{localSql,readLocalKeys,assertTarget,ROOT}from'../scripts/local-supabase.mjs';
import{localEnvironment,DOCKER_SOCKET,PROJECT}from'../scripts/local-supabase-policy.mjs';
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const claims=u=>`SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${u}","role":"authenticated"}';`;
const owner=(u,s)=>localSql(`BEGIN;${claims(u)}${s};COMMIT;`);
const json=(u,s)=>JSON.parse(owner(u,'SELECT '+s).split('\n').at(-1));
const scalar=s=>localSql(s).split('\n').at(-1);
const clock=t=>localSql(`CREATE OR REPLACE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$SELECT ${q(t)}::timestamptz$$`);
after(()=>localSql("CREATE OR REPLACE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$SELECT clock_timestamp()$$"));
const call=(p,fn='daily_replay_offline_outcome')=>`${fn}(${q(JSON.stringify(p))}::jsonb)`;
const replay=(f,p=f.p)=>json(f.u,call(p));const resolve=(f,p=f.p)=>json(f.u,call(p,'daily_resolve_offline_outcome'));
function fixture({zone='Africa/Lagos',activation='2026-09-20T10:00:00Z',now='2026-09-21T10:00:00Z'}={}){
 clock(activation);const u=randomUUID(),id=randomUUID();
 localSql(`INSERT INTO auth.users(id,email)VALUES('${u}','${u}@example.invalid');INSERT INTO profiles(user_id,timezone)VALUES('${u}',${q(zone)})`);
 json(u,'daily_context()');json(u,'sep28_crystal_state()');
 owner(u,`INSERT INTO recurring_tasks(id,user_id,title)VALUES('${id}','${u}','Synthetic offline guard');INSERT INTO task_schedules(task_id,weekday)SELECT '${id}',generate_series(0,6)`);
 clock(now);const ctx=json(u,'daily_context()'),day=ctx.day;
 const h=JSON.parse(scalar(`SELECT to_jsonb(h) FROM daily_records h WHERE user_id='${u}' AND day_key='${day}'`));
 const x=JSON.parse(scalar(`SELECT (SELECT to_jsonb(x) FROM daily_routine_records x WHERE user_id='${u}' AND day_key='${day}' AND routine_key='${id}')` )||'null');
 const version=scalar(`SELECT id FROM routine_schedule_versions WHERE user_id='${u}' AND routine_key='${id}' ORDER BY version DESC LIMIT 1`);
 return{u,id,p:{mode:'offline-v1',requestId:randomUUID(),day,timezone:ctx.timezone,contextRevision:ctx.revision,snapshotId:h.id,snapshotVersion:x?.schedule_version_id||version,definitionVersion:version,routineId:id,expectedRevision:x?.revision||1,desiredStatus:'completed'}};
}
const total=f=>scalar(`SELECT coalesce(sum(delta),0) FROM sep28_crystal_events WHERE user_id='${f.u}'`);
const facts=f=>scalar(`SELECT md5(jsonb_build_array(
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM daily_records t WHERE user_id='${f.u}'),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM daily_routine_records t WHERE user_id='${f.u}'),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY request_id) FROM daily_mutation_requests t WHERE user_id='${f.u}'),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM activity_events t WHERE user_id='${f.u}'),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sep28_crystal_events t WHERE user_id='${f.u}'),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM task_occurrences t WHERE task_id='${f.id}')
 )::text)`);
function conflict(f,p=f.p){const before=facts(f);assert.throws(()=>replay(f,p));assert.equal(facts(f),before,'Conflict must roll back every source/receipt/reward change');}
const retire=f=>json(f.u,`daily_retire_routine('${f.id}')`);
const online=(f,status,revision,key=randomUUID())=>json(f.u,`daily_set_outcome('${f.p.day}','${f.id}',${q(status)},${revision},'${key}')`);

test('offline replay uses one exact receipt, compatibility row, activity and +5; undo/recomplete and +50 remain authoritative',()=>{
 const f=fixture();assert.deepEqual(resolve(f),{state:'not-found'});
 const first=replay(f);assert.equal(first.reconciliation,'current');assert.equal(first.receipt.revision,2);assert.equal(total(f),'5');
 assert.deepEqual(replay(f),first);assert.deepEqual(resolve(f),first);
 assert.equal(scalar(`SELECT count(*) FROM daily_mutation_requests WHERE user_id='${f.u}'`),'1');
 assert.equal(scalar(`SELECT count(*) FROM activity_events WHERE user_id='${f.u}'`),'1');
 assert.equal(scalar(`SELECT count(*) FROM task_occurrences WHERE task_id='${f.id}'`),'1');
 assert.deepEqual(JSON.parse(scalar(`SELECT payload FROM daily_mutation_requests WHERE user_id='${f.u}'`)),f.p);
 replay(f,{...f.p,requestId:randomUUID(),expectedRevision:2,desiredStatus:'pending'});assert.equal(total(f),'0');
 assert.equal(resolve(f).reconciliation,'manual-review');
 replay(f,{...f.p,requestId:randomUUID(),expectedRevision:3});assert.equal(total(f),'5');
 clock('2026-09-22T10:00:00Z');json(f.u,'daily_context()');assert.equal(total(f),'55');
 const before=facts(f);assert.equal(replay(f).reconciliation,'manual-review');assert.equal(resolve(f).receipt.revision,2);assert.equal(facts(f),before);
 json(f.u,'daily_context()');assert.equal(total(f),'55');
});
test('full immutable metadata and mode bind requestId; legacy online cannot spoof offline and vice versa',()=>{
 const f=fixture();replay(f);
 for(const [key,value]of Object.entries({mode:'online',day:'2026-09-22',timezone:'UTC',contextRevision:2,snapshotId:randomUUID(),snapshotVersion:randomUUID(),definitionVersion:randomUUID(),routineId:randomUUID(),expectedRevision:2,desiredStatus:'skipped'})){
  conflict(f,{...f.p,[key]:value});assert.throws(()=>resolve(f,{...f.p,[key]:value}));
 }
 assert.throws(()=>online(f,'completed',1,f.p.requestId));
 const g=fixture();online(g,'completed',1,g.p.requestId);conflict(g);assert.throws(()=>resolve(g));
});
for(const change of ['archive','delete','inactive','reactivated','definition','schedule'])test(`offline rejects ${change} after snapshot without touching existing online semantics`,()=>{
 const f=fixture();
 if(change==='archive')retire(f);
 if(change==='delete')owner(f.u,`DELETE FROM recurring_tasks WHERE id='${f.id}'`);
 if(change==='inactive'||change==='reactivated')owner(f.u,`UPDATE recurring_tasks SET active=false WHERE id='${f.id}'`);
 if(change==='reactivated')owner(f.u,`UPDATE recurring_tasks SET active=true WHERE id='${f.id}'`);
 if(change==='definition')owner(f.u,`UPDATE recurring_tasks SET title='Synthetic edited' WHERE id='${f.id}'`);
 if(change==='schedule')owner(f.u,`UPDATE task_schedules SET start_date='2026-09-23' WHERE task_id='${f.id}'`);
 conflict(f);assert.deepEqual(resolve(f),{state:'not-found'});assert.equal(total(f),'0');
 if(['archive','delete'].includes(change))assert.equal(online(f,'completed',1).status,'completed');
});
test('changed frozen revision/context/snapshot, foreign routine and incomplete or legacy evidence fail closed',()=>{
 const f=fixture();
 for(const p of [{...f.p,expectedRevision:2},{...f.p,contextRevision:2},{...f.p,snapshotId:randomUUID()},{...f.p,snapshotVersion:randomUUID()},{...f.p,definitionVersion:randomUUID()},{...f.p,routineId:randomUUID()},{...f.p,timezone:'UTC'},{...f.p,day:'2026-09-20'}])conflict(f,p);
 localSql(`UPDATE daily_records SET evidence='incomplete' WHERE user_id='${f.u}' AND day_key='${f.p.day}'`);conflict(f);
 localSql(`UPDATE daily_records SET evidence='verified' WHERE user_id='${f.u}' AND day_key='${f.p.day}';UPDATE daily_routine_records SET legacy_conflict=true WHERE user_id='${f.u}' AND day_key='${f.p.day}'`);conflict(f);
});
test('incomplete assembly and installation-day evidence cannot authorize offline replay',()=>{
 const f=fixture();
 // Deferred completeness permits a partial assembly within this synthetic transaction.
 const before=facts(f);
 assert.throws(()=>owner(f.u,`UPDATE daily_records SET expected_count=2 WHERE user_id='${f.u}' AND day_key='${f.p.day}';SELECT ${call(f.p)}`));assert.equal(facts(f),before);
 const g=fixture({now:'2026-09-20T10:01:00Z'});conflict(g);
});
test('saved-zone transitions, closure and DST midnight reject new writes, retain read-only historical receipts',()=>{
 const f=fixture();replay(f);json(f.u,"daily_request_timezone('Pacific/Honolulu',1)");
 conflict(f,{...f.p,requestId:randomUUID(),expectedRevision:2});assert.equal(resolve(f).reconciliation,'manual-review');
 clock('2026-09-22T12:00:00Z');const before=facts(f);
 const receipt=JSON.parse(localSql(`BEGIN READ ONLY;${claims(f.u)}SELECT ${call(f.p,'daily_resolve_offline_outcome')};COMMIT;`).split('\n').at(-1));
 assert.equal(receipt.state,'confirmed');assert.equal(receipt.reconciliation,'manual-review');assert.equal(facts(f),before);
 conflict(f,{...f.p,requestId:randomUUID(),expectedRevision:2});
 const dst=fixture({zone:'America/New_York',activation:'2026-03-07T12:00:00Z',now:'2026-03-08T12:00:00Z'});
 assert.equal(scalar(`SELECT extract(epoch FROM closes_at-opens_at)/3600 FROM daily_records WHERE user_id='${dst.u}' AND day_key='${dst.p.day}'`),'23.0000000000000000');
 clock('2026-03-09T04:00:00Z');conflict(dst);
});
test('failure during canonical activity write rolls back outcome, compatibility, enriched receipt and shards',()=>{
 const f=fixture(),before=facts(f);localSql(`CREATE FUNCTION crystrack_local_control.offline_fail()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.user_id='${f.u}' THEN RAISE EXCEPTION 'Synthetic failure';END IF;RETURN NEW;END$$;CREATE TRIGGER offline_fail BEFORE INSERT ON activity_events FOR EACH ROW EXECUTE FUNCTION crystrack_local_control.offline_fail()`);
 try{assert.throws(()=>replay(f));assert.equal(facts(f),before);assert.equal(total(f),'0');}finally{localSql('DROP TRIGGER offline_fail ON activity_events;DROP FUNCTION crystrack_local_control.offline_fail()');}
 assert.equal(replay(f).receipt.revision,2);
});

// Interactive psql sessions and observed pg_blocking_pids establish ordering. No sleep-based race.
function connection(u,name,body,hold=false){
 assertTarget();const child=spawn('docker',['--host',DOCKER_SOCKET,'exec','-i','supabase_db_'+PROJECT,'psql','-X','-h','127.0.0.1','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-Atq'],{cwd:ROOT,env:localEnvironment(process.env),stdio:['pipe','pipe','pipe']});
 let out='',err='';let mark;const ready=new Promise(r=>mark=r);
 child.stdout.on('data',b=>{out+=b;if(out.includes('HELD'))mark();});child.stderr.on('data',b=>err+=b);
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve({code,out,err}));});
 child.stdin.write(`BEGIN;SET LOCAL statement_timeout='20s';SET LOCAL application_name=${q(name)};${claims(u)}${body};\n${hold?'\\echo HELD\n':'COMMIT;\n'}`);
 if(!hold)child.stdin.end();
 return{child,ready,done,commit:()=>child.stdin.end('COMMIT;\n')};
}
async function observedWait(name){
 const until=Date.now()+10000;
 while(Date.now()<until){if(scalar(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=${q(name)} AND cardinality(pg_blocking_pids(pid))>0)`)==='t')return;await new Promise(r=>setImmediate(r));}
 assert.fail('Follower never reached its observed database lock wait');
}
for(const removal of ['archive','delete'])for(const first of ['removal','replay'])test(`deterministic concurrent ${removal}: ${first} obtains serialization first`,async()=>{
 const f=fixture(),remove=removal==='archive'?`SELECT daily_retire_routine('${f.id}')`:`DELETE FROM recurring_tasks WHERE id='${f.id}'`,write='SELECT '+call(f.p);
 const leader=connection(f.u,'offline-leader-'+randomUUID(),first==='removal'?remove:write,true);let follower;
 try{
  await Promise.race([leader.ready,leader.done.then(()=>assert.fail('Leader exited before lock marker'))]);
  const name='offline-follower-'+randomUUID();follower=connection(f.u,name,first==='removal'?write:remove);
  await observedWait(name);leader.commit();const a=await leader.done,b=await follower.done;assert.equal(a.code,0,a.err);
  if(first==='removal'){assert.equal(b.code,3);assert.match(b.err,/PT409/);assert.equal(total(f),'0');assert.deepEqual(resolve(f),{state:'not-found'});}
  else{assert.equal(b.code,0,b.err);assert.equal(total(f),'5');assert.equal(resolve(f).reconciliation,'manual-review');assert.equal(scalar(`SELECT count(*) FROM daily_mutation_requests WHERE user_id='${f.u}'`),'1');}
 }finally{for(const c of[leader,follower])if(c&&c.child.exitCode===null)c.child.stdin.end('ROLLBACK;\n');}
});
test('two concurrent identical offline deliveries commit exactly once',async()=>{
 const f=fixture(),name='offline-duplicate-'+randomUUID(),a=connection(f.u,'offline-first-'+randomUUID(),'SELECT '+call(f.p),true);
 await a.ready;const b=connection(f.u,name,'SELECT '+call(f.p));await observedWait(name);a.commit();assert.equal((await a.done).code,0);assert.equal((await b.done).code,0);assert.equal(total(f),'5');assert.equal(scalar(`SELECT count(*) FROM daily_mutation_requests WHERE user_id='${f.u}'`),'1');
});

test('real local Auth/REST denies anonymous, foreign owner, forged JWT and direct receipt writes; service has no execution grant',async()=>{
 const keys=readLocalKeys(),client=()=>createClient(keys.NEXT_PUBLIC_SUPABASE_URL,keys.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const f=fixture(),before=facts(f),anonymous=client();assert.ok((await anonymous.rpc('daily_replay_offline_outcome',{p_intent:f.p})).error);
 const b=client();const auth=await b.auth.signUp({email:`offline-${randomUUID()}@example.invalid`,password:randomUUID()+'aA1!'});assert.equal(auth.error,null);
 const foreign=await b.rpc('daily_replay_offline_outcome',{p_intent:f.p});assert.equal(foreign.error.code,'PT409');
 assert.deepEqual((await b.rpc('daily_resolve_offline_outcome',{p_intent:f.p})).data,{state:'not-found'});assert.equal(facts(f),before);
 assert.ok((await b.from('daily_mutation_requests').insert({user_id:auth.data.user.id,request_id:f.p.requestId,payload:f.p,result:{status:'completed',revision:2}})).error);
 for(const role of ['anon','service_role'])assert.throws(()=>localSql(`BEGIN;SET LOCAL ROLE ${role};SET LOCAL request.jwt.claims='{"sub":"${f.u}","role":"${role}"}';SELECT ${call(f.p)};COMMIT;`));
 assert.throws(()=>owner(f.u,`SELECT crystrack_daily.offline_receipt('${f.u}',${q(JSON.stringify(f.p))}::jsonb)`));
 const token=auth.data.session.access_token.split('.');const claims=JSON.parse(Buffer.from(token[1],'base64url'));claims.sub=f.u;token[1]=Buffer.from(JSON.stringify(claims)).toString('base64url');
 const bad=await fetch(keys.NEXT_PUBLIC_SUPABASE_URL+'/rest/v1/rpc/daily_replay_offline_outcome',{method:'POST',headers:{apikey:keys.NEXT_PUBLIC_SUPABASE_ANON_KEY,authorization:'Bearer '+token.join('.'),'content-type':'application/json'},body:JSON.stringify({p_intent:f.p})});assert.equal(bad.status,401);assert.equal(facts(f),before);
});
test('SQL validation rejects unknown owner/reward fields, missing mode, bad scalars and oversized input',()=>{
 const f=fixture();for(const p of[{...f.p,user_id:f.u},{...f.p,shards:500},{...f.p,mode:null},{...f.p,expectedRevision:'1'},{...f.p,day:'2026-02-30'},{...f.p,timezone:'x'.repeat(3000)},{...f.p,requestId:'bad'}])conflict(f,p);
});

test('release-only DB freeze rejects new offline writes; receipt lookup is read-only and safe',()=>{
 const f=fixture();replay(f);const p={...f.p,requestId:randomUUID(),expectedRevision:2,desiredStatus:'skipped'},before=facts(f);
 localSql(fs.readFileSync('release/task-write-barrier/install.sql','utf8'));localSql(fs.readFileSync('release/task-write-barrier/enable.sql','utf8'));
 try{assert.throws(()=>replay(f,p));assert.equal(facts(f),before);assert.equal(resolve(f).state,'confirmed');assert.equal(total(f),'5');}
 finally{localSql(fs.readFileSync('release/task-write-barrier/disable.sql','utf8'));localSql('DROP SCHEMA crystrack_release_gate CASCADE');}
});

test('offline writes and conflicts leave existing finance, AI, goal and assignment records untouched',()=>{
 const f=fixture(),money=randomUUID(),goal=randomUUID();
 owner(f.u,`INSERT INTO money_entries(id,user_id,type,flow_kind,amount,note)VALUES('${money}','${f.u}','income','income',1234.75,'Synthetic numeric provenance');INSERT INTO goals(id,user_id,title)VALUES('${goal}','${f.u}','Synthetic retained goal')`);
 const tables=['money_entries','finance_targets','wealth_debts','wealth_expected_flows','wealth_monthly_budgets','wealth_recurring_bills','wealth_bill_occurrences','wealth_csv_batches','wealth_csv_rows','goals','goal_checkins','goal_insights','assignments','ai_conversations','ai_messages','ai_domain_insights'];
 // Full-table digests cover other owners too; no real records exist in this guarded sandbox.
 const digest=()=>tables.map(t=>scalar(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) FROM public.${t} t`)).join(':');
 try{const before=digest();replay(f);conflict(f,{...f.p,requestId:randomUUID()});assert.equal(digest(),before);assert.equal(scalar(`SELECT amount::text FROM money_entries WHERE id='${money}'`),'1234.75');}
 finally{owner(f.u,`DELETE FROM money_entries WHERE id='${money}';DELETE FROM goals WHERE id='${goal}'`);}
});

test('new function ACLs, definer search paths and empty/misclassified identity fail closed',()=>{
 const f=fixture();
 for(const fn of['daily_replay_offline_outcome','daily_resolve_offline_outcome']){
  assert.equal(scalar(`SELECT prosecdef AND proowner='postgres'::regrole AND proconfig=ARRAY['search_path=""'] AND has_function_privilege('authenticated',oid,'EXECUTE') AND NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('service_role',oid,'EXECUTE') FROM pg_proc WHERE oid='public.${fn}(jsonb)'::regprocedure`),'t');
  for(const claims of['{"role":"authenticated"}',`{"sub":"${f.u}","role":"service_role"}`])assert.throws(()=>localSql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims=${q(claims)};SELECT ${call(f.p,fn)};COMMIT;`));
 }
});
