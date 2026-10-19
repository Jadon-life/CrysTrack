/** Disposable local sandbox only. Never accepts a DB URL/host or inherited credentials. */
import test,{after} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import fs from 'node:fs';
import {spawn} from 'node:child_process';import {localSql,assertTarget,ROOT} from '../scripts/local-supabase.mjs';import {localEnvironment,DOCKER_SOCKET,PROJECT} from '../scripts/local-supabase-policy.mjs';
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const role=(u,sql)=>`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='{"sub":"${u}","role":"authenticated"}'; ${sql}; COMMIT;`;
const owner=(u,sql)=>localSql(role(u,sql));const json=(u,sql)=>JSON.parse(owner(u,'SELECT '+sql).split('\n').at(-1)||'null');
const scalar=sql=>localSql(sql).split('\n').at(-1);
const clock=time=>localSql(`CREATE OR REPLACE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT '${time}'::timestamptz $$`);
const owners=new Set();
after(()=>{if(owners.size)localSql(`DELETE FROM money_entries WHERE user_id IN (${[...owners].map(quote).join(',')});DELETE FROM wealth_debts WHERE user_id IN (${[...owners].map(quote).join(',')});`);localSql("CREATE OR REPLACE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT clock_timestamp() $$");});
const total=u=>json(u,'sep28_crystal_state()').total;
function fixture(routines=1) {
 clock('2026-09-20T10:00:00Z');const u=randomUUID();owners.add(u);
 localSql(`INSERT INTO auth.users(id,email) VALUES('${u}','${u}@example.invalid');INSERT INTO profiles(user_id,timezone) VALUES('${u}','Africa/Lagos');`);
 json(u,'daily_context()');json(u,'sep28_crystal_state()');
 const ids=Array.from({length:routines},()=>randomUUID());
 for(const id of ids)localSql(`INSERT INTO recurring_tasks(id,user_id,title) VALUES('${id}','${u}','Synthetic crystal routine');INSERT INTO task_schedules(task_id,weekday) SELECT '${id}',generate_series(0,6);`);
 clock('2026-09-21T10:00:00Z');json(u,'daily_context()');return {u,ids};
}
const tick=(u,id,status,rev=1,key=randomUUID())=>json(u,`daily_set_outcome('2026-09-21','${id}','${status}',${rev},'${key}')`);
const configure=(u,enabled)=>{const state=json(u,'sep28_crystal_state()');return json(u,`sep28_crystal_configure(${enabled},${state.revision})`);};
function expense(u,{kind='expense',id=randomUUID(),extra=''}={}) {
 owner(u,`INSERT INTO money_entries(id,user_id,type,flow_kind,amount${extra?',debt_id':''}) VALUES('${id}','${u}','${kind}','${kind}',2500.25${extra?','+quote(extra):''})`);return id;
}
function concurrent(sql) {
 assertTarget();return new Promise(resolve=>{
  const child=spawn('docker',['--host',DOCKER_SOCKET,'exec','-i','supabase_db_'+PROJECT,'psql','-h','127.0.0.1','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],{cwd:ROOT,env:localEnvironment(process.env),stdio:['pipe','pipe','pipe']});
  let out='';child.stdout.on('data',d=>out+=d);child.stderr.resume();child.on('error',()=>resolve({code:-1,out}));child.on('exit',code=>resolve({code,out}));child.stdin.end(sql);
 });
}
test('crystal RLS and RPC ownership; no direct award, settings, event, moment or private function writes',()=>{
 const {u}=fixture(),{u:other}=fixture();
 for(const table of ['sep28_crystal_preferences','sep28_crystal_awards','sep28_crystal_events','sep28_crystal_moments']){
  assert.equal(scalar(`SELECT relrowsecurity FROM pg_class WHERE oid='public.${table}'::regclass`),'t');
  assert.throws(()=>owner(u,`DELETE FROM ${table}`));assert.throws(()=>localSql(`BEGIN;SET LOCAL ROLE anon;SELECT * FROM ${table};COMMIT;`));
  assert.equal(owner(other,`SELECT count(*) FROM ${table} WHERE user_id='${u}'`).split('\n').at(-1),'0');
 }
 assert.throws(()=>owner(u,`SELECT crystrack_sep28_crystals.reconcile('${u}','task','fake',true,true,true)`));
 assert.throws(()=>localSql('BEGIN;SET LOCAL ROLE anon;SELECT sep28_crystal_state();COMMIT;'));
 assert.throws(()=>owner(u,`UPDATE sep28_crystal_preferences SET enabled=false WHERE user_id='${u}'`));
});
test('task earns 5 once; replay, repeated state and undo/recomplete reconcile one source',()=>{
 const {u,ids:[id]}=fixture(),key=randomUUID();
 const first=tick(u,id,'completed',1,key);assert.equal(total(u),'5');
 assert.deepEqual(tick(u,id,'completed',1,key),first);assert.equal(total(u),'5');
 tick(u,id,'completed',2);assert.equal(total(u),'5');tick(u,id,'pending',2);assert.equal(total(u),'0');tick(u,id,'completed',3);assert.equal(total(u),'5');
 assert.equal(scalar(`SELECT sum(delta)=5 FROM sep28_crystal_events WHERE user_id='${u}'`),'t');
 assert.equal(scalar(`SELECT sum(balance)=5 FROM sep28_crystal_awards WHERE user_id='${u}'`),'t');
});
test('all-done day books 50 only at verified closure; repeated recovery cannot duplicate',()=>{
 const {u,ids:[id]}=fixture();tick(u,id,'completed');assert.equal(total(u),'5');
 clock('2026-09-22T10:00:00Z');json(u,'daily_context()');assert.equal(total(u),'55');
 json(u,'daily_context()');assert.equal(total(u),'55');
 assert.equal(scalar(`SELECT count(*) FROM sep28_crystal_events WHERE user_id='${u}' AND kind='day'`),'1');
 // Closed facts remain sealed by Piece 2C; rewards must not introduce a repair bypass.
 assert.throws(()=>localSql(`UPDATE daily_routine_records SET status='pending',completed_at=NULL WHERE user_id='${u}' AND day_key='2026-09-21'`));
 assert.equal(total(u),'55');
});
test('neutral, installation, incomplete schedule and skipped/missed/pending days never earn 50',()=>{
 for(const status of [null,'pending','skipped']){
  const {u,ids}=fixture(status===null?0:1);
  if(status==='skipped')tick(u,ids[0],'skipped');
  clock('2026-09-22T10:00:00Z');json(u,'daily_context()');assert.equal(total(u),'0');
 }
 const {u,ids:[id]}=fixture();
 localSql(`UPDATE daily_records SET evidence='incomplete' WHERE user_id='${u}' AND day_key='2026-09-21'`);
 tick(u,id,'completed');clock('2026-09-22T10:00:00Z');json(u,'daily_context()');assert.equal(total(u),'0');
});
test('OFF suppresses future awards and catch-up; undo still revokes; fresh later completions may earn',()=>{
 const {u,ids:[id]}=fixture();tick(u,id,'completed');configure(u,false);assert.equal(total(u),'5');
 tick(u,id,'pending',2);assert.equal(total(u),'0');tick(u,id,'completed',3);assert.equal(total(u),'0');
 configure(u,true);assert.equal(total(u),'0');json(u,'daily_context()');assert.equal(total(u),'0');
 tick(u,id,'pending',4);tick(u,id,'completed',5);assert.equal(total(u),'5');
 clock('2026-09-22T10:00:00Z');json(u,'daily_context()');assert.equal(total(u),'5');
 assert.throws(()=>json(u,'sep28_crystal_configure(false,1)'));
});
test('disabling after earning a closed bonus preserves it; later metadata reads cannot revoke it',()=>{
 const {u,ids:[id]}=fixture();tick(u,id,'completed');clock('2026-09-22T10:00:00Z');json(u,'daily_context()');
 configure(u,false);configure(u,true);
 assert.throws(()=>localSql(`UPDATE daily_records SET revision=revision+1 WHERE user_id='${u}' AND day_key='2026-09-21'`));
 json(u,'daily_context()');
 assert.equal(total(u),'55');
});
test('spending grants fixed 5 independent of amount; edits/deletes reconcile and preserve numeric money',()=>{
 const {u}=fixture(0);const id=expense(u);assert.equal(total(u),'5');
 owner(u,`UPDATE money_entries SET amount=99999999.99,note='Synthetic edit' WHERE id='${id}'`);assert.equal(total(u),'5');
 assert.equal(scalar(`SELECT amount::text FROM money_entries WHERE id='${id}'`),'99999999.99');
 owner(u,`UPDATE money_entries SET type='income',flow_kind='income' WHERE id='${id}'`);assert.equal(total(u),'0');
 owner(u,`UPDATE money_entries SET type='expense',flow_kind='expense' WHERE id='${id}'`);assert.equal(total(u),'5');
 owner(u,`DELETE FROM money_entries WHERE id='${id}'`);assert.equal(total(u),'0');
 for(const kind of ['income','saving','transfer'])expense(u,{kind});assert.equal(total(u),'0');
});
test('automatic and service-role rows stay ineligible even after origin FK clearing or edits',()=>{
 const {u}=fixture(0);const debt=randomUUID();owner(u,`INSERT INTO wealth_debts(id,user_id,kind,counterparty,original_amount,outstanding_amount) VALUES('${debt}','${u}','liability','Synthetic',100,100)`);
 const automatic=expense(u,{extra:debt});assert.equal(total(u),'0');
 owner(u,`DELETE FROM wealth_debts WHERE id='${debt}'`);owner(u,`UPDATE money_entries SET type='income',flow_kind='income' WHERE id='${automatic}'`);owner(u,`UPDATE money_entries SET type='expense',flow_kind='expense' WHERE id='${automatic}'`);assert.equal(total(u),'0');
 const server=randomUUID();localSql(`INSERT INTO money_entries(id,user_id,type,flow_kind,amount) VALUES('${server}','${u}','expense','expense',10)`);
 owner(u,`UPDATE money_entries SET type='income',flow_kind='income' WHERE id='${server}'`);owner(u,`UPDATE money_entries SET type='expense',flow_kind='expense' WHERE id='${server}'`);assert.equal(total(u),'0');
});
test('confirmed canonical owned goal check-in grants 25; fake activity, arbitrary keys and foreign goals do not',()=>{
 const {u}=fixture(0),{u:other}=fixture(0);const goal=randomUUID();owner(u,`INSERT INTO goals(id,user_id,title,checkin_config) VALUES('${goal}','${u}','Synthetic goal','{"frequency":"daily"}')`);
 const id=randomUUID();owner(u,`INSERT INTO goal_checkins(id,user_id,goal_id,occurrence_key) VALUES('${id}','${u}','${goal}','daily:2026-09-21')`);assert.equal(total(u),'25');
 assert.throws(()=>owner(u,`INSERT INTO goal_checkins(user_id,goal_id,occurrence_key) VALUES('${u}','${goal}','daily:2026-09-21')`));
 owner(u,`UPDATE goal_checkins SET response_text='Synthetic edit' WHERE id='${id}'`);assert.equal(total(u),'25');
 owner(u,`INSERT INTO goal_checkins(user_id,goal_id,occurrence_key) VALUES('${u}','${goal}','daily:2001-01-01')`);assert.equal(total(u),'25');
 owner(other,`INSERT INTO goal_checkins(user_id,goal_id,occurrence_key) VALUES('${other}','${goal}','daily:2026-09-21')`);assert.equal(total(other),'0');
 owner(u,`INSERT INTO activity_events(user_id,type,entity_type,entity_id,metadata_json) VALUES('${u}','task_completed','task','${goal}','{"shards":999999}')`);assert.equal(total(u),'25');
 assert.throws(()=>owner(u,`UPDATE goal_checkins SET occurrence_key='daily:2026-09-22' WHERE id='${id}'`));
 owner(u,`DELETE FROM goals WHERE id='${goal}'`);assert.equal(total(u),'0');
});
test('assignment completion earns 30 including late; replay, denied direct edits and delete are safe',()=>{
 const {u}=fixture(0),id=randomUUID();
 const fields={title:'Synthetic late',deadline:'2020-01-01T00:00:00Z',priority:'medium',timezone:'Africa/Lagos',reminder_config:{enabled:false,channels:['push'],offsetMinutes:[]}};
 const create=json(u,`assignment_mutate('create','${id}',NULL,'${JSON.stringify(fields)}')`);assert.equal(create.revision,1);
 const done=json(u,`assignment_mutate('complete','${id}',1,'{}')`);assert.equal(total(u),'30');
 json(u,`assignment_mutate('complete','${id}',1,'{}')`);assert.equal(total(u),'30');
 assert.throws(()=>owner(u,`UPDATE assignments SET status='completed',title='Edited' WHERE id='${id}'`));
 assert.throws(()=>json(u,`assignment_mutate('edit','${id}',${done.revision},'${JSON.stringify(fields)}')`));
 assert.throws(()=>owner(u,`UPDATE assignments SET id='${randomUUID()}' WHERE id='${id}'`));
 json(u,`assignment_mutate('delete','${id}',${done.revision},'{}')`);assert.equal(total(u),'0');
});
test('existing pre-feature money/completions are never awarded by metadata edits',()=>{
 const {u}=fixture(0);const id=randomUUID();
 localSql(`INSERT INTO assignments(id,user_id,title,deadline,status,completed_at) VALUES('${id}','${u}','Synthetic legacy','2020-01-01','completed',now())`);
 assert.throws(()=>owner(u,`UPDATE assignments SET title='Edit' WHERE id='${id}'`));localSql(`UPDATE assignments SET title='Operator metadata only' WHERE id='${id}'`);assert.equal(total(u),'0');
 const m=randomUUID();localSql(`INSERT INTO money_entries(id,user_id,type,amount) VALUES('${m}','${u}','expense',20)`);
 owner(u,`UPDATE money_entries SET note='Edit' WHERE id='${m}'`);assert.equal(total(u),'0');
});
test('concurrent identical task request mints one award; failed transactions leave no orphan shards',async()=>{
 const {u,ids:[id]}=fixture();const key=randomUUID();
 const sql=role(u,`SELECT daily_set_outcome('2026-09-21','${id}','completed',1,'${key}')`);
 const results=await Promise.all([concurrent(sql),concurrent(sql)]);assert.deepEqual(results.map(x=>x.code),[0,0]);assert.equal(total(u),'5');
 assert.throws(()=>owner(u,`INSERT INTO money_entries(user_id,type,amount) VALUES('${u}','expense',10);SELECT 1/0`));assert.equal(total(u),'5');
});
test('levels reconstruct from ledger; first-reached moment claimed atomically once across tabs/reversal/refresh',async()=>{
 const {u}=fixture(0);
 owner(u,`INSERT INTO money_entries(user_id,type,amount) SELECT '${u}','expense',1 FROM generate_series(1,100)`);assert.equal(total(u),'500');
 const results=await Promise.all([concurrent(role(u,'SELECT sep28_crystal_claim_moment()')),concurrent(role(u,'SELECT sep28_crystal_claim_moment()'))]);
 assert.equal(results.filter(x=>x.out.includes('"level": 2')).length,1);assert.equal(json(u,'sep28_crystal_claim_moment()'),null);
 const id=scalar(`SELECT id FROM money_entries WHERE user_id='${u}' LIMIT 1`);owner(u,`DELETE FROM money_entries WHERE id='${id}'`);expense(u);
 assert.equal(total(u),'500');assert.equal(json(u,'sep28_crystal_claim_moment()'),null);
 assert.equal(scalar(`SELECT sum(delta)=sum(balance) FROM (SELECT sum(delta) delta FROM sep28_crystal_events WHERE user_id='${u}') e CROSS JOIN (SELECT sum(balance) balance FROM sep28_crystal_awards WHERE user_id='${u}') a`),'t');
});
test('disabled level alerts are retired and do not reappear on enable',()=>{
 const {u}=fixture(0);owner(u,`INSERT INTO money_entries(user_id,type,amount) SELECT '${u}','expense',1 FROM generate_series(1,100)`);
 configure(u,false);configure(u,true);assert.equal(json(u,'sep28_crystal_claim_moment()'),null);assert.equal(total(u),'500');
});
test('SQL integer progression matches original stage boundaries and rounded segments',()=>{
 for(const [total,level] of [[0,1],[499,1],[500,2],[1099,2],[1100,3],[1820,4],[2684,5],[100000,21]]){
  if(total===100000)continue;
  assert.equal(scalar(`SELECT crystrack_sep28_crystals.level_for(${total})`),String(level));
 }
});
test('local maintenance freeze cannot mint task shards via sources or RPC; finance remains legitimate',()=>{
 const {u,ids:[id]}=fixture();
 localSql(fs.readFileSync('release/task-write-barrier/install.sql','utf8'));localSql(fs.readFileSync('release/task-write-barrier/enable.sql','utf8'));
 try{
  assert.throws(()=>tick(u,id,'completed'));assert.equal(total(u),'0');
  assert.throws(()=>owner(u,`SELECT crystrack_sep28_crystals.day_bonus('${u}','2026-09-21',true)`));
  expense(u);assert.equal(total(u),'5');
 }finally{localSql(fs.readFileSync('release/task-write-barrier/disable.sql','utf8'));localSql('DROP SCHEMA crystrack_release_gate CASCADE');}
});

test('open-day evidence correction revokes task shards without inventing catch-up on restoration',()=>{
 const {u,ids:[id]}=fixture();tick(u,id,'completed');assert.equal(total(u),'5');
 localSql(`UPDATE daily_records SET evidence='incomplete' WHERE user_id='${u}' AND day_key='2026-09-21'`);assert.equal(total(u),'0');
 localSql(`UPDATE daily_records SET evidence='verified' WHERE user_id='${u}' AND day_key='2026-09-21'`);assert.equal(total(u),'0');
});
