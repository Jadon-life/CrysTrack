/** Issue #55 — opt-in local PG15 candidate migration under full-data freeze. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { prepare, destroy, sql, raw, DATABASE } from '../scripts/task-release-barrier.mjs';

test('local synthetic full-data freeze stays active across all 0013-0024 DDL', () => {
 if (process.env.CRYSTRACK_RELEASE_REHEARSAL !== 'ISSUE19-SYNTHETIC-ONLY') {
  throw Error('Local explicit synthetic rehearsal confirmation required');
 }
 let owned = false;
 try {
  prepare(); owned = true;
  assert.equal(sql('SELECT current_database()'), DATABASE);
  assert.equal(sql('SELECT value FROM crystrack_sandbox_identity.marker'),'ISSUE19-SYNTHETIC-ONLY');
  const uid = randomUUID(), task = randomUUID(), entry = randomUUID();
  sql("INSERT INTO auth.users(id,email) VALUES('"+uid+"','issue55@example.invalid')");
  sql("INSERT INTO profiles(user_id,timezone) VALUES('"+uid+"','UTC')");
  sql("INSERT INTO recurring_tasks(id,user_id,title) VALUES('"+task+"','"+uid+"','Synthetic routine')");
  sql("INSERT INTO task_schedules(task_id,weekday) VALUES('"+task+"',1)");
  sql("INSERT INTO money_entries(id,user_id,type,amount,date) VALUES('"+entry+"','"+uid+"','expense',12.34,'2026-09-21T12:00:00Z')");
  const gate='release/all-domain-write-barrier/';
  const install=fs.readFileSync(gate+'install.sql','utf8');
  const enable=fs.readFileSync(gate+'enable.sql','utf8');
  const disable=fs.readFileSync(gate+'disable.sql','utf8');
  sql("BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='20s';\n"+install+"\n"+enable+"\nCOMMIT;");
  const verify=()=>assert.equal(sql('SELECT crystrack_full_release_gate.check_active()'),'t');
  const deny=(stmt)=>{
   const result=raw(stmt,{allowFailure:true});
   assert.notEqual(result.status,0,stmt);
   assert.match(result.stderr,/PT503/,stmt);
  };
  verify();
  deny('DELETE FROM public.money_entries WHERE false');
  deny('DELETE FROM public.recurring_tasks WHERE false');
  const files=[
   '0013_daily_records.sql','0014_daily_http_conflicts.sql',
   '0015_sep28_crystal_shards.sql','0016_assignment_lifecycle.sql',
   '0017_task_week_grid.sql','0018_wealth_monthly_budgets.sql',
   '0019_wealth_recurring_bills.sql','0020_wealth_csv_statements.sql',
   '0021_wealth_overview_read.sql','0022_ai_privacy_consent.sql',
   '0023_offline_outcome_guard.sql','0024_private_account_export.sql'
  ];
  for(const file of files){
   sql(fs.readFileSync('src/db/migrations/'+file,'utf8'));
   verify();
  }
  for(const name of ['money_entries','finance_targets','wealth_monthly_budgets',
    'wealth_recurring_bills','wealth_bill_occurrences','wealth_csv_batches',
    'wealth_csv_rows','sep28_crystal_awards','daily_records']){
   deny('DELETE FROM public.'+name+' WHERE false');
  }
  deny('INSERT INTO crystrack_budgets.requests DEFAULT VALUES');
  deny('INSERT INTO crystrack_bills.requests DEFAULT VALUES');
  deny('INSERT INTO crystrack_csv.permits DEFAULT VALUES');
  assert.equal(sql("SELECT amount::text FROM public.money_entries WHERE id='"+entry+"'"),'12.34');
  assert.equal(sql("SELECT count(*) FROM public.recurring_tasks WHERE id='"+task+"'"),'1');
  sql("BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='20s';\n"+disable+"\nCOMMIT;");
  assert.equal(sql('SELECT active FROM crystrack_full_release_gate.state'),'f');
  assert.equal(sql("SELECT count(*) FROM pg_trigger WHERE tgname='crys_release_full_stop'"),'0');
  assert.equal(sql("SELECT count(*) FROM pg_event_trigger WHERE evtname='crys_release_full_new_table'"),'0');
  assert.equal(sql("SELECT amount::text FROM public.money_entries WHERE id='"+entry+"'"),'12.34');
 } finally {
  if(owned) destroy();
 }
});
