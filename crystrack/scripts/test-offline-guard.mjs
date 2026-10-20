/** Issue #46 server-only prerequisite: real signed-in Chromium/HTTP, synthetic local DB only.
 * No browser disconnection, offline queue, cache, worker or offline UI is implemented/claimed. */
import assert from 'node:assert/strict';import fs from 'node:fs';import{randomUUID}from'node:crypto';
import{spawn}from'node:child_process';import{once}from'node:events';import net from'node:net';
import{createClient}from'@supabase/supabase-js';import{chromium}from'playwright';
import{localSql,readLocalKeys,ROOT}from'./local-supabase.mjs';import{localEnvironment}from'./local-supabase-policy.mjs';
const keys=readLocalKeys(),q=s=>"'"+String(s).replaceAll("'","''")+"'";
const blank=Object.fromEntries(fs.readFileSync(ROOT+'/.env.example','utf8').split('\n').filter(l=>/^[A-Z][A-Z0-9_]*=/.test(l)).map(l=>[l.split('=')[0],'']));
const env={...localEnvironment(process.env),...blank,...keys,VERCEL_ENV:'production',NEXT_TELEMETRY_DISABLED:'1'};
const admin=createClient(keys.NEXT_PUBLIC_SUPABASE_URL,keys.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const output=ROOT+'/.preview-test/offline-guard';fs.mkdirSync(output,{recursive:true});
const evidence={widths:[375,430,768,1280,1440],checks:[],themes:[],externalRequestsBlocked:0,browserErrors:[],offlineUiImplemented:false,disconnectedWorkflowsTested:false};
let server,browser,uid;const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos'}).format(new Date());
const previous=new Date(day+'T12:00:00Z');previous.setUTCDate(previous.getUTCDate()-1);
const clock=t=>localSql(`CREATE OR REPLACE FUNCTION crystrack_daily.clock()RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path=''AS $$SELECT ${q(t)}::timestamptz$$`);
const email=`offline-http-${randomUUID()}@example.invalid`,password=randomUUID()+'aA1!';
try{
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Synthetic Guard Explorer'}});assert.equal(created.error,null);uid=created.data.user.id;
 localSql(`INSERT INTO profiles(user_id,timezone,display_name)VALUES('${uid}','Africa/Lagos','Synthetic Guard Explorer')`);
 const owner=sql=>localSql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${uid}","role":"authenticated"}';${sql};COMMIT;`);
 const json=sql=>JSON.parse(owner('SELECT '+sql).split('\n').at(-1));
 clock(previous.toISOString());json('daily_context()');json('sep28_crystal_state()');
 const tasks=evidence.widths.map((width,i)=>({id:randomUUID(),title:`Synthetic server guard ${i+1}`,width}));
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
 const page=await context.newPage();page.on('pageerror',error=>evidence.browserErrors.push(error.message));
 await page.goto(origin+'/auth');await page.locator('input[type=email]').fill(email);await page.locator('input[type=password]').fill(password);await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.waitForURL(origin+'/');
 await page.getByRole('button',{name:'Complete '+tasks[0].title,exact:true}).waitFor();
 const post=(op,intent,headers={})=>page.request.post(origin+'/api/tasks/offline/'+op,{data:intent,headers});
 for(let i=0;i<tasks.length;i++){
  const t=tasks[i];await page.setViewportSize({width:t.width,height:1000});
  // Explicit acknowledged skip -> undo -> complete, each a NEW intent against
  // its known source revision; this is not an offline queue or conflict rebase.
  const skip={...intents[i],requestId:randomUUID(),desiredStatus:'skipped'};
  assert.equal((await post('replay',skip)).status(),200);
  const undo={...intents[i],requestId:randomUUID(),expectedRevision:2,desiredStatus:'pending'};
  assert.equal((await post('replay',undo)).status(),200);
  assert.equal(json('sep28_crystal_state()').total,String(i*5));
  const intent={...intents[i],expectedRevision:3};intents[i]=intent;
  // All five intents share the original snapshotId/context. Independent task writes
  // must NOT invalidate unrelated intents through a global mutable header revision.
  const saved=await post('replay',intent);assert.equal(saved.status(),200);const receipt=await saved.json();assert.equal(receipt.state,'confirmed');assert.equal(receipt.receipt.revision,4);assert.equal(receipt.reconciliation,'current');assert.match(saved.headers()['cache-control'],/private, no-store/);
  assert.deepEqual(await(await post('replay',intent)).json(),receipt);assert.deepEqual(await(await post('receipt',intent)).json(),receipt);
  assert.equal((await post('replay',{...intent,desiredStatus:'skipped'})).status(),409);
  assert.equal((await post('replay',{...intent,requestId:randomUUID(),expectedRevision:4,user_id:uid})).status(),400);
  assert.equal((await post('replay',intent,{'sec-fetch-site':'cross-site'})).status(),403);
  assert.equal(json('sep28_crystal_state()').total,String((i+1)*5));
  await page.reload();await page.getByRole('button',{name:'Mark '+t.title+' incomplete',exact:true}).waitFor();
  for(const light of[false,true]){
   const sw=page.getByRole('switch',{name:/appearance active/});if(((await sw.getAttribute('aria-label'))==='Light appearance active')!==light){await sw.focus();await page.keyboard.press('Space');}
   await page.getByRole('switch',{name:light?'Light appearance active':'Dark appearance active',exact:true}).waitFor();
   await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:`${output}/server-guard-${t.width}-${light?'light':'dark'}.jpg`,type:'jpeg',quality:76,fullPage:true});evidence.themes.push({width:t.width,theme:light?'light':'dark'});
  }
  assert.equal((await page.request.post(origin+`/api/tasks/${t.id}/archive`)).status(),200);
  const historical=await post('replay',intent);assert.equal(historical.status(),200);assert.equal((await historical.json()).reconciliation,'manual-review');
  const newIntent={...intent,requestId:randomUUID(),expectedRevision:4,desiredStatus:'pending'};
  assert.equal((await post('replay',newIntent)).status(),409);assert.deepEqual(await(await post('receipt',newIntent)).json(),{state:'not-found'});
  evidence.checks.push({width:t.width,receiptReplayed:true,changedPayload409:true,archivedNewWrite409:true,historicalReceiptManualReview:true,canonicalTaskShards:String((i+1)*5)});
 }
 // Same signed-in HTTP surfaces cannot leak another owner's receipt. Then no session => 401.
 const other=await admin.auth.admin.createUser({email:`other-${randomUUID()}@example.invalid`,password,email_confirm:true});assert.equal(other.error,null);
 await context.clearCookies();await page.goto(origin+'/auth');await page.locator('input[type=email]').fill(other.data.user.email);await page.locator('input[type=password]').fill(password);await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.waitForURL(origin+'/');
 assert.deepEqual(await(await post('receipt',intents[0])).json(),{state:'not-found'});assert.equal((await post('replay',{...intents[0],requestId:randomUUID()})).status(),409);
 await context.clearCookies();assert.equal((await post('receipt',intents[0])).status(),401);assert.equal((await post('replay',intents[0])).status(),401);
 evidence.ownerSwitchNoDisclosure=true;evidence.anonymous401=true;assert.deepEqual(evidence.browserErrors,[]);
 fs.writeFileSync(output+'/result.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{
 if(browser)await browser.close();if(server&&server.exitCode===null){const done=once(server,'exit');server.kill('SIGTERM');await done;}
 clock(new Date().toISOString());localSql("CREATE OR REPLACE FUNCTION crystrack_daily.clock()RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path=''AS $$SELECT clock_timestamp()$$");
}
