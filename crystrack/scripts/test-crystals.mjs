/** Normal Chromium proof; synthetic fixed local Supabase target only. No hosted credentials. */
import assert from 'node:assert/strict';import fs from 'node:fs';import {randomUUID} from 'node:crypto';import {spawn} from 'node:child_process';import {once} from 'node:events';import net from 'node:net';
import {createClient} from '@supabase/supabase-js';import {chromium} from 'playwright';
import {ROOT,readLocalKeys,localSql} from './local-supabase.mjs';import {localEnvironment} from './local-supabase-policy.mjs';
assert.equal(process.argv.length,2,'No caller-controlled targets/arguments');
const keys=readLocalKeys();
assert.equal(JSON.parse(fs.readFileSync(ROOT+'/.next/required-server-files.json')).config.env.NEXT_PUBLIC_CRYSTRACK_RUNTIME,'normal');
const blank=Object.fromEntries(fs.readFileSync(ROOT+'/.env.example','utf8').split('\n').filter(l=>/^[A-Z][A-Z0-9_]*=/.test(l)).map(l=>[l.split('=')[0],'']));
const env={...localEnvironment(process.env),...blank,...keys,VERCEL_ENV:'production',NEXT_TELEMETRY_DISABLED:'1'};
const admin=createClient(keys.NEXT_PUBLIC_SUPABASE_URL,keys.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos'}).format(new Date());
const step=n=>{const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10);};
const clock=d=>localSql(`CREATE OR REPLACE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT '${d}T12:00:00Z'::timestamptz $$`);
let server,browser,uid;const out=ROOT+'/.preview-test/crystals';fs.mkdirSync(out,{recursive:true});
const evidence={day,timezone:'Africa/Lagos',checks:[],externalAttemptsBlocked:0};
try {
 const email=`crystal-${randomUUID()}@example.invalid`,password=randomUUID()+'aA1!';
 const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Synthetic Crystal Explorer'}});assert.equal(error,null);uid=data.user.id;
 localSql(`INSERT INTO profiles(user_id,timezone,display_name) VALUES('${uid}','Africa/Lagos','Synthetic Crystal Explorer') ON CONFLICT(user_id) DO UPDATE SET timezone='Africa/Lagos';`);
 const owner=sql=>localSql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"${uid}","role":"authenticated"}';${sql};COMMIT;`);
 const state=()=>JSON.parse(owner('SELECT sep28_crystal_state()').split('\n').at(-1));
 clock(step(-2));owner('SELECT daily_context()');state();
 const task=randomUUID(),goal=randomUUID(),assignment=randomUUID();
 localSql(`INSERT INTO recurring_tasks(id,user_id,title,preferred_time) VALUES('${task}','${uid}','Synthetic crystal routine','10:00');INSERT INTO task_schedules(task_id,weekday) SELECT '${task}',generate_series(0,6);
 INSERT INTO goals(id,user_id,title,checkin_config,progress_mode,starting_value,progress_value,target_value) VALUES('${goal}','${uid}','Synthetic crystal goal','{"frequency":"daily"}','percentage',0,0,10);
 INSERT INTO assignments(id,user_id,title,deadline) VALUES('${assignment}','${uid}','Synthetic late assignment','${step(-1)}T10:00:00Z');`);
 clock(day);owner('SELECT daily_context()');
 const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
 const origin=`http://127.0.0.1:${port}`;server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:ROOT,env,stdio:'ignore'});
 let ready=false;for(let i=0;i<100;i++){try{await fetch(origin+'/auth');ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}assert.ok(ready);
 browser=await chromium.launch({executablePath:process.env.CRYSTRACK_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-NG',reducedMotion:'reduce'});
 await context.route('**/*',route=>{if(['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname))return route.continue();evidence.externalAttemptsBlocked++;return route.abort();});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/auth');await page.locator('input[type=email]').fill(email);await page.locator('input[type=password]').fill(password);await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.waitForURL(origin+'/');
 const nav=page.getByTestId('crystal-nav');await nav.waitFor();assert.match(await nav.getAttribute('aria-label'),/level 1, Raw/);
 await page.getByRole('button',{name:'Complete Synthetic crystal routine',exact:true}).click();
 await page.getByRole('button',{name:'Mark Synthetic crystal routine incomplete',exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('[data-testid="crystal-nav"]')?.getAttribute('aria-label')?.includes('5 of 500'));
 assert.equal(state().total,'5');
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.getByRole('button',{name:'Complete Synthetic crystal routine',exact:true}).waitFor();assert.equal(state().total,'0');
 await page.getByRole('button',{name:'Complete Synthetic crystal routine',exact:true}).click();await page.getByRole('button',{name:'Mark Synthetic crystal routine incomplete',exact:true}).waitFor();assert.equal(state().total,'5');
 evidence.checks.push('Normal signed-in Today complete/undo/recomplete: 5/0/5; verified streak card preserved');
 await page.goto(origin+'/goals');await page.getByRole('button',{name:'Check in',exact:true}).click();
 const checkin=page.locator('form').filter({has:page.locator('textarea')});await checkin.locator('input[type=number]').first().fill('1');await checkin.locator('textarea').first().fill('Synthetic evidence: practiced one step.');await checkin.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByRole('button',{name:'Checked in',exact:true}).waitFor();assert.equal(state().total,'30');evidence.checks.push('Real goal check-in UI +25');
 await page.goto(origin+'/assignments');await page.getByRole('checkbox',{name:'Complete Synthetic late assignment',exact:true}).click();await page.getByRole('checkbox',{name:'Complete Synthetic late assignment',exact:true}).waitFor({state:'hidden'});assert.equal(state().total,'60');evidence.checks.push('Actual late-assignment completion UI +30, no deadline block');
 await page.goto(origin+'/finance');await page.getByRole('button',{name:'Money entry',exact:true}).click();
 let expenseBody,interruptedExpense=false;
 await page.route('**/api/finance/entries',async route=>{
  if(interruptedExpense)return route.continue();
  interruptedExpense=true;expenseBody=route.request().postDataJSON();
  const committed=await route.fetch();assert.equal(committed.status(),201);
  await route.abort('failed');
 });
 const entry=page.locator('form').filter({has:page.locator('input[placeholder="0"]')});await entry.locator('select').first().selectOption('expense');await entry.locator('input[type=number]').fill('2500.25');await entry.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByText('Failed to fetch',{exact:true}).waitFor();
 await page.unroute('**/api/finance/entries');
 assert.equal(state().total,'65');
 await entry.getByRole('button',{name:'Save',exact:true}).click();await entry.waitFor({state:'hidden'});
 assert.equal(state().total,'65');assert.equal(localSql(`SELECT amount::text FROM money_entries WHERE user_id='${uid}'`),'2500.25');evidence.checks.push('Genuine Wealth expense UI +5, exact stored decimal 2500.25');
 const replay=await page.request.post(origin+'/api/finance/entries',{data:expenseBody});assert.equal(replay.status(),200);assert.equal((await replay.json()).id,expenseBody.requestId);
 assert.equal((await page.request.post(origin+'/api/finance/entries',{data:{...expenseBody,amount:4000}})).status(),409);assert.equal(state().total,'65');
 const concurrentBody={flowKind:'expense',amount:0.25,source:'Synthetic duplicate submission',requestId:randomUUID()};
 const pair=await Promise.all([page.request.post(origin+'/api/finance/entries',{data:concurrentBody}),page.request.post(origin+'/api/finance/entries',{data:concurrentBody})]);
 assert.deepEqual(pair.map(r=>r.status()).sort(),[200,201]);assert.equal(state().total,'70');
 evidence.checks.push('Expense commit-then-network-failure retries one submission; changed payload conflicts; concurrent duplicate HTTP POSTs persist one source/+5');
 await page.goto(origin+'/');await page.getByTestId('today-streak').waitFor();
 clock(step(1));await page.clock.setSystemTime(new Date(step(1)+'T12:00:00Z'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.getByTestId('today-streak').getByRole('list',{name:new RegExp('Seven days ending '+step(1))}).waitFor();
 assert.equal(state().total,'120');evidence.checks.push('Authoritative saved-zone closure books +50 once; yesterday joins streak');
 // Genuine synthetic spending rows, never an inserted shard/XP total, reach level 2 for UI proof.
 owner(`INSERT INTO money_entries(user_id,type,amount) SELECT '${uid}','expense',1 FROM generate_series(1,76)`);assert.equal(state().total,'500');
 await page.evaluate(()=>window.dispatchEvent(new Event('crystrack-crystal-updated')));
 await page.getByTestId('crystal-moment').waitFor();await page.screenshot({path:out+'/level-moment.png'});
 await page.getByRole('button',{name:'Skip crystal moment'}).click();await page.getByTestId('crystal-moment').waitFor({state:'hidden'});
 await page.goto(origin+'/insights');const card=page.getByTestId('crystal-card');await card.getByText('500',{exact:true}).waitFor();await card.getByText('Level 2 · Raw',{exact:true}).waitFor();
 await page.reload();await card.getByText('500',{exact:true}).waitFor();assert.equal(await page.getByTestId('crystal-moment').count(),0);
 evidence.checks.push('Real ledger total 500 → level 2 Raw; skippable moment never repeats on reload');
 await page.screenshot({path:out+'/insights-desktop.png',fullPage:true});
 for(const width of [375,430,768,1280,1440]){
  await page.setViewportSize({width,height:1000});await card.scrollIntoViewIfNeeded();
  assert.ok(await card.evaluate(el=>el.scrollWidth<=el.clientWidth),'Crystal card fits '+width);
  const navBox=await nav.boundingBox();assert.ok(navBox.x>=0&&navBox.x+navBox.width<=width,'Nav gem fits '+width);assert.ok(navBox.width>=40&&navBox.height>=40);
  const controls=await page.locator('header button, header a').evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect()).filter(rect=>rect.width&&rect.height).map(rect=>({left:rect.left,right:rect.right})));
  assert.ok(controls.every(rect=>rect.left>=0&&rect.right<=width+1),'All visible navigation controls fit '+width);
  if(width===375){await card.locator('..').screenshot({path:out+'/insights-mobile.png'});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:out+'/nav-mobile.png'});}
 }
 await page.setViewportSize({width:1440,height:1000});
 const money=()=>localSql(`SELECT json_build_object('count',count(*),'sum',sum(amount)::text) FROM money_entries WHERE user_id='${uid}'`);
 const before=money();
 await page.goto(origin+'/settings');await page.getByRole('button',{name:'Crystal rewards',exact:true}).click();const toggle=page.getByRole('switch',{name:'Earn crystal shards'});await toggle.waitFor();await page.waitForFunction(()=>document.querySelector('[role=switch][aria-label="Earn crystal shards"]')?.getAttribute('aria-checked')==='true');assert.equal(await toggle.getAttribute('aria-checked'),'true');await toggle.focus();await page.keyboard.press('Space');await toggle.getByText('Off',{exact:true}).waitFor();assert.equal(await nav.count(),0);assert.equal(state().enabled,false);
 await page.screenshot({path:out+'/rewards-off.png',fullPage:true});
 await page.goto(origin+'/');await page.getByRole('button',{name:'Complete Synthetic crystal routine',exact:true}).click();await page.getByRole('button',{name:'Mark Synthetic crystal routine incomplete',exact:true}).waitFor();assert.equal(state().total,'500');
 await page.goto(origin+'/insights');await page.getByRole('heading',{name:'What your activity is showing'}).waitFor();assert.equal(await card.count(),0);assert.equal(await nav.count(),0);
 await page.goto(origin+'/settings');await page.getByRole('button',{name:'Crystal rewards',exact:true}).click();await page.getByRole('switch',{name:'Earn crystal shards'}).click();await nav.waitFor();assert.equal(state().total,'500');assert.equal(money(),before);assert.equal(await page.getByTestId('crystal-moment').count(),0);
 evidence.checks.push('Keyboard OFF hides nav/card, suppresses fresh task earning; ON no catch-up; numeric money records byte-for-byte unchanged');
 const secondEmail=`crystal-${randomUUID()}@example.invalid`,secondPassword=randomUUID()+'aA1!';
 const second=await admin.auth.admin.createUser({email:secondEmail,password:secondPassword,email_confirm:true,user_metadata:{full_name:'Other Synthetic Crystal Explorer'}});assert.equal(second.error,null);
 localSql(`INSERT INTO profiles(user_id,timezone) VALUES('${second.data.user.id}','Africa/Lagos') ON CONFLICT(user_id) DO NOTHING`);
 await page.getByRole('button',{name:'Open profile menu'}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL(origin+'/auth');
 await page.locator('input[type=email]').fill(secondEmail);await page.locator('input[type=password]').fill(secondPassword);await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.waitForURL(origin+'/');
 await page.waitForFunction(()=>document.querySelector('[data-testid="crystal-nav"]')?.getAttribute('aria-label')?.includes('0 of 500'));
 assert.match(await nav.getAttribute('aria-label'),/level 1, Raw/);
 evidence.checks.push('Real local sign-out/sign-in changes owner: second account starts at 0, not previous owner’s 500');
 evidence.financialSnapshot=JSON.parse(before);evidence.finalTotal=state().total;evidence.closedDay=day;evidence.openDayAfterClosure=step(1);evidence.browserErrors=errors;assert.deepEqual(errors,[]);
 fs.writeFileSync(out+'/result.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
} finally {
 if(browser)await browser.close();if(server&&server.exitCode===null){const done=once(server,'exit');server.kill('SIGTERM');await done;}
 localSql("CREATE OR REPLACE FUNCTION crystrack_daily.clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT clock_timestamp() $$");
 if(uid){localSql(`DELETE FROM money_entries WHERE user_id='${uid}'`);await admin.auth.admin.deleteUser(uid);}
}
