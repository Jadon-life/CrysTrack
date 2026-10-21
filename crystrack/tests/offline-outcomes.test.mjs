import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';import ts from'typescript';import{createRequire}from'node:module';
const native=createRequire(import.meta.url);
function loader(mocks={}){const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>Object.hasOwn(mocks,name)?mocks[name]:name.startsWith('@/')?load('src/'+name.slice(2)+'.ts'):name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):native(name),m,m.exports);return m.exports;}return load;}
const contract=loader()('src/lib/offline-outcomes.ts');
const id='11111111-1111-4111-8111-111111111111';
const intent={mode:'offline-v1',requestId:id,day:'2026-09-21',timezone:'Africa/Lagos',contextRevision:1,snapshotId:id,snapshotVersion:id,definitionVersion:id,routineId:id,expectedRevision:1,desiredStatus:'completed'};
const confirmed={state:'confirmed',receipt:{requestId:id,day:intent.day,routineId:id,status:'completed',revision:2},reconciliation:'current'};
const request=(p=intent,headers={})=>new Request('http://localhost/api/tasks/offline/replay',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(p)});
function server({user={id},authError=null,data=confirmed,error=null,status=200}={}){const calls=[];const client={auth:{getUser:async()=>({data:{user},error:authError})},rpc:async(name,args)=>{calls.push({name,args});return{data,error,status};}};return{calls,...loader({'@/lib/supabase/server':{createClient:async()=>client}})('src/lib/offline-outcomes-server.ts')};}
test('offline envelope strictly binds mode/context/snapshot/definition/revision; excludes owner and rewards',()=>{
 assert.deepEqual(contract.offlineOutcomeIntentSchema.parse(intent),intent);
 const uppercase='ABCDEFAB-1234-4234-8234-ABCDEFABCDEF';
 assert.equal(contract.offlineOutcomeIntentSchema.parse({...intent,routineId:uppercase}).routineId,uppercase.toLowerCase());
 for(const p of[{...intent,user_id:id},{...intent,shards:5},{...intent,mode:'online'},{...intent,expectedRevision:0},{...intent,contextRevision:1.5},{...intent,day:'2026-02-30'},{...intent,snapshotVersion:'bad'},{...intent,requestId:null},{...intent,desiredStatus:'missed'},{...intent,timezone:'x'.repeat(101)}])assert.equal(contract.offlineOutcomeIntentSchema.safeParse(p).success,false);
});
test('streaming input caps actual bytes despite absent/lying length; invalid JSON/UTF8/type fail closed',async()=>{
 assert.deepEqual(await contract.readOfflineIntent(request()),intent);
 for(const r of[request(intent,{'content-type':'text/plain'}),request(intent,{'content-type':'application/jsonp'}),request(intent,{'content-length':'99999'}),request({...intent,notes:'x'.repeat(3000)},{'content-length':'1'}),new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body:'{'}),new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body:new Uint8Array([255])})])await assert.rejects(()=>contract.readOfflineIntent(r));
});
test('missing/revoked identity never reaches RPC or body parsing, including an auth error with cached user',async()=>{
 for(const options of[{user:null},{authError:{code:'revoked'}}]){const s=server(options);const r=await s.offlineOutcome(request(),'replay');assert.equal(r.status,401);assert.equal(s.calls.length,0);assert.match(r.headers.get('cache-control'),/private, no-store/);}
});
test('session expiry between verified Auth and PostgREST remains 401 rather than a retryable save',async()=>{
 const s=server({status:401,error:{code:'PGRST301',message:'PRIVATE expired credential'}});
 const r=await s.offlineOutcome(request(),'replay');assert.equal(r.status,401);assert.match(r.headers.get('cache-control'),/no-store/);assert.deepEqual(await r.json(),{error:'Unauthorized'});
});
test('offline writer infers owner from verified session, dispatches only immutable envelope and validates receipt',async()=>{
 const s=server();const r=await s.offlineOutcome(request(),'replay');assert.equal(r.status,200);assert.deepEqual(await r.json(),confirmed);assert.deepEqual(s.calls,[{name:'daily_replay_offline_outcome',args:{p_intent:intent}}]);assert.match(r.headers.get('cache-control'),/no-store/);
});
test('receipt endpoint dispatches read-only RPC and preserves historical manual-review state without rebasing',async()=>{
 for(const data of[{state:'not-found'},{...confirmed,reconciliation:'manual-review'}]){const s=server({data});const r=await s.offlineOutcome(request(),'receipt');assert.equal(r.status,200);assert.deepEqual(await r.json(),data);assert.equal(s.calls[0].name,'daily_resolve_offline_outcome');assert.deepEqual(s.calls[0].args.p_intent,intent);}
});
test('mismatched/malformed fabricated result and missing replay receipt cannot be returned as a save',async()=>{
 const log=console.error;console.error=()=>{};try{for(const data of[{state:'not-found'},{...confirmed,owner:id},{...confirmed,receipt:{...confirmed.receipt,routineId:'22222222-2222-4222-8222-222222222222'}},{...confirmed,receipt:{...confirmed.receipt,revision:99}},null]){const s=server({data});const r=await s.offlineOutcome(request(),'replay');assert.equal(r.status,503);}}finally{console.error=log;}
});
test('conflict/auth/SQL failures are safe no-store responses without SQL or private text',async()=>{
 const log=console.error;const logs=[];console.error=(...x)=>logs.push(x);try{for(const[code,status]of[['PT409',409],['42501',403],['XX000',503]]){const s=server({error:{code,message:'PRIVATE SQL'}}),r=await s.offlineOutcome(request(),'replay');assert.equal(r.status,status);const body=await r.text();assert.doesNotMatch(body,/PRIVATE|SQL|PT409/);if(status===409)assert.equal(JSON.parse(body).reconciliation,'manual-review');assert.match(r.headers.get('cache-control'),/no-store/);}assert.doesNotMatch(JSON.stringify(logs),/PRIVATE SQL/);}finally{console.error=log;}
});
test('cross-site and unexpected origin cannot invoke the new authenticated writer',async()=>{
 for(const headers of[{'sec-fetch-site':'cross-site'},{origin:'https://other.invalid'}]){const s=server();assert.equal((await s.offlineOutcome(request(intent,headers),'replay')).status,403);assert.equal(s.calls.length,0);}
});
test('new routes remain under Preview default-deny and task maintenance, with no UI/worker/storage activation',()=>{
 for(const route of['replay','receipt']){assert.match(fs.readFileSync(`src/app/api/tasks/offline/${route}/route.ts`,'utf8'),/offlineOutcome/);}
 const sql=fs.readFileSync('src/db/migrations/0023_offline_outcome_guard.sql','utf8');assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION|ALTER TABLE|CREATE TABLE/);
 const helper=sql.split('CREATE FUNCTION crystrack_daily.offline_receipt')[1].split('CREATE FUNCTION public.daily_replay_offline_outcome')[0];assert.doesNotMatch(helper,/\b(INSERT|UPDATE|DELETE|PERFORM)\b|crystrack_daily\.context\(/);
 assert.match(sql,/result:=public\.daily_set_outcome/);assert.match(sql,/SET payload=p_intent/);assert.match(sql,/FOR KEY SHARE/);
 assert.doesNotMatch(fs.readFileSync('src/lib/offline-outcomes-server.ts','utf8'),/createAdminClient|SERVICE_ROLE|SUPABASE_SECRET|activity_events|crystal/);
});
