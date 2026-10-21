import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
const nativeRequire=createRequire(import.meta.url), cache=new Map();
function load(file) {
 file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
 const compiledModule={exports:{}};cache.set(file,compiledModule);
 const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 new Function('require','module','exports',source)(name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):nativeRequire(name),compiledModule,compiledModule.exports);
 return compiledModule.exports;
}
const {presentTodayStreak,loadTodayStreak,stepDailyKey,nextDailyBoundary,latestDailyRead}=load('src/lib/today-streak.ts');
const {readDailyWindow}=load('src/lib/daily-records.ts');
const context={day:'2026-10-19',timezone:'Africa/Lagos',revision:1,captureStartsOn:'2026-10-13'};
const id='00000000-0000-4000-8000-000000000001';
const snapshot=(date,status='completed',evidence='verified')=>({date,evidence,scheduledRoutineIds:status===null?[]:[id],outcomes:status===null?[]:[{routineId:id,status}]});
const view=(snapshots,c=context)=>presentTodayStreak(c,{context:c,snapshots});

test('Today all done is open; yesterday alone can earn closed-day streak; labels are bounded',()=>{
 const result=view([snapshot('2026-10-17','pending'),snapshot('2026-10-18'),snapshot('2026-10-19')]);
 assert.equal(result.currentLabel,'1 day');assert.equal(result.bestLabel,'At least 1 day');
 assert.equal(result.result.best.status,'partial');assert.equal(result.days[6].state,'today');
 assert.match(result.days[6].label,/1 of 1/);assert.equal(result.result.coverage.complete,false);
});
test('unknown current is never rendered as zero; partial best and missing snapshots stay honest',()=>{
 const result=view([snapshot('2026-10-18')]);
 assert.equal(result.result.current.value,null);assert.equal(result.currentLabel,'Not yet verified');
 assert.equal(result.days[0].state,'unknown');assert.equal(result.bestLabel,'At least 1 day');
 assert.match(result.days[6].label,/not yet verified/);
});
test('verified empty is neutral; incomplete evidence, gaps, duplicates do not bridge success',()=>{
 const result=view([snapshot('2026-10-14','pending'),snapshot('2026-10-15'),snapshot('2026-10-16',null),snapshot('2026-10-17','completed','incomplete'),snapshot('2026-10-18')]);
 assert.equal(result.days[3].state,'neutral');assert.equal(result.days[4].state,'unknown');
 assert.equal(result.result.current.value,null);assert.equal(result.result.best.observed,1);
 assert.equal(view([snapshot('2026-10-18'),snapshot('2026-10-18')]).days[5].state,'unknown');
 const duplicate=snapshot('2026-10-18');duplicate.outcomes.push(duplicate.outcomes[0]);
 assert.throws(()=>view([duplicate]),/Duplicate routine/);
});
test('pending, skipped, missed break only verified closed days; today never resets yesterday',()=>{
 for(const status of ['pending','skipped','missed']) {
  assert.equal(view([snapshot('2026-10-18',status)]).result.current.value,0);
  const result=view([snapshot('2026-10-17','pending'),snapshot('2026-10-18'),snapshot('2026-10-19',status)]);
  assert.equal(result.result.current.value,1);assert.equal(result.days[6].state,'today');
 }
});
test('strict response/context checks fail closed for invalid zones, bodies, changed boundaries and absent snapshots',()=>{
 for(const body of [{},null,{context,snapshots:null},{context,records:[],nextCursor:null},{context,snapshots:[],nextCursor:null}])assert.throws(()=>presentTodayStreak(context,body));
 assert.throws(()=>view([],{...context,timezone:'Invalid/Zone'}));
 assert.throws(()=>presentTodayStreak(context,{context:{...context,revision:2},snapshots:[]}));
 assert.throws(()=>view([snapshot('2026-10-12')]));
});
test('only saved-zone context and assembled daily window are loaded; 401/missing RPC never invent values',async()=>{
 const calls=[];
 const result=await loadTodayStreak(async url=>{calls.push(url);return url.endsWith('/context')?context:{context,snapshots:[]};});
 assert.deepEqual(calls,['/api/daily-records/context','/api/daily-records?from=2026-10-13&to=2026-10-19']);
 assert.equal(result.result.current.value,null);assert.equal(result.bestLabel,'Not yet verified');
 for(const message of ['401','503 missing daily_read_window'])await assert.rejects(loadTodayStreak(async()=>{throw new Error(message);}),new RegExp(message));
});
test('malformed RPC pagination never reaches verified assembled history',async()=>{
 for(const value of [{context,records:[]},{context,records:[],dataRevision:1},{context,records:[],dataRevision:1,nextCursor:'2026-10-15'}]) {
  await assert.rejects(readDailyWindow(async()=>value,'2026-10-13','2026-10-19'));
 }
});
test('all 1001 authoritative children count; missing child or conflicting child cannot earn',()=>{
 const ids=Array.from({length:1001},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
 const day={date:'2026-10-18',evidence:'verified',scheduledRoutineIds:ids,outcomes:ids.map(routineId=>({routineId,status:'completed'}))};
 assert.equal(view([day]).days[5].completed,1001);
 assert.equal(view([{...day,outcomes:day.outcomes.slice(1)}]).days[5].state,'unknown');
 assert.throws(()=>view([{...day,outcomes:[...day.outcomes,{routineId:ids[0],status:'pending'}]}]));
});
test('calendar stepping crosses leap/year boundaries and handles extreme saved zones',()=>{
 assert.equal(stepDailyKey('2024-03-01',-1),'2024-02-29');assert.equal(stepDailyKey('2026-01-01',-1),'2025-12-31');
 assert.equal(stepDailyKey('2024-02-28',2),'2024-03-01');
 for(const timezone of ['Pacific/Kiritimati','Pacific/Pago_Pago','America/New_York','Europe/London']) {
  const result=view([],{...context,timezone,day:'2024-03-10'});
  assert.equal(result.days.at(-1).date,'2024-03-10');assert.equal(result.days[0].date,'2024-03-04');
 }
});
test('saved-zone midnight wake-up handles 23/25 hour DST days with no repeated polling',()=>{
 const spring=nextDailyBoundary('America/New_York',new Date('2024-03-10T05:00:00Z'));
 const fall=nextDailyBoundary('America/New_York',new Date('2024-11-03T04:00:00Z'));
 assert.ok(Math.abs(spring-23*3600000)<2000);assert.ok(Math.abs(fall-25*3600000)<2000);
 assert.ok(nextDailyBoundary('Africa/Lagos',new Date('2026-10-18T22:59:59Z'))<3000);
});
test('aborted old successes/errors cannot overwrite the newest read or unmounted card',()=>{
 const reads=latestDailyRead(),first=reads.start(),second=reads.start();
 assert.equal(first.signal.aborted,true);assert.equal(first.isCurrent(),false);assert.equal(second.isCurrent(),true);
 reads.cancel();assert.equal(second.signal.aborted,true);assert.equal(second.isCurrent(),false);
});
test('Today integration preserves scenic components and never reads legacy streak or mutates finance',()=>{
 const source=fs.readFileSync('src/components/dashboard/today-streak.tsx','utf8')+fs.readFileSync('src/lib/today-streak.ts','utf8');
 assert.doesNotMatch(source,/task\.streak|StreakEncouragement|\/api\/(tasks|finance|wealth)|localStorage|setInterval/);
 assert.match(source,/cache: 'no-store'/);assert.match(source,/crystrack-activity-updated/);
 assert.match(source,/crystrack-daily-boundary/);assert.match(source,/isRestrictedPreview/);
});
test('midnight between context and window gets exactly one fresh pair, never mixed-day evidence',async()=>{
 let calls=0;
 const next={...context,day:'2026-10-20'};
 const result=await loadTodayStreak(async url=>{
  calls++;
  if(url.endsWith('/context'))return calls===1?context:next;
  return {context:next,snapshots:[]};
 });
 assert.equal(calls,4);assert.equal(result.context.day,'2026-10-20');
 let changing=0;
 await assert.rejects(loadTodayStreak(async url=>{
  changing++;return url.endsWith('/context')?context:{context:next,snapshots:[]};
 }),/context changed/);
 assert.equal(changing,4);
});
