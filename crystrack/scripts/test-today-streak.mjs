/** Normal-mode UI proof against synthetic local Supabase only. Never hosted services. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import {createClient} from '@supabase/supabase-js';
import {chromium} from 'playwright';
import {localSql, readLocalKeys, ROOT} from './local-supabase.mjs';
import {localEnvironment} from './local-supabase-policy.mjs';

const baseline=process.argv.includes('--baseline');
assert.ok(process.argv.slice(2).every(arg=>arg==='--baseline'));
const keys=readLocalKeys();
const blank=Object.fromEntries(fs.readFileSync(ROOT+'/.env.example','utf8').split('\n').filter(l=>/^[A-Z][A-Z0-9_]*=/.test(l)).map(l=>[l.split('=')[0],'']));
const env={...localEnvironment(process.env),...blank,...keys,VERCEL_ENV:'production',NEXT_TELEMETRY_DISABLED:'1'};
const admin=createClient(keys.NEXT_PUBLIC_SUPABASE_URL,keys.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const email=`today-${randomUUID()}@example.invalid`, password=randomUUID()+'aA1!';
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos'}).format(new Date());
const step=n=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const clock=d=>localSql(`CREATE OR REPLACE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT '${d}T12:00:00Z'::timestamptz $$`);
let server,browser;
let uid;
const evidence={day,timezone:'Africa/Lagos',from:step(-6),classification:['unknown','unknown (installation day)','incomplete','success','neutral','success','today'],checks:[],externalRequestsBlocked:0};
const output=ROOT+'/.preview-test/today-streak';fs.mkdirSync(output,{recursive:true});
try {
 const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Synthetic Explorer'}});
 assert.equal(error,null);uid=data.user.id;
 localSql(`INSERT INTO profiles(user_id,timezone,display_name) VALUES('${uid}','Africa/Lagos','Synthetic Explorer') ON CONFLICT(user_id) DO UPDATE SET timezone='Africa/Lagos';`);
 const owner=sql=>JSON.parse(localSql(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='{"sub":"${uid}","role":"authenticated"}'; SELECT ${sql}; COMMIT;`).split('\n').at(-1));
 clock(step(-5));owner('daily_context()');
 const id=randomUUID();const neutralWeekday=new Date(step(-2)+'T12:00Z').getUTCDay();
 localSql(`INSERT INTO recurring_tasks(id,user_id,title,preferred_time) VALUES('${id}','${uid}','Synthetic daily routine','10:00');
 INSERT INTO task_schedules(task_id,weekday) SELECT '${id}',day FROM generate_series(0,6) day WHERE day<>${neutralWeekday};`);
 for(const offset of [-4,-3,-2,-1]) {
  clock(step(offset));owner('daily_context()');
  if(offset!==-2 && offset!==-4) owner(`daily_set_outcome('${step(offset)}','${id}','completed',1,'${randomUUID()}')`);
 }
 clock(day);owner('daily_context()');
 const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const origin=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,['node_modules/next/dist/bin/next',baseline?'dev':'start','--hostname','127.0.0.1','--port',String(port)],{cwd:ROOT,env,stdio:['ignore','ignore','ignore']});
 let ready=false;
 for(let i=0;i<120;i++) {try {await fetch(origin+'/auth');ready=true;break;}catch {await new Promise(r=>setTimeout(r,500));}}
 assert.ok(ready,'Next server ready');
 browser=await chromium.launch({executablePath:process.env.CRYSTRACK_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-NG',reducedMotion:'reduce'});
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(['127.0.0.1','localhost'].includes(url.hostname))return route.continue();
  evidence.externalRequestsBlocked++;return route.abort();
 });
 const page=await context.newPage();
 const writes=[];
 page.on('request',request=>{if(request.method()!=='GET' && request.url().includes('/api/'))writes.push(new URL(request.url()).pathname);});
 await page.goto(origin+'/auth');
 await page.locator('input[type=email]').fill(email);await page.locator('input[type=password]').fill(password);
 await page.getByRole('button',{name:'Sign In',exact:true}).click();
 await page.waitForURL(origin+'/');
 await page.getByRole('button',{name:'Complete Synthetic daily routine',exact:true}).waitFor();
 await page.screenshot({path:output+(baseline?'/before.png':'/after-desktop.png'),fullPage:true});
 if(baseline){console.log('Baseline Today screenshot captured from unmodified dashboard.');}
 else {
  const card=page.getByTestId('today-streak');
  await card.getByText('2 days',{exact:true}).waitFor();
  const actual=await card.locator('li').evaluateAll(cells=>cells.map(cell=>cell.getAttribute('aria-label')));
  assert.equal(actual.length,7);assert.match(actual[0],/History not yet verified/);assert.match(actual[1],/History not yet verified/);
  assert.match(actual[2],/Incomplete day/);assert.match(actual[4],/Verified no tasks/);assert.match(actual[6],/Today in progress · 0 of 1 completed/);
  evidence.classification[1]='unknown (installation day incomplete evidence)'; evidence.labels=actual;
  evidence.checks.push('Authoritative seven-day strip; installation day unknown, verified neutral, closed streak 2, today pending');
  await page.getByRole('button',{name:'Complete Synthetic daily routine',exact:true}).click();
  await card.getByRole('listitem',{name:new RegExp(day+': Today in progress · 1 of 1 completed')}).waitFor();
  await card.getByText('2 days',{exact:true}).waitFor();
  evidence.checks.push('Complete today does not award closed day');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await card.getByRole('listitem',{name:new RegExp(day+': Today in progress · 0 of 1 completed')}).waitFor();
  await page.getByRole('button',{name:'Skip Synthetic daily routine today',exact:true}).click();
  await page.getByRole('button',{name:'Undo skip for Synthetic daily routine',exact:true}).waitFor();
  await card.getByText('2 days',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.getByRole('button',{name:'Complete Synthetic daily routine',exact:true}).waitFor();
  await card.getByText('2 days',{exact:true}).waitFor();
  evidence.checks.push('Skip and undo refresh; no closed streak changes');
  const api=await page.evaluate(async()=>{
   const c=await fetch('/api/daily-records/context',{cache:'no-store'});const context=await c.json();
   const tasks=await(await fetch('/api/tasks?date='+context.day)).json();
   const task=tasks.find(t=>t.title==='Synthetic daily routine');
   const body={desiredStatus:'completed',expectedRevision:task.daily_revision,requestId:crypto.randomUUID()};
   const options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
   const url=`/api/tasks/${task.id}/occurrences/${context.day}/toggle`;
   const a=await fetch(url,options),b=await fetch(url,options);
   const first=await a.json(),second=await b.json();
   window.dispatchEvent(new Event('crystrack-activity-updated'));
   return {first,second,a:a.status,b:b.status};
  });
  assert.equal(api.a,200);assert.equal(api.b,200);assert.deepEqual(api.first,api.second);
  await card.getByRole('listitem',{name:new RegExp(day+': Today in progress · 1 of 1 completed')}).waitFor();
  evidence.checks.push('Identical repeated desired-state request replays once, authoritative today refreshed');
  // Malformed/error responses must clear stale success. No fallback to legacy task streak.
  await page.route('**/api/daily-records?*',r=>r.fulfill({status:503,json:{error:'Synthetic missing RPC'}}));
  await card.getByRole('button',{name:'Refresh verified daily history'}).click();
  await card.getByText(/History not yet verified\. Try refreshing/).waitFor();
  assert.equal(await card.locator('li').count(),0);
  await page.unroute('**/api/daily-records?*');
  // Force an old read to finish after a fresh successful read.
  let releaseOld;
  let intercepted;
  const held=new Promise(resolve=>intercepted=resolve);
  await page.route('**/api/daily-records?*',async route=>{
   await page.unroute('**/api/daily-records?*');intercepted();
   await new Promise(resolve=>releaseOld=resolve);
   await route.fulfill({status:503,json:{error:'Obsolete response'}}).catch(()=>{});
  });
  await card.getByRole('button',{name:'Refresh verified daily history'}).click();await held;
  await card.getByRole('button',{name:'Refresh verified daily history'}).click();
  await card.getByText('2 days',{exact:true}).waitFor();releaseOld();
  await page.waitForTimeout(200);assert.equal(await card.getByText('2 days',{exact:true}).count(),1);
  evidence.checks.push('Missing RPC and absent snapshots gracefully unknown; stale racing read cannot overwrite latest success');
  const authoritativeContext=await (await page.request.get(origin+'/api/daily-records/context')).json();
  await page.route('**/api/daily-records?*',r=>r.fulfill({status:200,json:{context:authoritativeContext,snapshots:[]}}));
  await card.getByRole('button',{name:'Refresh verified daily history'}).click();
  await card.getByRole('listitem',{name:new RegExp(day+': Today in progress · history not yet verified')}).waitFor();
  assert.equal(await card.getByText('Not yet verified',{exact:true}).count(),2);
  await page.unroute('**/api/daily-records?*');
  await card.getByRole('button',{name:'Refresh verified daily history'}).focus();
  await page.keyboard.press('Enter');await card.getByText('2 days',{exact:true}).waitFor();
  // Refresh the existing checklist after the deliberately direct API replay probe.
  await page.reload();
  await page.getByRole('button',{name:'Mark Synthetic daily routine incomplete',exact:true}).waitFor();
  await card.getByText('2 days',{exact:true}).waitFor();
  for(const width of [375,430,768,1280,1440]) {
   await page.setViewportSize({width,height:1000});await card.scrollIntoViewIfNeeded();
   assert.ok(await card.evaluate(el=>el.scrollWidth<=el.clientWidth),'Card does not overflow at '+width);
   await card.locator('..').screenshot({path:`${output}/after-${width}.png`});
  }
  assert.ok(!writes.some(path=>/finance|wealth/.test(path)));
  evidence.checks.push('Keyboard refresh; seven accessible ISO/date-status labels; reduced motion; five widths; no finance mutation');
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:output+'/after-desktop.png',fullPage:true});
  // Saved-zone transition while returning to an open tab: re-read context, then refresh Today.
  clock(step(1));
  await page.clock.setSystemTime(new Date(step(1)+'T12:00:00Z'));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await card.getByRole('list',{name:new RegExp('Seven days ending '+step(1))}).waitFor();
  await card.getByText('3 days',{exact:true}).waitFor();
  evidence.boundaryDay=step(1);
  evidence.checks.push('Saved-zone next day on tab return refreshes authoritative strip and Today tasks; yesterday now counts');
  fs.writeFileSync(output+'/result.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence,null,2));
 }
} finally {
 if(browser)await browser.close();
 if(server&&server.exitCode===null){const done=once(server,'exit');server.kill('SIGTERM');await done;}
 localSql("CREATE OR REPLACE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT clock_timestamp() $$");
 if(uid)await admin.auth.admin.deleteUser(uid);
}
