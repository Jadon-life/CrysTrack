/** Explicit separate local rehearsal, never included by ordinary CI/bootstrap. */
import {createServer} from 'node:http';import {once} from 'node:events';
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {randomUUID} from 'node:crypto';import {spawn,execFileSync} from 'node:child_process';import {createClient} from '@supabase/supabase-js';import ts from 'typescript';import {createRequire} from 'node:module';
import {prepare,destroy,action,sql,raw,startRest,stopRest,DATABASE,PORT,CONFIRM,preflightSql} from '../scripts/task-release-barrier.mjs';
import {readLocalKeys,ROOT} from '../scripts/local-supabase.mjs';import {DOCKER_SOCKET,PROJECT,localEnvironment} from '../scripts/local-supabase-policy.mjs';
const require=createRequire(import.meta.url);let owned=false,client,admin,uid,task,legacy,baseline;
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const role=(query,who='authenticated')=>`BEGIN; SET LOCAL ROLE ${who}; SET LOCAL request.jwt.claims='{"sub":"${uid}","role":"${who}"}'; ${query}; COMMIT;`;
const deny=query=>{const value=raw(query,{allowFailure:true});assert.notEqual(value.status,0);assert.match(value.stderr,/PT503|42501/);};
const clock=iso=>sql(`CREATE OR REPLACE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT '${iso}'::timestamptz $$`);
const rpc=(name,args,c=client)=>c.rpc(name,args).abortSignal(AbortSignal.timeout(3000));
function digest(){const tables=['profiles','recurring_tasks','task_schedules','task_occurrences','task_timeboxes','task_focus_sessions','daily_rituals','activity_events','reminders','reminder_deliveries','gamification_events','money_entries','finance_targets','wealth_debts','wealth_expected_flows',...['daily_tracking_states','daily_timezone_transitions','routine_schedule_versions','daily_records','daily_routine_records','daily_mutation_requests','daily_notes'].filter(t=>sql(`SELECT to_regclass('public.${t}') IS NOT NULL`)==='t')];return tables.map(t=>sql(`SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'[]')) FROM public.${t} x`)).join('|');}
function metadata(){return sql(`SELECT jsonb_build_object('triggers',(SELECT jsonb_agg(pg_get_triggerdef(oid)||tgenabled::text ORDER BY oid) FROM pg_trigger WHERE NOT tgisinternal AND tgname NOT LIKE 'crys_release_%'),'acl',(SELECT jsonb_agg(jsonb_build_array(relname,relacl,relrowsecurity) ORDER BY relname) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'),'rpc',(SELECT jsonb_agg(jsonb_build_array(proname,proowner,proacl,prosecdef,proconfig) ORDER BY oid) FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,to_regnamespace('crystrack_daily'))))`);}
function asyncSql(query){return new Promise(resolve=>{const p=spawn('docker',['--host',DOCKER_SOCKET,'exec','-i','supabase_db_'+PROJECT,'psql','-h','127.0.0.1','-U','postgres','-d',DATABASE,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-Atq'],{env:localEnvironment(process.env),stdio:['pipe','pipe','pipe']});let err='';p.stdout.resume();p.stderr.on('data',d=>err+=d);p.on('exit',code=>resolve({code,err}));p.stdin.end(query);});}
function loadLegacy(file){const source=execFileSync('git',['show','cccdb56edb14463030a9ce9b2aed8fbcd07579a3:crystrack/'+file],{cwd:ROOT,encoding:'utf8'});const m={exports:{}};new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>name==='@/lib/supabase/server'?{createClient:async()=>client}:require(name),m,m.exports);return m.exports;}
before(async()=>{
 if(process.env.CRYSTRACK_RELEASE_REHEARSAL!=='ISSUE19-SYNTHETIC-ONLY')throw Error('Explicit synthetic local rehearsal confirmation required');
 prepare();owned=true;
 const keys=readLocalKeys();const auth=createClient(keys.NEXT_PUBLIC_SUPABASE_URL,keys.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const user=await auth.auth.signUp({email:`barrier-${randomUUID()}@example.invalid`,password:randomUUID()+'aA1!'});assert.equal(user.error,null);uid=user.data.user.id;
 const localFetch=(input,init)=>{const url=new URL(input);assert.equal(url.origin,`http://127.0.0.1:${PORT}`);url.pathname=url.pathname.replace(/^\/rest\/v1/,'');return fetch(url,init);};
 const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:localFetch,headers:{Authorization:'Bearer '+user.data.session.access_token}}};
 client=createClient(`http://127.0.0.1:${PORT}`,keys.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);client.auth.getUser=()=>auth.auth.getUser();
 admin=createClient(`http://127.0.0.1:${PORT}`,keys.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:localFetch}});
 task=randomUUID();sql(`INSERT INTO auth.users VALUES('${uid}','synthetic@example.invalid'); INSERT INTO profiles(user_id,timezone) VALUES('${uid}','UTC'); INSERT INTO recurring_tasks(id,user_id,title) VALUES('${task}','${uid}','Synthetic legacy routine'); INSERT INTO task_schedules(task_id,weekday) SELECT '${task}',generate_series(0,6); INSERT INTO task_occurrences(task_id,date,status) VALUES('${task}','2026-09-21','pending');
 INSERT INTO reminders(user_id,entity_type,entity_id,scheduled_for) VALUES('${uid}','task','${task}',now());
 CREATE TABLE public.task_timeboxes(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
 CREATE TABLE public.task_focus_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
 CREATE TABLE public.daily_rituals(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
 CREATE TABLE public.gamification_events(id uuid DEFAULT gen_random_uuid(),user_id uuid,kind text,source_id text); ALTER TABLE public.gamification_events ENABLE ROW LEVEL SECURITY;
 CREATE FUNCTION public.synthetic_task_award() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN IF NEW.status='completed' THEN INSERT INTO public.gamification_events(user_id,kind,source_id) VALUES('${uid}','task',NEW.id::text); END IF; RETURN NEW; END $$;
 CREATE FUNCTION public.synthetic_service_miss() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ INSERT INTO public.task_occurrences(task_id,date,status) VALUES('${task}','2026-09-22','missed') $$; REVOKE ALL ON FUNCTION public.synthetic_service_miss() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.synthetic_service_miss() TO service_role;
 CREATE TRIGGER gamification_task AFTER INSERT OR UPDATE ON public.task_occurrences FOR EACH ROW EXECUTE FUNCTION public.synthetic_task_award();`);
 legacy={create:loadLegacy('src/app/api/tasks/route.ts'),toggle:loadLegacy('src/app/api/tasks/[taskId]/occurrences/[date]/toggle/route.ts'),skip:loadLegacy('src/app/api/tasks/[taskId]/occurrences/[date]/skip/route.ts'),archive:loadLegacy('src/app/api/tasks/[taskId]/archive/route.ts'),remove:loadLegacy('src/app/api/tasks/[taskId]/route.ts')};
 startRest();for(let n=0;n<60;n++){try{const r=await fetch(`http://127.0.0.1:${PORT}/`);if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.equal((await client.from('recurring_tasks').select('id')).error,null);
 baseline=metadata();
});
after(()=>{if(owned){stopRest();destroy();}});

test('enable drains or times out on in-flight writes, rolling back all partially installed guards',async()=>{
 const held=asyncSql(`BEGIN; UPDATE recurring_tasks SET title='Committed before freeze' WHERE id='${task}'; SELECT pg_sleep(3.5); COMMIT;`);
 await new Promise(r=>setTimeout(r,250));assert.throws(()=>action('enable'));
 assert.equal(sql("SELECT to_regnamespace('crystrack_release_gate') IS NULL"),'t');assert.equal((await held).code,0);
 assert.equal(metadata(),baseline);
 const reader=asyncSql(`BEGIN; SELECT id FROM recurring_tasks; SELECT pg_sleep(3.5); COMMIT;`);
 await new Promise(r=>setTimeout(r,250));assert.throws(()=>action('enable'));assert.equal((await reader).code,0);
 assert.equal(sql("SELECT to_regnamespace('crystrack_release_gate') IS NULL"),'t');assert.equal(metadata(),baseline);
});
test('enable is atomic, idempotent, persistent across processes and rejects a stale repeatable-read transaction',async()=>{
 const stale=asyncSql(`BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT 1; SELECT pg_sleep(4); UPDATE recurring_tasks SET title='Stale overwrite' WHERE id='${task}'; COMMIT;`);
 let release,read;const gate=new Promise(r=>release=r),readDone=new Promise(r=>read=r);
 const heldServer=createServer(async(_req,res)=>{await client.from('recurring_tasks').select('id').eq('id',task);read();await gate;const denied=await client.from('recurring_tasks').update({title:'Held HTTP overwrite'}).eq('id',task).abortSignal(AbortSignal.timeout(3000));res.writeHead(denied.status);res.end();});
 heldServer.listen(0,'127.0.0.1');await once(heldServer,'listening');
 const heldHttp=fetch(`http://127.0.0.1:${heldServer.address().port}/`,{method:'POST',signal:AbortSignal.timeout(15000)});
 try{await readDone;assert.equal(action('enable'),true);assert.equal(action('enable'),true);release();assert.equal((await heldHttp).status,503);}finally{release();await new Promise(r=>heldServer.close(r));}
 const result=await stale;assert.notEqual(result.code,0);assert.match(result.err,/PT503/);
 execFileSync(process.execPath,['scripts/task-release-barrier.mjs','check',CONFIRM],{cwd:ROOT,env:localEnvironment(process.env)});
 assert.equal(action('abort'),true);
 const calls=await Promise.all([1,2].map(()=>new Promise(resolve=>{const p=spawn(process.execPath,['scripts/task-release-barrier.mjs','enable',CONFIRM],{cwd:ROOT,env:localEnvironment(process.env),stdio:'ignore'});p.on('exit',resolve);})));assert.deepEqual(calls,[0,0]);assert.equal(action('check'),true);assert.equal(metadata(),baseline);
});
test('legacy SQL/REST/service-role and immutable old API handlers deny promptly without partial effects',async()=>{
 const before=digest();
 for(const who of ['authenticated','service_role'])for(const t of ['recurring_tasks','task_schedules','task_occurrences'])for(const statement of [`INSERT INTO ${t} SELECT * FROM ${t} WHERE false`,`UPDATE ${t} SET id=id`,`DELETE FROM ${t}`])deny(role(statement,who));
 for(const t of ['task_timeboxes','task_focus_sessions','daily_rituals','reminder_deliveries'])deny(`INSERT INTO ${t} DEFAULT VALUES`);
 deny('TRUNCATE task_occurrences');deny('SET session_replication_role=replica; DELETE FROM task_occurrences');
 deny(`DELETE FROM auth.users WHERE id='${uid}'`); // Parent FK cascade cannot erase task evidence.
 for(const c of [client,admin]){
  for(const [table,payload] of [['recurring_tasks',{user_id:uid,title:'Denied'}],['task_schedules',{task_id:task,weekday:0}],['task_occurrences',{task_id:task,date:'2026-09-22',status:'missed'}]]){
   const r=await c.from(table).insert(payload).abortSignal(AbortSignal.timeout(3000));assert.equal(r.status,503);assert.equal(r.error.code,'PT503');
  }
 }
 const missed=await rpc('synthetic_service_miss',undefined,admin);assert.equal(missed.status,503);
 const delivery=await admin.from('reminder_deliveries').insert({user_id:uid}).abortSignal(AbortSignal.timeout(3000));assert.equal(delivery.status,503);
 const props={params:Promise.resolve({taskId:task,date:'2026-09-21'})};
 const handlers=[legacy.create.POST,legacy.toggle.POST,legacy.skip.POST,legacy.archive.POST,legacy.remove.DELETE];
 // Local HTTP adapter runs the pinned original route handlers with a verified
 // synthetic actor. Its REST calls still carry a real local signed JWT.
 const server=createServer(async(req,res)=>{try{let body='';for await(const part of req)body+=part;const i=Number(req.url.slice(1));const response=await handlers[i](new Request('http://localhost'+req.url,{method:req.method,...(body?{body,headers:{'Content-Type':'application/json'}}:{})}),props);res.writeHead(response.status,{'Content-Type':'application/json'});res.end(await response.text());}catch{res.writeHead(500);res.end('Synthetic handler failed');}});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{for(const [i,[method,body]] of [['POST',{title:'Denied',schedules:[1]}],['POST',{}],['POST',{}],['POST',{}],['DELETE',undefined]].entries()){
  const result=await fetch(`http://127.0.0.1:${server.address().port}/${i}`,{method,signal:AbortSignal.timeout(3000),...(body?{body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}:{})});assert.equal(result.status,500);assert.match(JSON.stringify(await result.json()),/paused/);
 }}finally{await new Promise(r=>server.close(r));}
 deny(role(`INSERT INTO activity_events(user_id,type,entity_type) VALUES('${uid}','task_completed','task')`));
 deny(role(`UPDATE reminders SET status='cancelled' WHERE entity_type='task'`)); // Row guard only denies matching rows; tested below with a fixture.
 sql(role(`INSERT INTO activity_events(user_id,type,entity_type,entity_id) VALUES('${uid}','finance_entry','finance','${randomUUID()}')`).replace('COMMIT;','ROLLBACK;'));
 assert.equal(digest(),before);
});
test('failed migration rolls back its new-table hook; exact 0013 then 0014 install while every daily writer remains frozen',async()=>{
 const before=digest();
 const candidate=fs.readFileSync('src/db/migrations/0013_daily_records.sql','utf8');
 // Fault injection changes only this in-memory test string, never the reviewed file.
 const fault=candidate.replace(/COMMIT;\s*$/,'SELECT 1/0;\nCOMMIT;');assert.notEqual(fault,candidate);
 const fail=raw(fault,{allowFailure:true});assert.notEqual(fail.status,0);assert.match(fail.stderr,/22012/);
 assert.equal(sql("SELECT to_regnamespace('crystrack_daily') IS NULL"),'t');
 assert.equal(sql("SELECT to_regclass('public.daily_notes') IS NULL"),'t');
 assert.equal(sql("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='scheduling_timezone'"),'0');
 assert.equal(action('check'),true);assert.equal(digest(),before);
 for(const name of ['0013_daily_records.sql','0014_daily_http_conflicts.sql'])sql(fs.readFileSync('src/db/migrations/'+name,'utf8'));
 assert.equal(action('check'),true);
 const frozen=digest();
 for(const [name,args,c] of [['daily_context',undefined,client],['daily_create_routine',{p_payload:{title:'Denied',schedules:[1]}},client],['daily_retire_routine',{p_routine:task},client],['daily_set_outcome',{p_day:'2026-09-21',p_routine:task,p_status:'completed',p_expected_revision:1,p_request_id:randomUUID()},client],['daily_save_note',{p_day:'2026-09-21',p_body:'Denied',p_expected_revision:0},client],['daily_request_timezone',{p_timezone:'America/New_York',p_expected_revision:1},client],['daily_read_window',{p_from:'2026-09-21',p_to:'2026-09-22'},client],['recover_daily_records',{p_user_id:uid,p_limit:31},admin]]){
  const result=await rpc(name,args,c);assert.equal(result.status,503,name);assert.equal(result.error.code,'PT503');
 }
 assert.equal(digest(),frozen);

 for(const t of ['daily_tracking_states','daily_timezone_transitions','routine_schedule_versions','daily_records','daily_routine_records','daily_mutation_requests','daily_notes']){
  assert.equal(sql(`SELECT relrowsecurity FROM pg_class WHERE oid='public.${t}'::regclass`),'t');deny(`DELETE FROM public.${t}`);
 }
 assert.equal(sql("SELECT has_table_privilege('authenticated','public.task_occurrences','INSERT')"),'f');
 assert.equal(sql("SELECT has_function_privilege('authenticated','public.recover_daily_records(uuid,integer)','EXECUTE')"),'f');
 assert.equal(sql("SELECT has_function_privilege('service_role','public.recover_daily_records(uuid,integer)','EXECUTE')"),'t');
});
test('schema/guard drift and wrong database fail closed; private controls cannot be invoked by API roles',()=>{
 sql("UPDATE crystrack_sandbox_identity.marker SET value='wrong'");assert.throws(()=>action('disable'));sql("UPDATE crystrack_sandbox_identity.marker SET value='ISSUE19-SYNTHETIC-ONLY'");
 assert.throws(()=>raw('SELECT 1',{database:'not_the_sandbox'}));
 assert.throws(()=>raw('SELECT 1',{database:'https://hosted.invalid'}));
 for(const roleName of ['authenticated','service_role','anon'])deny(role('SELECT crystrack_release_gate.attach()',roleName));
 const changed=raw('BEGIN; ALTER TABLE task_occurrences DISABLE TRIGGER crys_release_freeze;'+preflightSql()+"DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='crys_release_freeze' AND tgenabled='D') THEN RAISE EXCEPTION 'Synthetic guard drift'; END IF; END $$; COMMIT;",{allowFailure:true});assert.notEqual(changed.status,0);assert.equal(action('check'),true);
 const wrongShape=raw('BEGIN; ALTER TABLE recurring_tasks ADD COLUMN unreviewed text;'+preflightSql()+'COMMIT;',{allowFailure:true});assert.notEqual(wrongShape.status,0);
 sql('ALTER FUNCTION crystrack_release_gate.deny() SECURITY INVOKER');assert.throws(()=>action('disable'));sql('ALTER FUNCTION crystrack_release_gate.deny() SECURITY DEFINER');
 const changedOwner=raw('BEGIN; ALTER TABLE recurring_tasks OWNER TO authenticated;'+preflightSql()+'COMMIT;',{allowFailure:true});assert.notEqual(changedOwner.status,0);
 const before=metadata();sql('ALTER TABLE task_occurrences DISABLE TRIGGER crys_release_freeze');assert.throws(()=>action('disable'));assert.throws(()=>action('enable'));
 sql('ALTER TABLE task_occurrences ENABLE ALWAYS TRIGGER crys_release_freeze');assert.equal(action('check'),true);assert.equal(metadata(),before);
});
test('unfreeze preserves metadata/evidence and restores only intended new writers; bounded owner smoke runs AFTER release',async()=>{
 const before=digest(),meta=metadata();assert.equal(action('disable'),false);assert.equal(action('disable'),false);assert.equal(action('check'),false);assert.equal(digest(),before);assert.equal(metadata(),meta);
 clock('2026-09-20T10:00:00Z');assert.equal((await rpc('daily_context')).error,null);
 clock('2026-09-21T10:00:00Z');assert.equal((await rpc('daily_context')).error,null);
 const intent={p_day:'2026-09-21',p_routine:task,p_status:'completed',p_expected_revision:1,p_request_id:randomUUID()};
 const first=await rpc('daily_set_outcome',intent);assert.equal(first.error,null);assert.equal(first.data.revision,2);assert.deepEqual((await rpc('daily_set_outcome',intent)).data,first.data);
 const stale=await rpc('daily_set_outcome',{...intent,p_request_id:randomUUID()});assert.equal(stale.status,409);assert.equal(stale.error.code,'PT409');
 const undo=await rpc('daily_set_outcome',{...intent,p_status:'pending',p_expected_revision:2,p_request_id:randomUUID()});assert.equal(undo.data.revision,3);
 const skip=await rpc('daily_set_outcome',{...intent,p_status:'skipped',p_expected_revision:3,p_request_id:randomUUID()});assert.equal(skip.data.revision,4);
 const pending=await rpc('daily_set_outcome',{...intent,p_status:'pending',p_expected_revision:4,p_request_id:randomUUID()});assert.equal(pending.data.revision,5);
 const note=await rpc('daily_save_note',{p_day:'2026-09-21',p_body:'Synthetic smoke only',p_expected_revision:0});assert.equal(note.data.revision,1);
 assert.equal((await rpc('daily_save_note',{p_day:'2026-09-21',p_body:'stale',p_expected_revision:0})).status,409);
 assert.equal((await rpc('daily_save_note',{p_day:'2026-09-21',p_body:'',p_expected_revision:1})).data.revision,2);
 assert.equal((await rpc('daily_retire_routine',{p_routine:task})).error,null);
 const ctx=await rpc('daily_context');const zone=await rpc('daily_request_timezone',{p_timezone:'America/New_York',p_expected_revision:ctx.data.revision});assert.equal(zone.error,null);
 clock(zone.data.effective_at);assert.equal((await rpc('daily_context')).data.timezone,'America/New_York');
 clock('2026-09-24T10:00:00Z');assert.equal((await rpc('recover_daily_records',{p_user_id:uid,p_limit:31},admin)).error,null);
 assert.equal(sql("SELECT evidence FROM daily_records WHERE day_key='2026-09-20'"),'incomplete');
 deny(role(`INSERT INTO task_occurrences(task_id,date,status) VALUES('${task}','2026-09-24','completed')`));
 for(const t of ['money_entries','finance_targets','wealth_debts','wealth_expected_flows'])assert.equal(sql(`SELECT count(*) FROM ${t}`),'0');
 const snapshot=digest();assert.equal(action('enable'),true);assert.equal(action('abort'),true);assert.equal(action('disable'),false);assert.equal(digest(),snapshot);
});
