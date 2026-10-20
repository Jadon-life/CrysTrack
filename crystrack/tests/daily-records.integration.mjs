/** All SQL is synthetic and confined by the existing Docker/loopback target assertions. */
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {localSql, assertTarget, ROOT, readLocalKeys} from '../scripts/local-supabase.mjs';
import {localEnvironment, DOCKER_SOCKET, PROJECT} from '../scripts/local-supabase-policy.mjs';
import fs from 'node:fs';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const quote = s => "'"+String(s).replaceAll("'","''")+"'";
const role = (uid,sql) => `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='{"sub":"${uid}","role":"authenticated"}'; ${sql}; COMMIT;`;
const owner = (uid,sql) => localSql(role(uid,sql));
const json = (uid,sql) => JSON.parse(owner(uid,'SELECT '+sql).split('\n').at(-1));
const fails = fn => assert.throws(fn,/psql|docker/);
const scalar = sql => localSql(sql).split('\n').at(-1);
function clock(value) {localSql(`CREATE OR REPLACE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT ${quote(value)}::timestamptz $$`);}
after(()=>localSql("CREATE OR REPLACE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT clock_timestamp() $$"));
function fixture({zone='Africa/Lagos',time='2026-09-20T10:00:00Z',routines=1}={}) {
 clock(time);
 const uid=randomUUID(); const ids=Array.from({length:routines},()=>randomUUID());
 localSql(`INSERT INTO auth.users(id,email) VALUES('${uid}','${uid}@example.invalid');
 INSERT INTO public.profiles(user_id,timezone) VALUES('${uid}',${quote(zone)});`);
 json(uid,'public.daily_context()');
 for (const id of ids) {
  localSql(`INSERT INTO public.recurring_tasks(id,user_id,title) VALUES('${id}','${uid}','Synthetic routine');
   INSERT INTO public.task_schedules(task_id,weekday) SELECT '${id}',generate_series(0,6);`);
 }
 return {uid,ids};
}
const context=uid=>json(uid,'public.daily_context()');
const mutation=(uid,id,status,rev=1,request=randomUUID(),day='2026-09-21')=>json(uid,`public.daily_set_outcome('${day}','${id}','${status}',${rev},'${request}')`);
const window=(uid,from,to,after=null,limit=31,revision=null)=>json(uid,`public.daily_read_window('${from}','${to}',${after?quote(after):'NULL'},${limit},${revision??'NULL'})`);
function asyncSql(sql) {
 assertTarget();
 return new Promise(resolve=>{
  const child=spawn('docker',['--host',DOCKER_SOCKET,'exec','-i','supabase_db_'+PROJECT,'psql','-h','127.0.0.1','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],{cwd:ROOT,env:localEnvironment(process.env),stdio:['pipe','pipe','pipe']});
  let out=''; child.stdout.on('data',d=>out+=d); child.stderr.resume(); child.on('error',()=>resolve({code:-1,out})); child.on('exit',code=>resolve({code,out})); child.stdin.end(sql);
 });
}
function compiled(path) {
 let source=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const compiledModule={exports:{}}; new Function('require','module','exports',source)(require,compiledModule,compiledModule.exports); return compiledModule.exports;
}
const {readDailyWindow,assembleDailySnapshots}=compiled('src/lib/daily-records.ts');
const {calculateDailyStreak}=compiled('src/lib/daily-streak.ts');

test('authoritative tables are owner-readable only; anonymous, foreign and evidence writes fail',()=>{
 const a=fixture(),b=fixture();
 const tables=['daily_tracking_states','daily_timezone_transitions','routine_schedule_versions','daily_records','daily_routine_records','daily_mutation_requests','daily_notes'];
 for(const table of tables) {
  assert.equal(scalar(`SELECT relrowsecurity FROM pg_class WHERE oid='public.${table}'::regclass`),'t');
  fails(()=>owner(a.uid,`DELETE FROM public.${table}`));
  fails(()=>localSql(`BEGIN; SET LOCAL ROLE anon; SELECT * FROM public.${table}; COMMIT;`));
 }
 assert.equal(owner(b.uid,`SELECT count(*) FROM public.daily_records WHERE user_id='${a.uid}'`).split('\n').at(-1),'0');
 fails(()=>owner(a.uid,`SELECT public.recover_daily_records('${b.uid}',31)`));
 fails(()=>localSql('BEGIN; SET LOCAL ROLE anon; SELECT public.daily_context(); COMMIT;'));
 clock('2026-09-21T10:00:00Z');
 fails(()=>mutation(b.uid,a.ids[0],'completed'));
 fails(()=>owner(a.uid,`UPDATE public.profiles SET scheduling_timezone='Pacific/Kiritimati' WHERE user_id='${a.uid}'`));
 fails(()=>owner(a.uid,`INSERT INTO public.task_occurrences(task_id,date,status) VALUES('${a.ids[0]}','2026-09-21','completed')`));
});

test('desired state retries return cached results; conflicts cannot toggle or duplicate activity',()=>{
 const {uid,ids:[id]}=fixture(); clock('2026-09-21T10:00:00Z');
 const request=randomUUID(); const first=mutation(uid,id,'completed',1,request);
 assert.equal(first.status,'completed'); assert.equal(first.revision,2);
 assert.deepEqual(mutation(uid,id,'completed',1,request),first);
 fails(()=>mutation(uid,id,'skipped',1,request));
 fails(()=>mutation(uid,id,'pending',1));
 assert.equal(scalar(`SELECT count(*) FROM public.activity_events WHERE user_id='${uid}'`),'1');
 assert.equal(scalar(`SELECT status FROM public.task_occurrences WHERE task_id='${id}'`),'completed');
 const undo=mutation(uid,id,'pending',2); assert.equal(undo.revision,3);
 assert.equal(scalar(`SELECT count(*) FROM public.activity_events WHERE user_id='${uid}'`),'0');
 // The original intent still replays after an undo and midnight, without reapplying it.
 clock('2026-09-22T10:00:00Z');
 assert.deepEqual(mutation(uid,id,'completed',1,request),first);
 assert.equal(scalar(`SELECT status FROM public.daily_routine_records WHERE user_id='${uid}' AND day_key='2026-09-21'`),'pending');
 fails(()=>mutation(uid,id,'completed',3,randomUUID()));
});

test('real concurrent complete/skip calls serialize; closure uses the same lock and deadline',async()=>{
 const {uid,ids:[id]}=fixture(); clock('2026-09-21T23:00:00+01:00'); context(uid);
 const requests=await Promise.all(['completed','skipped'].map(status=>asyncSql(role(uid,`SELECT public.daily_set_outcome('2026-09-21','${id}','${status}',1,'${randomUUID()}')`))));
 assert.deepEqual(requests.map(r=>r.code).sort(),[0,3]);
 assert.equal(scalar(`SELECT revision FROM public.daily_routine_records WHERE user_id='${uid}' AND day_key='2026-09-21'`),'2');
 clock('2026-09-21T23:00:00Z'); // Exactly Lagos midnight.
 const race=await Promise.all([
  asyncSql(role(uid,`SELECT public.daily_set_outcome('2026-09-21','${id}','pending',2,'${randomUUID()}')`)),
  asyncSql(`BEGIN; SET LOCAL ROLE service_role; SELECT public.recover_daily_records('${uid}',31); COMMIT;`),
 ]);
 assert.equal(race[0].code,3); assert.equal(race[1].code,0);
 assert.equal(scalar(`SELECT close_status FROM public.daily_records WHERE user_id='${uid}' AND day_key='2026-09-21'`),'closed');
 assert.equal(scalar(`SELECT count(*) FROM public.activity_events WHERE user_id='${uid}'`),'1');
});

test('activity failure rolls back durable outcome, compatibility row and request receipt together',()=>{
 const {uid,ids:[id]}=fixture();clock('2026-09-21T10:00:00Z');context(uid);
 const request=randomUUID();
 localSql(`CREATE FUNCTION crystrack_local_control.fail_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='${uid}' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER synthetic_fail BEFORE INSERT ON public.activity_events FOR EACH ROW EXECUTE FUNCTION crystrack_local_control.fail_activity();`);
 try {
  fails(()=>mutation(uid,id,'completed',1,request));
  assert.equal(scalar(`SELECT status FROM public.daily_routine_records WHERE user_id='${uid}' AND day_key='2026-09-21'`),'pending');
  assert.equal(scalar(`SELECT count(*) FROM public.task_occurrences WHERE task_id='${id}'`),'0');
  assert.equal(scalar(`SELECT count(*) FROM public.daily_mutation_requests WHERE user_id='${uid}'`),'0');
 } finally {localSql('DROP TRIGGER synthetic_fail ON public.activity_events; DROP FUNCTION crystrack_local_control.fail_activity();');}
 assert.equal(mutation(uid,id,'completed',1,request).status,'completed');
});

test('capture starts tomorrow; verified empty is distinct from missing/unknown history',async()=>{
 const {uid}=fixture({routines:0});clock('2026-09-21T10:00:00Z');context(uid);
 const first=window(uid,'2026-09-19','2026-09-21');
 assert.deepEqual(first.records.map(r=>[r.day_key,r.evidence,r.expected_count]),[['2026-09-20','incomplete',0],['2026-09-21','verified',0]]);
 const out=await readDailyWindow(async(a,rev)=>window(uid,'2026-09-19','2026-09-21',a,1,rev),'2026-09-19','2026-09-21');
 assert.equal(out.snapshots.length,2);
 assert.equal(out.snapshots[1].evidence,'verified');
 const streak=calculateDailyStreak({timezone:'Africa/Lagos',now:new Date('2026-09-21T10:00:00Z'),coverageStart:'2026-09-19',historyFromBeginning:false,snapshots:out.snapshots});
 assert.equal(streak.current.value,null);assert.equal(streak.best.status,'partial');
 assert.deepEqual(streak.coverage.unknownDates,['2026-09-19','2026-09-20']);
 const active=fixture();clock('2026-09-21T10:00:00Z');mutation(active.uid,active.ids[0],'completed');
 clock('2026-09-22T10:00:00Z'); // Context lazily closes yesterday even if worker never ran.
 const successful=await readDailyWindow(async(a,rev)=>window(active.uid,'2026-09-20','2026-09-22',a,1,rev),'2026-09-20','2026-09-22');
 const partial=calculateDailyStreak({timezone:'Africa/Lagos',now:new Date('2026-09-22T10:00:00Z'),coverageStart:'2026-09-20',historyFromBeginning:false,snapshots:successful.snapshots});
 assert.deepEqual(partial.current,{value:null,verifiedDays:1,status:'partial'});
 assert.deepEqual(partial.best,{observed:1,status:'partial'});
});

test('schedule edits, bounds and archiving take effect next day; frozen title and set survive',()=>{
 const {uid,ids:[id]}=fixture();clock('2026-09-21T10:00:00Z');context(uid);
 owner(uid,`UPDATE public.recurring_tasks SET title='Future title' WHERE id='${id}';
 UPDATE public.task_schedules SET start_date='2026-09-23T00:00:00Z',end_date='2026-09-24T00:00:00Z' WHERE task_id='${id}'`);
 assert.equal(window(uid,'2026-09-21','2026-09-21').records[0].routines[0].title,'Synthetic routine');
 clock('2026-09-22T10:00:00Z');assert.equal(window(uid,'2026-09-22','2026-09-22').records[0].expected_count,0);
 clock('2026-09-23T10:00:00Z');assert.equal(window(uid,'2026-09-23','2026-09-23').records[0].expected_count,1);
 assert.equal(window(uid,'2026-09-23','2026-09-23').records[0].routines[0].title,'Future title');
 json(uid,`public.daily_retire_routine('${id}')`);
 assert.equal(window(uid,'2026-09-23','2026-09-23').records[0].expected_count,1);
 clock('2026-09-24T10:00:00Z');assert.equal(window(uid,'2026-09-24','2026-09-24').records[0].expected_count,0);
});

test('hard deletion preserves durable identity/outcomes; current-day action works without resurrecting definition',()=>{
 const {uid,ids:[id]}=fixture();clock('2026-09-21T10:00:00Z');context(uid);
 mutation(uid,id,'completed');
 owner(uid,`DELETE FROM public.recurring_tasks WHERE id='${id}'`);
 assert.equal(scalar(`SELECT count(*) FROM public.task_occurrences WHERE task_id='${id}'`),'0');
 assert.equal(window(uid,'2026-09-21','2026-09-21').records[0].routines[0].status,'completed');
 mutation(uid,id,'pending',2);mutation(uid,id,'completed',3);
 assert.equal(scalar(`SELECT count(*) FROM public.recurring_tasks WHERE id='${id}'`),'0');
 assert.equal(scalar(`SELECT count(*) FROM public.activity_events WHERE user_id='${uid}'`),'1');
 clock('2026-09-22T10:00:00Z');assert.equal(window(uid,'2026-09-22','2026-09-22').records[0].expected_count,0);
});

// Issue #43 prerequisite audit: these characterize intentional ONLINE semantics,
// not permission to replay an offline queue. A browser preflight can become stale
// between its read and POST; only a server-side check under lock_owner can fence it.
for (const removal of ['archive','delete']) {
 test(`offline prerequisite: ${removal} after preflight does not fence an existing online outcome`,()=>{
  const {uid,ids:[id]}=fixture();clock('2026-09-21T10:00:00Z');context(uid);
  const before=window(uid,'2026-09-21','2026-09-21').records[0].routines[0];
  assert.equal(before.status,'pending'); assert.equal(before.revision,1);
  assert.equal(scalar(`SELECT active FROM public.recurring_tasks WHERE id='${id}'`),'t');
  // Deterministic interleaving: device A finishes its preflight; device B commits
  // removal; then A delivers its original, now-ineligible offline intent.
  if (removal==='archive') json(uid,`public.daily_retire_routine('${id}')`);
  else owner(uid,`DELETE FROM public.recurring_tasks WHERE id='${id}'`);
  assert.equal(scalar(`SELECT count(*) FROM public.recurring_tasks WHERE id='${id}' AND active AND archived_at IS NULL`),'0');
  const frozen=window(uid,'2026-09-21','2026-09-21').records[0].routines[0];
  assert.equal(frozen.revision,before.revision);
  assert.equal(frozen.status,'pending');
  const request=randomUUID();
  const result=mutation(uid,id,'completed',before.revision,request);
  assert.equal(result.status,'completed'); assert.equal(result.revision,2);
  assert.equal(scalar(`SELECT count(*) FROM public.daily_mutation_requests WHERE user_id='${uid}' AND request_id='${request}'`),'1');
  assert.deepEqual(mutation(uid,id,'completed',before.revision,request),result);
  assert.equal(scalar(`SELECT count(*) FROM public.activity_events WHERE user_id='${uid}'`),'1');
  // Existing online idempotency is sound, but cannot enforce the stricter
  // offline archive/delete conflict requirement. Do not change legacy behavior.
 });
}

test('missed-worker recovery is bounded, idempotent and uses version history, not current schedules',()=>{
 const {uid,ids:[id]}=fixture();
 clock('2026-09-21T10:00:00Z');mutation(uid,id,'skipped');
 clock('2026-09-25T10:00:00Z');
 localSql(`BEGIN; SET LOCAL ROLE service_role; SELECT public.recover_daily_records('${uid}',2); COMMIT;`);
 assert.equal(scalar(`SELECT recovery_cursor FROM public.daily_tracking_states WHERE user_id='${uid}'`),'2026-09-22');
 localSql(`BEGIN; SET LOCAL ROLE service_role; SELECT public.recover_daily_records('${uid}',31); COMMIT;`);
 const rows=window(uid,'2026-09-20','2026-09-24').records;
 assert.equal(rows.length,5);assert.ok(rows.every(r=>r.close_status==='closed'));
 assert.equal(rows[0].routines.length,0); // Newly created routine is first eligible tomorrow.
 assert.equal(rows[1].routines[0].status,'skipped');
 assert.deepEqual(rows.slice(2).map(r=>r.routines[0].status),['missed','missed','missed']);
 const revisions=rows.map(r=>r.routines[0]?.revision);
 localSql(`BEGIN; SET LOCAL ROLE service_role; SELECT public.recover_daily_records('${uid}',31); COMMIT;`);
 assert.deepEqual(window(uid,'2026-09-20','2026-09-24').records.map(r=>r.routines[0]?.revision),revisions);
 fails(()=>localSql(`UPDATE public.daily_records SET close_status='open',closed_at=NULL WHERE user_id='${uid}' AND day_key='2026-09-21'`));
});

test('pagination pins a consistent revision and assembler rejects incomplete/duplicate child sets',async()=>{
 const {uid}=fixture({routines:0});clock('2026-10-25T12:00:00Z');
 localSql(`BEGIN; SET LOCAL ROLE service_role; SELECT public.recover_daily_records('${uid}',31); SELECT public.recover_daily_records('${uid}',31); COMMIT;`);
 let calls=0;
 const assembled=await readDailyWindow(async(a,rev)=>{calls++;return window(uid,'2026-09-20','2026-10-24',a,7,rev);},'2026-09-20','2026-10-24');
 assert.equal(assembled.records.length,35);assert.equal(calls,5);
 const page=window(uid,'2026-09-20','2026-10-24',null,1);
 context(uid); // already current, no mutation; note save also must not invalidate outcome read.
 json(uid,"public.daily_save_note('2026-10-25','Private',0)");
 assert.equal(window(uid,'2026-09-20','2026-10-24',page.nextCursor,1,page.dataRevision).records.length,1);
 const {uid:other,ids:[id]}=fixture();clock('2026-09-21T12:00:00Z');context(other);
 const before=window(other,'2026-09-20','2026-09-21',null,1);
 mutation(other,id,'completed');
 fails(()=>window(other,'2026-09-20','2026-09-21',before.nextCursor,1,before.dataRevision));
 const row=window(other,'2026-09-21','2026-09-21').records[0];
 assert.equal(assembleDailySnapshots([{...row,routines:[]}],'2026-09-21')[0].evidence,'incomplete');
 assert.equal(assembleDailySnapshots([{...row,routines:[row.routines[0],row.routines[0]],expected_count:2}],'2026-09-21')[0].evidence,'incomplete');
 assert.throws(()=>assembleDailySnapshots([row,row],'2026-09-21'),/Duplicate/);
 await assert.rejects(()=>readDailyWindow(async()=>({...before,nextCursor:'2026-09-19'}),'2026-09-20','2026-09-21'),/cursor/);
});

test('materialized DST midnights span exactly 23/25 hours and mutation closes at local midnight',()=>{
 for(const [start,day,hours] of [['2026-03-07T12:00:00Z','2026-03-08',23],['2026-10-31T12:00:00Z','2026-11-01',25]]) {
  const {uid,ids:[id]}=fixture({zone:'America/New_York',time:start});
  clock(day+'T12:00:00Z');context(uid);
  assert.equal(Number(scalar(`SELECT extract(epoch FROM(closes_at-opens_at))/3600 FROM public.daily_records WHERE user_id='${uid}' AND day_key='${day}'`)),hours);
  const end=scalar(`SELECT closes_at FROM public.daily_records WHERE user_id='${uid}' AND day_key='${day}'`);
  clock(end);fails(()=>mutation(uid,id,'completed',1,randomUUID(),day));
 }
});

test('explicit westward boundary waits, keeps old facts and never reopens/repeats a date',()=>{
 const {uid,ids:[id]}=fixture({zone:'Pacific/Kiritimati',time:'2026-09-20T01:00:00Z'});clock('2026-09-21T01:00:00Z');context(uid);
 mutation(uid,id,'completed');
 const transition=json(uid,"public.daily_request_timezone('Pacific/Honolulu',1)");
 assert.equal(transition.previous_day,'2026-09-21');assert.equal(transition.first_day,'2026-09-22');
 clock('2026-09-21T10:01:00Z');fails(()=>context(uid)); // old midnight; new date still 21.
 clock(transition.effective_at);const ctx=context(uid);
 assert.equal(ctx.day,'2026-09-22');assert.equal(ctx.timezone,'Pacific/Honolulu');
 const old=window(uid,'2026-09-21','2026-09-22').records[0];
 assert.equal(old.timezone,'Pacific/Kiritimati');assert.equal(old.close_status,'closed');assert.equal(old.routines[0].status,'completed');
 fails(()=>mutation(uid,id,'pending',2,randomUUID(),'2026-09-21'));
 assert.equal(scalar(`SELECT count(*) FROM public.daily_records WHERE user_id='${uid}' AND day_key='2026-09-21'`),'1');
});

test('eastward skipped dates remain unknown, partial transition day cannot earn verified credit',()=>{
 const {uid}=fixture({zone:'Pacific/Honolulu',routines:0});clock('2026-09-21T12:00:00Z');context(uid);
 const transition=json(uid,"public.daily_request_timezone('Pacific/Kiritimati',1)");
 assert.equal(transition.first_day,'2026-09-23');
 clock(transition.effective_at);assert.equal(context(uid).day,'2026-09-23');
 const rows=window(uid,'2026-09-21','2026-09-23').records;
 assert.deepEqual(rows.map(r=>r.day_key),['2026-09-21','2026-09-23']);
 // Exactly +24h zone jump lands on a full midnight, so day 23 can be verified.
 assert.equal(rows[1].evidence,'verified');
 const b=fixture({zone:'America/New_York',routines:0});clock('2026-09-21T12:00:00Z');context(b.uid);
 const t=json(b.uid,"public.daily_request_timezone('Asia/Tokyo',1)");
 clock(t.effective_at);context(b.uid);
 assert.equal(window(b.uid,t.first_day,t.first_day).records[0].evidence,'incomplete');
});

test('notes create/update/clear use owner revisions, Unicode limit and never generate activity or receipts',()=>{
 const {uid}=fixture({routines:0});const b=fixture({routines:0});
 let note=json(uid,"public.daily_save_note('2026-09-20','Private synthetic note',0)");assert.equal(note.revision,1);
 fails(()=>json(uid,"public.daily_save_note('2026-09-20','Overwrite',0)"));
 note=json(uid,"public.daily_save_note('2026-09-20','Updated',1)");assert.equal(note.revision,2);
 note=json(uid,"public.daily_save_note('2026-09-20','   ',2)");assert.equal(note.body,'');assert.equal(note.revision,3);
 assert.equal(owner(b.uid,`SELECT count(*) FROM public.daily_notes WHERE user_id='${uid}'`).split('\n').at(-1),'0');
 fails(()=>json(uid,"public.daily_save_note('2026-09-20',repeat('a',4001),3)"));
 note=json(uid,"public.daily_save_note('2026-09-20',repeat('🌱',4000),3)");assert.equal([...note.body].length,4000);
 assert.equal(scalar(`SELECT count(*) FROM public.activity_events WHERE user_id='${uid}'`),'0');
 assert.equal(scalar(`SELECT count(*) FROM public.daily_mutation_requests WHERE user_id='${uid}'`),'0');
});

test('legacy duplicates remain incomplete and closure never invents their missed outcomes',()=>{
 const {uid,ids:[id]}=fixture();clock('2026-09-21T10:00:00Z');
 localSql(`INSERT INTO public.task_occurrences(task_id,date,status) VALUES('${id}','2026-09-21T00:00:00Z','completed'),('${id}','2026-09-21T01:00:00Z','pending')`);
 const row=window(uid,'2026-09-21','2026-09-21').records[0];
 assert.equal(row.evidence,'incomplete');assert.equal(row.routines[0].legacy_conflict,true);
 fails(()=>mutation(uid,id,'completed'));
 clock('2026-09-22T12:00:00Z');
 localSql(`BEGIN; SET LOCAL ROLE service_role; SELECT public.recover_daily_records('${uid}',31); COMMIT;`);
 const closed=window(uid,'2026-09-21','2026-09-21').records[0];
 assert.equal(closed.close_status,'closed');assert.equal(closed.routines[0].status,'pending');
 assert.equal(scalar(`SELECT count(*) FROM public.task_occurrences WHERE task_id='${id}'`),'2');
});

test('scalar pages include more than the usual 1000-child PostgREST cap',async()=>{
 const {uid}=fixture({routines:0});
 // Synthetic historical identities deliberately have no mutable definition FK.
 localSql(`INSERT INTO public.routine_schedule_versions(user_id,routine_key,version,effective_from,enabled,title,schedule,created_at)
 SELECT '${uid}',gen_random_uuid(),1,'2026-09-21',true,'Synthetic large set','[{"weekday":1}]'::jsonb,crystrack_daily.clock() FROM generate_series(1,1001)`);
 clock('2026-09-21T12:00:00Z');
 const assembled=await readDailyWindow(async(a,rev)=>window(uid,'2026-09-21','2026-09-21',a,1,rev),'2026-09-21','2026-09-21');
 assert.equal(assembled.snapshots[0].scheduledRoutineIds.length,1001);
 assert.equal(assembled.snapshots[0].outcomes.length,1001);assert.equal(assembled.snapshots[0].evidence,'verified');
});

test('routine creation commits all schedules together and invalid payload cannot leave an orphan',()=>{
 const {uid}=fixture({routines:0});
 const payload={title:'Atomic creation',schedules:[0,1,1,4],reminderConfig:{enabled:false}};
 const made=json(uid,`public.daily_create_routine(${quote(JSON.stringify(payload))}::jsonb)`);
 assert.equal(made.task_schedules.length,3);
 assert.equal(scalar(`SELECT count(*) FROM public.recurring_tasks WHERE user_id='${uid}'`),'1');
 fails(()=>json(uid,`public.daily_create_routine(${quote(JSON.stringify({...payload,title:'Invalid creation',schedules:[1,9]}))}::jsonb)`));
 assert.equal(scalar(`SELECT count(*) FROM public.recurring_tasks WHERE user_id='${uid}'`),'1');
});

test('concurrent note saves cannot overwrite the same revision',async()=>{
 const {uid}=fixture({routines:0});
 const results=await Promise.all(['First','Second'].map(body=>asyncSql(role(uid,`SELECT public.daily_save_note('2026-09-20','${body}',0)`))));
 assert.deepEqual(results.map(r=>r.code).sort(),[0,3]);
 assert.equal(scalar(`SELECT revision FROM public.daily_notes WHERE user_id='${uid}'`),'1');
});

test('actual local Auth/PostgREST exposes only the owner RPC and private-note contract',async()=>{
 clock('2026-09-20T10:00:00Z');
 const keys=readLocalKeys();
 const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
 const client=createClient(keys.NEXT_PUBLIC_SUPABASE_URL,keys.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
 const signup=await client.auth.signUp({email:`daily-${randomUUID()}@example.invalid`,password:randomUUID()+'aA1!'});
 assert.equal(signup.error,null);assert.ok(signup.data.session);
 const ctx=await client.rpc('daily_context');assert.equal(ctx.error,null);assert.equal(ctx.data.day,'2026-09-20');
 const create=await client.rpc('daily_create_routine',{p_payload:{title:'HTTP synthetic',schedules:[0,1,2,3,4,5,6]}});
 assert.equal(create.error,null);assert.equal(create.data.task_schedules.length,7);
 clock('2026-09-21T10:00:00Z');
 const result=await client.rpc('daily_set_outcome',{p_day:'2026-09-21',p_routine:create.data.id,p_status:'completed',p_expected_revision:1,p_request_id:randomUUID()});
 assert.equal(result.error,null);assert.equal(result.data.revision,2);
 const note=await client.rpc('daily_save_note',{p_day:'2026-09-21',p_body:'Private HTTP synthetic',p_expected_revision:0});
 assert.equal(note.error,null);assert.equal(note.data.revision,1);
 const read=await client.from('daily_notes').select('body,revision').eq('day_key','2026-09-21');
 assert.equal(read.error,null);assert.deepEqual(read.data,[{body:'Private HTTP synthetic',revision:1}]);
 const forge=await client.from('daily_records').update({evidence:'verified'}).eq('day_key','2026-09-21');assert.ok(forge.error);
 const anonymous=createClient(keys.NEXT_PUBLIC_SUPABASE_URL,keys.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
 assert.ok((await anonymous.rpc('daily_context')).error);
 assert.ok((await client.rpc('recover_daily_records',{p_user_id:signup.data.user.id,p_limit:31})).error);
 assert.equal((await client.auth.signOut()).error,null);
});

test('real HTTP conflicts terminate with 409, release locks and preserve outcomes, receipts and notes',async()=>{
 clock('2026-09-20T10:00:00Z');
 const keys=readLocalKeys();
 const client=createClient(keys.NEXT_PUBLIC_SUPABASE_URL,keys.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const signup=await client.auth.signUp({email:`conflict-${randomUUID()}@example.invalid`,password:randomUUID()+'aA1!'});
 assert.equal(signup.error,null);const uid=signup.data.user.id;
 assert.equal((await client.from('profiles').upsert({user_id:uid,timezone:'UTC'})).error,null);
 const rpc=(name,args)=>client.rpc(name,args).abortSignal(AbortSignal.timeout(3000));
 const conflict=async(name,args)=>{
  const value=await rpc(name,args);
  assert.equal(value.status,409,`${name} must return promptly, not time out`);
  assert.equal(value.error?.code,'PT409');
 };
 assert.equal((await rpc('daily_context')).error,null);
 const created=await rpc('daily_create_routine',{p_payload:{title:'HTTP conflict fixture',schedules:[0,1,2,3,4,5,6]}});
 assert.equal(created.error,null);
 clock('2026-09-21T10:00:00Z');
 const intent={p_day:'2026-09-21',p_routine:created.data.id,p_status:'completed',p_expected_revision:1,p_request_id:randomUUID()};
 const first=await rpc('daily_set_outcome',intent);assert.equal(first.error,null);assert.equal(first.data.revision,2);
 await conflict('daily_set_outcome',{...intent,p_request_id:randomUUID()}); // Stale revision.
 await conflict('daily_set_outcome',{...intent,p_status:'pending'}); // Reused request identity.
 await conflict('daily_set_outcome',{...intent,p_day:'2026-09-20',p_request_id:randomUUID()});
 assert.deepEqual((await rpc('daily_set_outcome',intent)).data,first.data); // Retry remains idempotent.
 assert.equal(scalar(`SELECT count(*) FROM public.daily_mutation_requests WHERE user_id='${uid}'`),'1');
 assert.equal(scalar(`SELECT count(*) FROM public.activity_events WHERE user_id='${uid}'`),'1');
 assert.equal((await rpc('daily_save_note',{p_day:intent.p_day,p_body:'Synthetic private note',p_expected_revision:0})).error,null);
 await conflict('daily_save_note',{p_day:intent.p_day,p_body:'Must not overwrite',p_expected_revision:0});
 assert.equal(scalar(`SELECT body FROM public.daily_notes WHERE user_id='${uid}'`),'Synthetic private note');
 assert.equal((await rpc('daily_save_note',{p_day:intent.p_day,p_body:'',p_expected_revision:1})).data.revision,2);
 const ctx=await rpc('daily_context');assert.equal(ctx.error,null);
 await conflict('daily_request_timezone',{p_timezone:'America/New_York',p_expected_revision:0});
 const window=await rpc('daily_read_window',{p_from:intent.p_day,p_to:intent.p_day});assert.equal(window.error,null);
 await conflict('daily_read_window',{p_from:intent.p_day,p_to:intent.p_day,p_data_revision:window.data.dataRevision+1});
 const undo=await rpc('daily_set_outcome',{...intent,p_status:'pending',p_expected_revision:2,p_request_id:randomUUID()});
 assert.equal(undo.error,null);assert.equal(undo.data.revision,3);
 assert.equal(scalar(`SELECT count(*) FROM public.activity_events WHERE user_id='${uid}'`),'0');
 const transition=await rpc('daily_request_timezone',{p_timezone:'America/New_York',p_expected_revision:ctx.data.revision});
 assert.equal(transition.error,null);
 clock('2026-09-22T00:00:00Z'); // Old midnight, before the new zone's first midnight.
 await conflict('daily_context');
 clock(transition.data.effective_at);
 assert.equal((await rpc('daily_context')).data.timezone,'America/New_York');
 assert.equal((await client.auth.signOut()).error,null);
});

test('no finance fixtures or mutations are introduced',()=>{
 for(const table of ['money_entries','finance_targets','wealth_debts','wealth_expected_flows']) assert.equal(scalar(`SELECT count(*) FROM public.${table}`),'0');
});
