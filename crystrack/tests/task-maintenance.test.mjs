import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {createRequire} from 'node:module';
import {parseAction,CONFIRM,localRestSource} from '../scripts/task-release-barrier.mjs';
const require=createRequire(import.meta.url),compiled={exports:{}};
new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/lib/task-maintenance.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(require,compiled,compiled.exports);
const {NextRequest}=require('next/server');
test('maintenance API gate is inert by default, fails closed on typos, and never touches finance/auth/theme',()=>{
 const old=process.env.CRYSTRACK_TASK_WRITE_MAINTENANCE;
 try{for(const flag of [undefined,'','off','on','typo']){
  if(flag===undefined)delete process.env.CRYSTRACK_TASK_WRITE_MAINTENANCE;else process.env.CRYSTRACK_TASK_WRITE_MAINTENANCE=flag;
  for(const method of ['GET','POST','PUT','PATCH','DELETE'])for(const path of ['/api/tasks','/api/tasks/week','/api/tasks/id/occurrences/day/toggle','/api/daily-records/context','/api/daily-notes/day','/api/reminders/dispatch']){
   const response=compiled.exports.taskMaintenance(new NextRequest('http://localhost'+path,{method}));
   if(flag&&flag!=='off'){assert.equal(response.status,503);assert.equal(response.headers.get('Retry-After'),'60');assert.match(response.headers.get('Cache-Control'),/no-store/);}else assert.equal(response,null);
  }
  for(const path of ['/api/finance','/api/wealth/debts','/api/auth/callback','/auth','/settings','/_next/static/x','/api/tasks-unrelated'])assert.equal(compiled.exports.taskMaintenance(new NextRequest('http://localhost'+path)),null);
 }}finally{if(old===undefined)delete process.env.CRYSTRACK_TASK_WRITE_MAINTENANCE;else process.env.CRYSTRACK_TASK_WRITE_MAINTENANCE=old;}
});
test('release CLI requires an unmistakable confirmation and rejects every target override',()=>{
 for(const args of [[],['enable'],['enable','--yes'],['enable',CONFIRM,'--url=x'],['reset',CONFIRM],['enable','--database=postgres'],['enable',CONFIRM,'--host=remote']])assert.throws(()=>parseAction(args));
 for(const mode of ['prepare','preflight','enable','check','disable','abort','destroy'])assert.equal(parseAction([mode,CONFIRM]),mode);
});
test('barrier remains separate from build/bootstrap/migrations; no identity or GUC bypass is present',()=>{
 for(const file of ['scripts/local-supabase.mjs','src/db/migrations/0013_daily_records.sql','src/db/migrations/0014_daily_http_conflicts.sql','package.json'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/crys_release_freeze|release\/task-write-barrier|task-release-barrier/);
 const source=fs.readFileSync('release/task-write-barrier/install.sql','utf8');
 const deny=source.match(/CREATE FUNCTION crystrack_release_gate.deny\(\)[\s\S]*?END \$\$;/)[0];
 assert.doesNotMatch(deny,/current_user|auth\.uid|current_setting|RETURN NULL/);
 assert.match(deny,/ERRCODE='PT503'/);assert.match(source,/ENABLE ALWAYS TRIGGER/);
 const proxy=fs.readFileSync('src/proxy.ts','utf8');assert.ok(proxy.indexOf('taskMaintenance(request)')<proxy.indexOf('updateSession(request)'));
});

test('local REST cloning refuses hosted credentials targets, wrong project/network and connection overrides',()=>{
 const valid={Name:'/supabase_rest_crystrack-local-free',Image:'sha256:synthetic',Config:{Labels:{'com.supabase.cli.project':'crystrack-local-free'},Env:['PGRST_DB_URI=postgres://authenticator:synthetic@supabase_db_crystrack-local-free:5432/postgres','PGRST_JWT_SECRET=synthetic-only']},NetworkSettings:{Networks:{'crystrack-local-free-network':{}}}};
 assert.equal(localRestSource(valid).uri.hostname,'supabase_db_crystrack-local-free');
 for(const alter of [i=>i.Name='/other',i=>i.Config.Labels={},i=>i.NetworkSettings.Networks={},i=>i.Image='mutable:tag',i=>i.Config.Env[0]='PGRST_DB_URI=postgres://authenticator:fake@hosted.invalid:5432/postgres',i=>i.Config.Env[0]+='?host=hosted.invalid',i=>i.Config.Env[0]=i.Config.Env[0].replace('/postgres','/different')]){const bad=structuredClone(valid);alter(bad);assert.throws(()=>localRestSource(bad));}
});
