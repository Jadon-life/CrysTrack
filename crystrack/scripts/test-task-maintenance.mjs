/** Tests an ALREADY BUILT ordinary artifact on loopback; no deployment or setting edits. */
import fs from 'node:fs';import {spawn} from 'node:child_process';import {once} from 'node:events';import net from 'node:net';import assert from 'node:assert/strict';
import {ROOT,readLocalKeys} from './local-supabase.mjs';import {localEnvironment} from './local-supabase-policy.mjs';
if(process.argv.slice(2).join(' ')!=='--synthetic-local-only=ISSUE19-NO-HOSTED')throw Error('Explicit local-only confirmation required');
assert.equal(JSON.parse(fs.readFileSync(ROOT+'/.next/required-server-files.json')).config.env.NEXT_PUBLIC_CRYSTRACK_RUNTIME,'normal');
const sock=net.createServer();sock.listen(0,'127.0.0.1');await once(sock,'listening');const port=sock.address().port;await new Promise(r=>sock.close(r));
const blank=Object.fromEntries(fs.readFileSync(ROOT+'/.env.example','utf8').split('\n').filter(l=>/^[A-Z][A-Z0-9_]*=/.test(l)).map(l=>[l.split('=')[0],'']));
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:ROOT,env:{...localEnvironment(process.env),...blank,...readLocalKeys(),VERCEL_ENV:'production',CRYSTRACK_TASK_WRITE_MAINTENANCE:'on',NEXT_TELEMETRY_DISABLED:'1'},stdio:'ignore'});
try{
 const origin=`http://127.0.0.1:${port}`;let ready=false;
 for(let i=0;i<150;i++){try{await fetch(origin+'/auth');ready=true;break;}catch{await new Promise(r=>setTimeout(r,200));}}
 assert.ok(ready,'Ordinary local server did not start');let assertions=0;
 for(const path of ['/api/tasks','/api/tasks/week','/api/tasks/offline/replay','/api/tasks/offline/receipt','/api/tasks/id','/api/tasks/id/archive','/api/tasks/id/occurrences/day/toggle','/api/tasks/id/occurrences/day/skip','/api/daily-records','/api/daily-records/context','/api/daily-records/timezone','/api/daily-notes/day','/api/reminders/dispatch'])for(const method of ['GET','POST','PUT','PATCH','DELETE']){
  const response=await fetch(origin+path,{method,signal:AbortSignal.timeout(3000),headers:{authorization:'Bearer synthetic-not-a-live-cron-secret'},...(!['GET','HEAD'].includes(method)?{body:'{}'}:{})});
  assert.equal(response.status,503,method+' '+path);assert.equal(response.headers.get('Retry-After'),'60');assert.match(response.headers.get('Cache-Control'),/no-store/);assertions++;
 }
 assert.equal((await fetch(origin+'/auth')).status,200);
 console.log(`PASS: ${assertions} task/daily/cron method probes denied with 503 before auth; ordinary auth page remains accessible.`);
}finally{if(child.exitCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}}
