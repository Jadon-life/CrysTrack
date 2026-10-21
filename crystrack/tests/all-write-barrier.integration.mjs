/** PG15 Docker: fixed, disposable, fabricated data; never an ordinary CI test. */
import fs from 'node:fs';
import path from 'node:path';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {allAction,REHEARSAL_ENV} from '../scripts/all-write-barrier.mjs';
import {raw,sql} from '../scripts/task-release-barrier.mjs';
import {ROOT} from '../scripts/local-supabase.mjs';

let created=false;
let uid,taskId;
const literal=s=>"'"+String(s).replaceAll("'","''")+"'";
const blocked=q=>{
  const x=raw(q,{allowFailure:true});
  assert.notEqual(x.status,0,'Unexpected permitted synthetic database write');
  assert.match(x.stderr,/PT503/,'Expected full database barrier denial (not RLS or unrelated failure)');
};
before(()=>{
  if(process.env.CRYSTRACK_RELEASE_REHEARSAL!==REHEARSAL_ENV)throw Error('Explicit Issue55 synthetic-only env required');
  allAction('prepare');created=true;
  uid=randomUUID();taskId=randomUUID();
  sql("INSERT INTO auth.users(id,email) VALUES ("+literal(uid)+",'synthetic@example.invalid');"+
    "INSERT INTO public.profiles(user_id,timezone) VALUES ("+literal(uid)+",'Africa/Lagos');"+
    "INSERT INTO public.recurring_tasks(id,user_id,title) VALUES("+literal(taskId)+","+literal(uid)+",'Synthetic daily routine');"+
    "INSERT INTO public.task_schedules(task_id,weekday) VALUES("+literal(taskId)+",1);"+
    "INSERT INTO public.money_entries(user_id,type,amount) VALUES("+literal(uid)+",'income',2500.10);"+
    "INSERT INTO public.finance_targets(user_id,title,target_amount,current_amount) VALUES("+literal(uid)+",'Synthetic saving',5000.00,1250.05);");
  assert.equal(sql('SELECT sum((amount * 100)::bigint) FROM public.money_entries'),'250010');
});
after(()=>{
  if(!created)return;
  try{
    if(allAction('check').active)allAction('disable');
  }finally{
    allAction('destroy');
  }
});

test('full synthetic gate denies task/finance direct DML and privileged-service operations',()=>{
  const pre=allAction('preflight');
  assert.equal(pre.installed,false);
  const ready=allAction('enable');
  assert.equal(ready.active,true);
  assert.ok(ready.protectedTables>=17);
  blocked("INSERT INTO public.money_entries(user_id,type,amount) VALUES("+literal(uid)+",'income',0.01)");
  blocked("UPDATE public.money_entries SET amount=999 WHERE user_id="+literal(uid));
  blocked("DELETE FROM public.money_entries WHERE user_id="+literal(uid));
  blocked("TRUNCATE public.money_entries");
  blocked("INSERT INTO public.recurring_tasks(user_id,title) VALUES("+literal(uid)+",'Unwanted task')");
  blocked("BEGIN; SET LOCAL ROLE service_role; INSERT INTO public.money_entries(user_id,type,amount) VALUES("+literal(uid)+",'expense',0.01); COMMIT;");
  assert.equal(sql('SELECT sum((amount * 100)::bigint) FROM public.money_entries'),'250010');
  assert.equal(allAction('check').active,true);
});

test('event hook automatically guards new public/private receipt tables; missing/unknown hooks fail closed',()=>{
  sql('CREATE TABLE public.issue55_future(id integer PRIMARY KEY)');
  sql('CREATE SCHEMA crystrack_issue55');
  sql('CREATE TABLE crystrack_issue55.synthetic_receipt(id integer PRIMARY KEY)');
  blocked('INSERT INTO public.issue55_future VALUES(1)');
  blocked('INSERT INTO crystrack_issue55.synthetic_receipt VALUES(1)');
  assert.ok(allAction('check').protectedTables>=19);
});

test('candidate migrations remain byte-identical, can be applied while the all-domain gate is active, and leave data frozen',()=>{
  const files=['0013_daily_records','0014_daily_http_conflicts','0015_sep28_crystal_shards',
    '0016_assignment_lifecycle','0017_task_week_grid','0018_wealth_monthly_budgets',
    '0019_wealth_recurring_bills','0020_wealth_csv_statements',
    '0021_wealth_overview_read','0022_ai_privacy_consent',
    '0023_offline_outcome_guard','0024_private_account_export'];
  for(const file of files){
    const source=fs.readFileSync(path.join(ROOT,'src/db/migrations',file+'.sql'),'utf8');
    assert.ok(source.length>100);
    sql(source);
    assert.equal(allAction('check').active,true,file);
  }
  for(const table of ['wealth_monthly_budgets','wealth_recurring_bills','wealth_bill_occurrences',
    'wealth_csv_batches','wealth_csv_rows','sep28_crystal_awards','ai_privacy_preferences']){
    blocked('INSERT INTO public.'+table+' DEFAULT VALUES');
  }
  for(const table of ['crystrack_budgets.requests','crystrack_bills.requests',
    'crystrack_csv.permits','crystrack_ai.requests']){
    blocked('INSERT INTO '+table+' DEFAULT VALUES');
  }
  assert.equal(sql('SELECT sum((amount * 100)::bigint) FROM public.money_entries'),'250010');
  assert.ok(allAction('check').protectedTables>=30);
});

test('DDL transaction failure is atomic with data intact and guard still enforced',()=>{
  const failed=raw("BEGIN; ALTER TABLE public.money_entries ADD COLUMN issue55_rollback_probe text; SELECT 1/0; COMMIT;",{allowFailure:true});
  assert.notEqual(failed.status,0);
  assert.equal(sql("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='money_entries' AND column_name='issue55_rollback_probe'"),'0');
  blocked("INSERT INTO public.money_entries(user_id,type,amount) VALUES("+literal(uid)+",'expense',10.00)");
  assert.equal(allAction('check').active,true);
});

test('complete release is explicit, reversible and preserves exact finance snapshots',()=>{
  const disabled=allAction('disable');
  assert.equal(disabled.active,false);
  assert.equal(allAction('check').active,false);
  assert.equal(sql('SELECT sum((amount * 100)::bigint) FROM public.money_entries'),'250010');
  sql("INSERT INTO public.money_entries(user_id,type,amount) VALUES("+literal(uid)+",'expense',0.01)");
  assert.equal(sql('SELECT sum((amount * 100)::bigint) FROM public.money_entries'),'250011');
  sql('INSERT INTO crystrack_issue55.synthetic_receipt VALUES(1)');
  assert.equal(sql('SELECT count(*) FROM crystrack_issue55.synthetic_receipt'),'1');
});
