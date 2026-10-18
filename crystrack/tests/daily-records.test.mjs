import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const compiledModule={exports:{}};
new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/lib/daily-records.ts','utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
}).outputText)(require,compiledModule,compiledModule.exports);
const {dayKeySchema,outcomeRequestSchema,noteRequestSchema,readDailyWindow,assembleDailySnapshots}=compiledModule.exports;
const id='11111111-1111-4111-8111-111111111111';
const routine={id,routine_key:id,status:'completed',revision:2,title:'Synthetic',description:null,preferred_time:null,category:null,legacy_conflict:false,compatibility_occurrence_id:null};
const record={day_key:'2026-09-20',timezone:'Africa/Lagos',policy_version:1,expected_count:1,evidence:'verified',close_status:'closed',routines:[routine]};
const page={records:[record],context:{day:'2026-09-21',timezone:'Africa/Lagos',revision:1,captureStartsOn:'2026-09-20'},dataRevision:1,nextCursor:null};

test('outcome requests require explicit intent, revision and request ID; no implicit toggles/owner spoofing',()=>{
 assert.equal(outcomeRequestSchema.safeParse({}).success,false);
 const payload={desiredStatus:'completed',expectedRevision:1,requestId:id};
 assert.deepEqual(outcomeRequestSchema.parse(payload),payload);
 for(const value of [{...payload,owner:id},{...payload,desiredStatus:'missed'},{...payload,expectedRevision:0},{...payload,requestId:'abc'}]) assert.equal(outcomeRequestSchema.safeParse(value).success,false);
});
test('daily date keys reject normalized/impossible dates; note cap counts Unicode characters',()=>{
 for(const key of ['2026-02-30','2026-13-01','0000-01-01','2026-9-1','yesterday']) assert.equal(dayKeySchema.safeParse(key).success,false);
 assert.equal(dayKeySchema.parse('2028-02-29'),'2028-02-29');
 assert.equal(noteRequestSchema.safeParse({body:'🌱'.repeat(4000),expectedRevision:0}).success,true);
 assert.equal(noteRequestSchema.safeParse({body:'a'.repeat(4001),expectedRevision:0}).success,false);
 assert.equal(noteRequestSchema.safeParse({body:'',expectedRevision:-1}).success,false);
 assert.equal(noteRequestSchema.parse({body:'\n\t ',expectedRevision:0}).body,'');
});
test('assembler produces one authoritative snapshot; partial, duplicate, conflicted, unclosed evidence is unknown',()=>{
 assert.equal(assembleDailySnapshots([record],'2026-09-21')[0].evidence,'verified');
 for(const change of [{routines:[]},{routines:[routine,routine],expected_count:2},{routines:[{...routine,legacy_conflict:true}]},{close_status:'open'},{evidence:'incomplete'}]) {
  assert.equal(assembleDailySnapshots([{...record,...change}],'2026-09-21')[0].evidence,'incomplete');
 }
 assert.throws(()=>assembleDailySnapshots([record,record],'2026-09-21'),/Duplicate/);
 const empty={...record,routines:[],expected_count:0};assert.equal(assembleDailySnapshots([empty],'2026-09-21')[0].evidence,'verified');
});
test('pagination fails closed on missing pages, changed revisions, duplicate cursors and malformed children',async()=>{
 const first={...page,nextCursor:'2026-09-20'};
 let calls=0;
 await assert.rejects(()=>readDailyWindow(async()=>++calls===1?first:{...page,dataRevision:2,records:[]},'2026-09-20','2026-09-21'),/changed/);
 await assert.rejects(()=>readDailyWindow(async()=>first,'2026-09-20','2026-09-21'),/ordering|cursor/);
 await assert.rejects(()=>readDailyWindow(async()=>({...page,records:[{...record,routines:[{...routine,status:'invented'}]}]}),'2026-09-20','2026-09-21'));
 calls=0;
 await assert.rejects(()=>readDailyWindow(async()=>{if(++calls===1)return first;throw new Error('offline');},'2026-09-20','2026-09-21'),/offline/);
});
test('daily adapter preserves route names but never performs read-then-toggle or leaks SQL errors',()=>{
 const server=fs.readFileSync('src/lib/daily-records-server.ts','utf8');
 assert.match(server,/rpc\('daily_set_outcome'/);assert.doesNotMatch(server,/from\('task_occurrences'\)/);
 assert.doesNotMatch(server,/error\.message|console\.error\(error/);
 for(const action of ['toggle','skip']) assert.match(fs.readFileSync(`src/app/api/tasks/[taskId]/occurrences/[date]/${action}/route.ts`,'utf8'),/setTaskOutcome/);
 for(const file of ['src/app/page.tsx','src/app/tasks/page.tsx']) assert.match(fs.readFileSync(file,'utf8'),/desiredStatus:[\s\S]*expectedRevision:[\s\S]*requestId:crypto\.randomUUID/);
});
test('notes are not added to AI, telemetry, or public/shared caching',()=>{
 for(const file of ['src/app/api/ai/chat/route.ts','src/app/api/ai/analyze/route.ts']) {
  if(fs.existsSync(file)) assert.doesNotMatch(fs.readFileSync(file,'utf8'),/daily_notes|daily-notes/);
 }
 const route=fs.readFileSync('src/app/api/daily-notes/[date]/route.ts','utf8');
 assert.match(route,/private, no-store/);assert.doesNotMatch(route,/console\.|activity_events|daily_mutation_requests/);
});

test('HTTP conflicts are sanitized 409 responses; genuine unexpected failures stay unavailable',async()=>{
 const server={exports:{}};
 const load=name=>name==='@/lib/supabase/server'?{}:name==='./daily-records'?compiledModule.exports:require(name);
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/lib/daily-records-server.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
 }).outputText)(load,server,server.exports);
 const original=console.error,logs=[];console.error=(...args)=>logs.push(args);
 try {
  for(const [code,status] of [['PT409',409],['40001',409],['42501',403],['XX000',503]]) {
   const response=server.exports.dailyFailure({code,message:'Private note / raw SQL must not escape'},'rehearsal');
   assert.equal(response.status,status);
   assert.doesNotMatch(JSON.stringify(await response.json()),/Private note|raw SQL|PT409/);
  }
  assert.doesNotMatch(JSON.stringify(logs),/Private note|raw SQL/);
 } finally {console.error=original;}
});

test('additive HTTP conflict migration only changes business SQLSTATEs and preserves the reviewed bodies',()=>{
 const original=fs.readFileSync('src/db/migrations/0013_daily_records.sql','utf8');
 const patch=fs.readFileSync('src/db/migrations/0014_daily_http_conflicts.sql','utf8');
 const names=['crystrack_daily.context','public.daily_set_outcome','public.daily_request_timezone','public.daily_save_note','public.daily_read_window'];
 for(const name of names) {
  const escaped=name.replaceAll('.','\\.');
  const body=original.match(new RegExp('CREATE FUNCTION '+escaped+'\\([\\s\\S]*?END \\$\\$;'))?.[0];
  assert.ok(body,name);
  assert.ok(patch.includes(body.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION').replaceAll("ERRCODE='40001'","ERRCODE='PT409'")),name);
 }
 assert.equal((patch.match(/ERRCODE='PT409'/g)||[]).length,8);
 assert.equal((patch.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,5);
 assert.doesNotMatch(patch,/\b(?:DROP|GRANT|REVOKE|ALTER TABLE|CREATE TABLE)\b/);
});
