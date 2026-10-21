import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseAllAction, CONFIRM_ALL, REHEARSAL_ENV} from '../scripts/all-write-barrier.mjs';

test('all-domain rehearsal cannot run without fixed synthetic-only action and confirmation',()=>{
  for(const args of [[], ['enable'], ['enable','--yes'],['enable',CONFIRM_ALL,'--database=x'],['enable',CONFIRM_ALL,'--host=production'],['reset',CONFIRM_ALL],['enable','--database=postgres']]){
    assert.throws(()=>parseAllAction(args));
  }
  for(const action of ['prepare','preflight','enable','check','disable','abort','destroy']){
    assert.equal(parseAllAction([action,CONFIRM_ALL]),action);
  }
  assert.equal(REHEARSAL_ENV,'ISSUE55-SYNTHETIC-ONLY');
});

test('finance/task complete barrier is not a migration or part of normal app startup',()=>{
  for(const file of ['package.json','src/proxy.ts','scripts/local-supabase.mjs',...['0013_daily_records','0015_sep28_crystal_shards','0018_wealth_monthly_budgets','0019_wealth_recurring_bills','0020_wealth_csv_statements','0024_private_account_export'].map(x=>'src/db/migrations/'+x+'.sql')]){
    assert.doesNotMatch(fs.readFileSync(file,'utf8'),/all-write-barrier|crys_complete_stop|crystrack_release_complete/);
  }
  const sql=fs.readFileSync('release/all-write-barrier/install.sql','utf8');
  const driver=fs.readFileSync('scripts/all-write-barrier.mjs','utf8');
  assert.match(sql,/BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE/);
  assert.match(sql,/ENABLE ALWAYS TRIGGER crys_complete_stop/);
  assert.match(sql,/ERRCODE='PT503'/);
  assert.match(sql,/REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crystrack_release_complete/);
  assert.match(sql,/n\.nspname='public'/);
  assert.match(sql,/n\.nspname LIKE 'crystrack_%'/);
  assert.doesNotMatch(sql,/auth\.uid\(\)|current_setting\(|RETURN NULL/);
  assert.match(driver,/from '.\/task-release-barrier\.mjs'/);
  assert.match(driver,/CRYSTRACK_RELEASE_REHEARSAL/);
  assert.doesNotMatch(driver,/DATABASE_URL|SUPABASE_ACCESS_TOKEN|--url/);
});
