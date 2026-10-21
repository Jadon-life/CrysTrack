/** Issue #43 P2: real disconnected/reconnected Chromium, guarded synthetic local Auth/DB only. */
import assert from 'node:assert/strict';import fs from 'node:fs';import{randomUUID}from'node:crypto';
import{spawn}from'node:child_process';import{once}from'node:events';import net from'node:net';
import{createClient}from'@supabase/supabase-js';import{chromium}from'playwright';
import{localSql,readLocalKeys,ROOT}from'./local-supabase.mjs';import{localEnvironment}from'./local-supabase-policy.mjs';
const keys=readLocalKeys(),q=s=>"'"+String(s).replaceAll("'","''")+"'";
const blank=Object.fromEntries(fs.readFileSync(ROOT+'/.env.example','utf8').split('\n').filter(l=>/^[A-Z][A-Z0-9_]*=/.test(l)).map(l=>[l.split('=')[0],'']));
const env={...localEnvironment(process.env),...blank,...keys,VERCEL_ENV:'production',NEXT_TELEMETRY_DISABLED:'1'};
const admin=createClient(keys.NEXT_PUBLIC_SUPABASE_URL,keys.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const output=ROOT+'/.preview-test/offline-queue';fs.mkdirSync(output,{recursive:true});
const evidence={widths:[375,430,768,1280,1440],checks:[],themes:[],externalRequestsBlocked:0,browserErrors:[],offlineUiImplemented:true,disconnectedWorkflowsTested:true,offlineReloadSupported:false,accessibility:[]};
let server,browser,uid;const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos'}).format(new Date());
const previous=new Date(day+'T12:00:00Z');previous.setUTCDate(previous.getUTCDate()-1);
const clock=t=>localSql(`CREATE OR REPLACE FUNCTION crystrack_daily.clock()RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path=''AS $$SELECT ${q(t)}::timestamptz$$`);
const email=`offline-queue-${randomUUID()}@example.invalid`,password=randomUUID()+'aA1!';
try{
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Synthetic Offline Explorer'}});assert.equal(created.error,null);uid=created.data.user.id;
 localSql(`INSERT INTO profiles(user_id,timezone,display_name)VALUES('${uid}','Africa/Lagos','Synthetic Offline Explorer')`);
 const owner=sql=>localSql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${uid}","role":"authenticated"}';${sql};COMMIT;`);
 const json=sql=>JSON.parse(owner('SELECT '+sql).split('\n').at(-1));
 clock(previous.toISOString());json('daily_context()');json('sep28_crystal_state()');
 const tasks=[...evidence.widths.map((width,i)=>({id:randomUUID(),title:`Synthetic offline routine ${i+1}`,width})),...['race','uncertain','archive','delete','stale','rollover','logout','zone','online archived'].map(label=>({id:randomUUID(),title:'Synthetic '+label,width:1440}))];
 for(const t of tasks)owner(`INSERT INTO recurring_tasks(id,user_id,title)VALUES('${t.id}','${uid}',${q(t.title)});INSERT INTO task_schedules(task_id,weekday)SELECT '${t.id}',generate_series(0,6)`);
 clock(day+'T12:00:00Z');const ctx=json('daily_context()');
 const h=JSON.parse(localSql(`SELECT to_jsonb(h)FROM daily_records h WHERE user_id='${uid}'AND day_key='${day}'`).split('\n').at(-1));
 const intents=tasks.map(t=>{
  const x=JSON.parse(owner(`SELECT to_jsonb(x)FROM daily_routine_records x WHERE user_id='${uid}'AND day_key='${day}'AND routine_key='${t.id}'`).split('\n').at(-1));
  const version=owner(`SELECT id FROM routine_schedule_versions WHERE user_id='${uid}'AND routine_key='${t.id}'ORDER BY version DESC LIMIT 1`).split('\n').at(-1);
  return{mode:'offline-v1',requestId:randomUUID(),day,timezone:ctx.timezone,contextRevision:ctx.revision,snapshotId:h.id,snapshotVersion:x.schedule_version_id,definitionVersion:version,routineId:t.id,expectedRevision:1,desiredStatus:'completed'};
 });
 const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));const origin=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:ROOT,env,stdio:'ignore'});
 let ready=false;for(let i=0;i<120;i++){try{await fetch(origin+'/auth');ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}assert.ok(ready);
 browser=await chromium.launch({headless:true,...(process.env.CRYSTRACK_CHROMIUM_PATH?{executablePath:process.env.CRYSTRACK_CHROMIUM_PATH}:{}),args:['--no-sandbox'],env:localEnvironment(process.env)});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',timezoneId:'America/New_York'});
 await context.route('**/*',async route=>{if(!route.request().url().startsWith(origin)&&!route.request().url().startsWith(keys.NEXT_PUBLIC_SUPABASE_URL)){evidence.externalRequestsBlocked++;return route.abort();}return route.continue();});
 context.setDefaultTimeout(30000);const page=await context.newPage();let acceptDialogs=true;page.on('dialog',d=>acceptDialogs?d.accept():d.dismiss());page.on('pageerror',error=>evidence.browserErrors.push(error.message));
 await page.goto(origin+'/auth');await page.locator('input[type=email]').fill(email);await page.locator('input[type=password]').fill(password);await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.waitForURL(origin+'/');
 await page.getByRole('button',{name:'Complete '+tasks[0].title,exact:true}).waitFor();
 const post=(op,intent,headers={})=>page.request.post(origin+'/api/tasks/offline/'+op,{data:intent,headers});
 const controls=page.getByRole('region',{name:'Offline Today controls'});
 const readDevice=p=>p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('crystrack-offline-today-v1',1);r.onsuccess=()=>{const db=r.result;const t=db.transaction('device','readonly');const x=t.objectStore('device').get('queue');x.onsuccess=()=>{resolve(x.result);db.close();};};r.onerror=reject;}));
 const waitItems=async(p,n)=>{await p.waitForFunction(n=>new Promise(resolve=>{const r=indexedDB.open('crystrack-offline-today-v1',1);r.onsuccess=()=>{const db=r.result;const x=db.transaction('device','readonly').objectStore('device').get('queue');x.onsuccess=()=>{resolve(x.result?.items.length===n);db.close();};};}),n);if(n===0)await p.waitForFunction(()=>document.querySelector('[aria-label="Offline Today controls"] button')?.disabled===false);};
 const apiSource=await page.request.get(origin+'/api/tasks/offline/source');assert.equal(apiSource.status(),200);assert.match(apiSource.headers()['cache-control'],/private, no-store/);const verified=await apiSource.json();assert.equal(verified.snapshotId,h.id);assert.equal(verified.routines[0].definitionVersion.length,36);assert.equal(verified.context.timezone,'Africa/Lagos');
 const enable=async()=>{const button=controls.getByRole('button',{name:'Enable offline edits on this device'});if(!await button.isVisible())await controls.getByText('Optional offline routine edits',{exact:true}).click();await button.click();await controls.getByRole('button',{name:'Sync now',exact:true}).waitFor();};
 await controls.getByText('Online · 0 pending',{exact:true}).waitFor();
 await page.route('**/api/tasks/offline/source',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"Synthetic unavailable source"}'}));await page.evaluate(()=>window.dispatchEvent(new Event('online')));await controls.getByText('Today unavailable · 0 pending',{exact:true}).waitFor();await page.unroute('**/api/tasks/offline/source');await page.evaluate(()=>window.dispatchEvent(new Event('online')));await controls.getByText('Online · 0 pending',{exact:true}).waitFor();evidence.serviceUnavailableDistinctFromOffline=true;
 await enable();
 const total=()=>json('sep28_crystal_state()').total;
 const sourceStatus=t=>owner(`SELECT status FROM daily_routine_records WHERE user_id='${uid}'AND day_key='${day}'AND routine_key='${t.id}'`).split('\n').at(-1);
 const clickComplete=(p,t)=>p.getByRole('button',{name:'Complete '+t.title,exact:true}).click();
 const sync=async(p=page)=>{await p.getByRole('button',{name:'Sync now',exact:true}).click();await waitItems(p,0);};
 const axe=async(p,width,theme)=>{await p.addScriptTag({path:ROOT+'/node_modules/axe-core/axe.min.js'});const result=await p.evaluate(async()=>{const r=await window.axe.run(document.querySelector('[aria-label="Offline Today controls"]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return r.violations.map(x=>({id:x.id,impact:x.impact,nodes:x.nodes.map(n=>n.target)}));});evidence.accessibility.push({width,theme,violations:result});assert.deepEqual(result,[]);};
 for(let i=0;i<evidence.widths.length;i++){
  const t=tasks[i];await page.setViewportSize({width:t.width,height:1000});
  const before=total();await context.setOffline(true);
  await clickComplete(page,t);await waitItems(page,1);const first=(await readDevice(page)).items[0];
  assert.equal(first.intent.desiredStatus,'completed');assert.equal(first.phase,'queued');assert.equal(sourceStatus(t),'pending');assert.equal(total(),before);
  // The canonical checkbox stays unpressed while the local marker is explicit.
  assert.equal(await page.getByRole('button',{name:'Complete '+t.title,exact:true}).getAttribute('aria-pressed'),'false');
  await page.getByRole('button',{name:'Skip '+t.title+' today',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Offline Today controls"]').textContent.includes(': skipped'));
  assert.equal((await readDevice(page)).items[0].intent.requestId,first.intent.requestId);
  await controls.getByText('Change queued action',{exact:true}).click();await controls.getByLabel('Queued action for '+t.title,{exact:true}).selectOption('completed');await page.waitForFunction(()=>document.querySelector('[aria-label="Offline Today controls"]').textContent.includes(': completed'));assert.equal((await readDevice(page)).items[0].intent.requestId,first.intent.requestId);await controls.getByText('Change queued action',{exact:true}).click();
  await controls.getByRole('button',{name:'Undo locally '+t.title,exact:true}).click();await waitItems(page,0);
  await clickComplete(page,t);await waitItems(page,1);
  for(const light of[false,true]){
   const sw=page.getByRole('switch',{name:/appearance active/});if(((await sw.getAttribute('aria-label'))==='Light appearance active')!==light){await sw.focus();await page.keyboard.press('Space');}
   await page.getByRole('switch',{name:light?'Light appearance active':'Dark appearance active',exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await axe(page,t.width,light?'light':'dark');await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
   await page.screenshot({path:`${output}/offline-pending-${t.width}-${light?'light':'dark'}.jpg`,type:'jpeg',quality:76,fullPage:true});
  }
  await context.setOffline(false);await waitItems(page,0);await page.getByRole('button',{name:'Mark '+t.title+' incomplete',exact:true}).waitFor();
  assert.equal(sourceStatus(t),'completed');assert.equal(total(),String((i+1)*5));
  const receipts=owner(`SELECT count(*) FROM daily_mutation_requests WHERE user_id='${uid}'AND payload->>'routineId'='${t.id}'`).split('\n').at(-1);assert.equal(receipts,'1');
  evidence.checks.push({width:t.width,offlineCompleteSkipUndo:true,stableCoalescing:true,canonicalUnchangedWhileQueued:true,oneReceipt:true,serverShards:total()});
 }
 // Undo of a previously verified completion remains local until acknowledged, with server-only reward reversal.
 await context.setOffline(true);await page.getByRole('button',{name:'Mark '+tasks[0].title+' incomplete',exact:true}).click();await waitItems(page,1);assert.equal(sourceStatus(tasks[0]),'completed');assert.equal(total(),'25');await context.setOffline(false);await waitItems(page,0);assert.equal(sourceStatus(tasks[0]),'pending');assert.equal(total(),'20');await page.getByRole('button',{name:'Complete '+tasks[0].title,exact:true}).waitFor();await context.setOffline(true);await clickComplete(page,tasks[0]);await waitItems(page,1);await context.setOffline(false);await waitItems(page,0);assert.equal(total(),'25');evidence.verifiedUndoRemainsServerAuthoritative=true;await page.screenshot({path:output+'/confirmed-1440.jpg',type:'jpeg',quality:76,fullPage:true});
 // Two tabs coalesce under one Web Lock/IDB envelope; simultaneous reconnects cannot duplicate delivery.
 const second=await context.newPage();await second.goto(origin+'/');await second.getByRole('button',{name:'Complete '+tasks[5].title,exact:true}).waitFor();await second.getByRole('button',{name:'Clear offline data',exact:true}).waitFor();
 await context.setOffline(true);await clickComplete(page,tasks[5]);await waitItems(second,1);
 const raceId=(await readDevice(page)).items[0].intent.requestId;
 await second.getByRole('button',{name:'Skip '+tasks[5].title+' today',exact:true}).click();await second.waitForFunction(()=>document.querySelector('[aria-label="Offline Today controls"]').textContent.includes(': skipped'));
 await clickComplete(second,tasks[5]);await page.waitForFunction(()=>document.querySelector('[aria-label="Offline Today controls"]').textContent.includes(': completed'));
 assert.equal((await readDevice(page)).items[0].intent.requestId,raceId);
 await context.setOffline(false);await waitItems(page,0);assert.equal(sourceStatus(tasks[5]),'completed');assert.equal(total(),'30');
 assert.equal(owner(`SELECT count(*) FROM daily_mutation_requests WHERE user_id='${uid}'AND request_id='${raceId}'`).split('\n').at(-1),'1');await second.close();evidence.multipleTabs=true;console.log('PASS five-width offline actions, verified undo, and multi-tab coalescing');
 // Real committed write with response deliberately lost. Reload ONLINE rehydrates only after verified Auth/source.
 let lost=false;await page.route('**/api/tasks/offline/replay',async route=>{if(!lost){lost=true;const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed');}else await route.continue();});
 await context.setOffline(true);await clickComplete(page,tasks[6]);await waitItems(page,1);const uncertainId=(await readDevice(page)).items[0].intent.requestId;
 await context.setOffline(false);await controls.getByText(/Connection uncertain/).waitFor();assert.equal((await readDevice(page)).items[0].phase,'attempted');assert.equal(sourceStatus(tasks[6]),'completed');assert.equal(total(),'35');
 await page.unroute('**/api/tasks/offline/replay');await page.reload();await page.getByRole('button',{name:'Sync now',exact:true}).waitFor();assert.equal((await readDevice(page)).items[0].intent.requestId,uncertainId);await sync();assert.equal(total(),'35');
 assert.equal(owner(`SELECT count(*) FROM daily_mutation_requests WHERE user_id='${uid}'AND request_id='${uncertainId}'`).split('\n').at(-1),'1');evidence.lostAcknowledgmentOnlineReloadReceiptResolved=true;console.log('PASS lost acknowledgment and online reload receipt resolution');
 // A committed request whose response stalls must release the lock at the transport deadline.
 await page.route('**/api/tasks/offline/replay',async route=>{const response=await route.fetch();assert.equal(response.status(),200);await new Promise(resolve=>setTimeout(resolve,17000));await route.abort('failed').catch(()=>{});});
 await page.getByRole('button',{name:'Mark '+tasks[0].title+' incomplete',exact:true}).waitFor();await context.setOffline(true);await page.getByRole('button',{name:'Mark '+tasks[0].title+' incomplete',exact:true}).click();await waitItems(page,1);const deadlineId=(await readDevice(page)).items[0].intent.requestId;
 await context.setOffline(false);await controls.getByText(/Connection uncertain/).waitFor();assert.equal((await readDevice(page)).items[0].phase,'attempted');assert.equal(sourceStatus(tasks[0]),'pending');assert.equal(total(),'30');await page.unroute('**/api/tasks/offline/replay');await sync();assert.equal(total(),'30');assert.equal(owner(`SELECT count(*) FROM daily_mutation_requests WHERE user_id='${uid}'AND request_id='${deadlineId}'`).split('\n').at(-1),'1');
 await page.getByRole('button',{name:'Complete '+tasks[0].title,exact:true}).waitFor();await clickComplete(page,tasks[0]);await page.getByRole('button',{name:'Mark '+tasks[0].title+' incomplete',exact:true}).waitFor();assert.equal(total(),'35');await page.waitForFunction(()=>document.querySelector('[aria-label="Offline Today controls"] button')?.disabled===false);evidence.stalledCommittedResponseDeadlineReceiptResolved=true;
 // Archive, delete and stale revision during offline interval all require manual review, never rebase.
 for(const [index,change]of[[7,'archive'],[8,'delete'],[9,'stale']]){
   const t=tasks[index];await page.getByRole('button',{name:'Complete '+t.title,exact:true}).waitFor();await context.setOffline(true);await clickComplete(page,t);await waitItems(page,1);
   if(change==='archive')json(`daily_retire_routine('${t.id}')`);
   if(change==='delete')owner(`DELETE FROM recurring_tasks WHERE id='${t.id}'`);
   if(change==='stale')json(`daily_set_outcome('${day}','${t.id}','skipped',1,'${randomUUID()}')`);
   await context.setOffline(false);await controls.getByText('Conflict · 1 pending — not yet verified',{exact:true}).waitFor();
   assert.equal((await readDevice(page)).items[0].phase,'conflict');assert.equal(total(),'35');if(change==='archive')await page.screenshot({path:output+'/manual-review-1440.jpg',type:'jpeg',quality:76,fullPage:true});
   await controls.getByRole('button',{name:'Discard '+t.title,exact:true}).click();await waitItems(page,0);evidence.checks.push({change,manualReview:true,noRewards:true});
 }
 // A saved scheduling change invalidates context revision immediately, without rebasing old intents.
 await context.setOffline(true);await clickComplete(page,tasks[12]);await waitItems(page,1);json(`daily_request_timezone('UTC',1)`);await context.setOffline(false);await controls.getByText('Conflict · 1 pending — not yet verified',{exact:true}).waitFor();assert.equal(total(),'35');await controls.getByRole('button',{name:'Clear offline data',exact:true}).click();await enable();evidence.timezoneRevisionConflict=true;
 // Clearing requires explicit warning and fences another tab immediately.
 await context.setOffline(true);await clickComplete(page,tasks[11]);await waitItems(page,1);await controls.getByRole('button',{name:'Clear offline data',exact:true}).click();await controls.getByRole('button',{name:'Sync now',exact:true}).waitFor({state:'hidden'});assert.equal(sourceStatus(tasks[11]),'pending');evidence.clearUnsyncedWarning=true;
 await context.setOffline(false);
 // Quota/unavailable device storage never falls through to an online write from an opted-in queue.
 await enable();
 await page.evaluate(()=>{window.__put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('Synthetic quota','QuotaExceededError');};});
 await context.setOffline(true);await clickComplete(page,tasks[11]);await controls.getByText(/Device storage could not be updated/).waitFor();assert.equal(sourceStatus(tasks[11]),'pending');await page.evaluate(()=>{IDBObjectStore.prototype.put=window.__put;});
 await controls.getByRole('button',{name:'Clear offline data',exact:true}).click();await context.setOffline(false);evidence.storageFailureFailClosed=true;
 // Sign-out cancellation preserves pending data; acceptance clears it across an already-loaded second tab.
 await enable();const signoutTab=await context.newPage();await signoutTab.goto(origin+'/');await signoutTab.getByRole('button',{name:'Clear offline data',exact:true}).waitFor();
 await context.setOffline(true);await clickComplete(page,tasks[11]);await waitItems(page,1);
 await context.route('**/api/tasks/offline/source',r=>r.abort());await context.setOffline(false);
 await page.getByRole('button',{name:'Open profile menu',exact:true}).click();acceptDialogs=false;await page.getByRole('button',{name:'Sign out',exact:true}).click();assert.equal((await readDevice(page)).items.length,1);acceptDialogs=true;
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL(origin+'/auth');await signoutTab.waitForURL(origin+'/auth');assert.equal(await readDevice(page),undefined);assert.equal(sourceStatus(tasks[11]),'pending');await signoutTab.close();await context.unroute('**/api/tasks/offline/source');
 await page.locator('input[type=email]').fill(email);await page.locator('input[type=password]').fill(password);await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.waitForURL(origin+'/');await page.getByRole('button',{name:'Complete '+tasks[10].title,exact:true}).waitFor();await enable();evidence.signoutCancelAcceptAndCrossTabPurge=true;
 // A different owner cannot see the old queue or identifiers; anonymous source is denied.
 await context.clearCookies();const other=await admin.auth.admin.createUser({email:`other-offline-${randomUUID()}@example.invalid`,password,email_confirm:true});assert.equal(other.error,null);
 clock(previous.toISOString());localSql(`INSERT INTO profiles(user_id,timezone)VALUES('${other.data.user.id}','Africa/Lagos')`);localSql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${other.data.user.id}","role":"authenticated"}';SELECT daily_context();COMMIT;`);const otherRoutine=randomUUID();localSql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${other.data.user.id}","role":"authenticated"}';INSERT INTO recurring_tasks(id,user_id,title)VALUES('${otherRoutine}','${other.data.user.id}','Synthetic other owner routine');INSERT INTO task_schedules(task_id,weekday)SELECT '${otherRoutine}',generate_series(0,6);COMMIT;`);clock(day+'T12:00:00Z');
 await page.goto(origin+'/auth');await page.locator('input[type=email]').fill(other.data.user.email);await page.locator('input[type=password]').fill(password);await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.waitForURL(origin+'/');
 assert.equal(await page.getByText(tasks[11].title,{exact:true}).count(),0);const foreign=await page.request.get(origin+'/api/tasks/offline/source');assert.equal(foreign.status(),200);assert.equal((await foreign.json()).owner,other.data.user.id);
 // Queue B's own routine, revoke cookies, and prove no replay can be sent under a cached identity.
 await page.getByRole('button',{name:'Complete Synthetic other owner routine',exact:true}).waitFor();await enable();await context.setOffline(true);await page.getByRole('button',{name:'Complete Synthetic other owner routine',exact:true}).click();await waitItems(page,1);
 await context.clearCookies();await context.setOffline(false);await controls.getByText(/Sign in again/).waitFor();assert.equal((await page.request.get(origin+'/api/tasks/offline/source')).status(),401);
 assert.equal(localSql(`SELECT status FROM daily_routine_records WHERE user_id='${other.data.user.id}'AND routine_key='${otherRoutine}'AND day_key='${day}'`).split('\n').at(-1),'pending');
 assert.equal(localSql(`SELECT count(*) FROM daily_mutation_requests WHERE user_id='${other.data.user.id}'`).split('\n').at(-1),'0');
 await controls.getByRole('button',{name:'Clear offline data',exact:true}).waitFor();await page.screenshot({path:output+'/verification-required-1440.jpg',type:'jpeg',quality:76,fullPage:true});await page.getByRole('button',{name:'Open profile menu',exact:true}).click();acceptDialogs=false;await page.getByRole('button',{name:'Sign out',exact:true}).click();acceptDialogs=true;assert.equal((await readDevice(page)).items.length,1);evidence.revokedAuthRetainsUnsyncedWarning=true;evidence.revokedAuthNoReplay=true;evidence.anonymous401=true;
 // An ONLINE boot under a different owner clears even retained B data before labels can display.
 await page.goto(origin+'/auth');await page.locator('input[type=email]').fill(email);await page.locator('input[type=password]').fill(password);await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.waitForURL(origin+'/');await page.getByRole('button',{name:'Complete '+tasks[10].title,exact:true}).waitFor();
 await page.waitForFunction(()=>localStorage.getItem('crystrack-offline-enabled-v1')===null);assert.equal(await readDevice(page),undefined);assert.equal(await page.getByText('Synthetic other owner routine',{exact:true}).count(),0);evidence.ownerIsolation=true;await page.screenshot({path:output+'/owner-switch-cleared-1440.jpg',type:'jpeg',quality:76,fullPage:true});
 await enable();
 // Opt-in must not redirect a legitimate ONLINE frozen-Today completion into offline replay.
 json(`daily_retire_routine('${tasks[13].id}')`);await clickComplete(page,tasks[13]);await page.getByRole('button',{name:'Mark '+tasks[13].title+' incomplete',exact:true}).waitFor();assert.equal(sourceStatus(tasks[13]),'completed');assert.equal(total(),'40');assert.equal(owner(`SELECT count(*) FROM daily_mutation_requests WHERE user_id='${uid}'AND payload->>'routine'='${tasks[13].id}'AND NOT(payload ? 'mode')`).split('\n').at(-1),'1');evidence.onlineFrozenTodayPreserved=true;
 await page.getByRole('button',{name:'Sync now',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('[aria-label="Offline Today controls"] button')?.disabled===false);
 // Day rollover after staging cannot replay yesterday, even if the loaded UI still displays it.
 await context.setOffline(true);await clickComplete(page,tasks[10]);await waitItems(page,1);
 const tomorrow=new Date(day+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);clock(tomorrow.toISOString());await context.setOffline(false);await controls.getByText('Conflict · 1 pending — not yet verified',{exact:true}).waitFor();assert.notEqual(sourceStatus(tasks[10]),'completed');assert.equal(total(),'40');
 await controls.getByRole('button',{name:'Clear offline data',exact:true}).click();evidence.dayRolloverNoReplay=true;
 // No offline reload guarantee: verify the browser cannot boot this private document disconnected.
 await context.setOffline(true);const probe=await context.newPage();let reloadBlocked=false;try{await probe.goto(origin+'/',{timeout:10000});}catch{reloadBlocked=true;}assert.equal(reloadBlocked,true);await probe.close();await context.setOffline(false);evidence.disconnectedPrivateBootBlocked=true;
 // Missing lock support fails closed before storage or writers can be enabled.
 await page.evaluate(()=>Object.defineProperty(navigator,'locks',{value:undefined,configurable:true}));if(!await controls.getByRole('button',{name:'Enable offline edits on this device'}).isVisible())await controls.getByText('Optional offline routine edits',{exact:true}).click();await controls.getByRole('button',{name:'Enable offline edits on this device'}).click();assert.equal(await page.getByRole('button',{name:'Sync now',exact:true}).count(),0);await controls.getByText('Offline edits are unavailable in this browser. Stay online to save.',{exact:true}).waitFor();evidence.unsupportedBrowserFailClosed=true;
 assert.deepEqual(evidence.browserErrors,[]);fs.writeFileSync(output+'/result.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{
 if(browser)await browser.close();if(server&&server.exitCode===null){const done=once(server,'exit');server.kill('SIGTERM');const force=setTimeout(()=>server.kill('SIGKILL'),5000);await done;clearTimeout(force);}
 localSql("CREATE OR REPLACE FUNCTION crystrack_daily.clock()RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path=''AS $$SELECT clock_timestamp()$$");
}
