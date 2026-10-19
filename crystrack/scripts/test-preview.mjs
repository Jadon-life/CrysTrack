/** Local build + Chromium safety proof. Never contacts Vercel or a database. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {apiWriterInventory} from './preview-write-audit.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const safeEnv=Object.fromEntries(['PATH','TMPDIR','LANG','HTTPS_PROXY','HTTP_PROXY','NO_PROXY'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const blank=Object.fromEntries(fs.readFileSync(path.join(root,'.env.example'),'utf8').split('\n').filter(l=>/^[A-Z][A-Z0-9_]*=/.test(l)).map(l=>[l.split('=')[0],'']));
// All values below are fake test markers; the known production HOST is a deny target, never a request destination.
const markers=['yfzglhwjtpirbwhqatdx.supabase.co','ISSUE11_FAKE_PUBLIC_KEY','ISSUE11_FAKE_SERVICE_KEY','ISSUE11_FAKE_AI_KEY','ISSUE11_FAKE_PUBLIC_OTHER'];
const demoEnv={...safeEnv,...blank,VERCEL_ENV:'preview',CRYSTRACK_PREVIEW_MODE:'synthetic-v1',
 NEXT_PUBLIC_SUPABASE_URL:'https://'+markers[0],NEXT_PUBLIC_SUPABASE_ANON_KEY:markers[1],
 SUPABASE_SERVICE_ROLE_KEY:markers[2],SUPABASE_SECRET_KEY:markers[2],OPENROUTER_API_KEY:markers[3],NEXT_PUBLIC_EXTRA:markers[4],NEXT_TELEMETRY_DISABLED:'1'};
let server;
let browser;
const logs=[];
function run(args,env) {
 const child=spawn(process.execPath,args,{cwd:root,env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>process.stdout.write(d));child.stderr.on('data',d=>process.stderr.write(d));
 return once(child,'exit').then(([code])=>assert.equal(code,0,'Build command failed'));
}
async function availablePort() {
 const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;
 await new Promise((resolve,reject)=>socket.close(error=>error?reject(error):resolve()));return port;
}
async function start(env) {
 const port=await availablePort();
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',d=>logs.push(d.toString()));server.stderr.on('data',d=>logs.push(d.toString()));
 const origin=`http://127.0.0.1:${port}`;
 const deadline=Date.now()+30000;
 while(Date.now()<deadline) {
  if(server.exitCode!==null) throw new Error('Local Next server exited: '+logs.join(''));
  try {await fetch(origin);return origin;} catch {await new Promise(resolve=>setTimeout(resolve,200));}
 }
 throw new Error('Local Next server readiness timed out');
}
async function stop() {
 if(!server || server.exitCode!==null)return;
 const done=once(server,'exit');server.kill('SIGTERM');await done;server=undefined;
}
function files(folder) {return fs.readdirSync(folder,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(path.join(folder,item.name)):[path.join(folder,item.name)]);}
try {
 await run(['node_modules/next/dist/bin/next','build'],demoEnv);
 for(const file of files(path.join(root,'.next/static'))) {
  const body=fs.readFileSync(file).toString();
  for(const marker of markers) assert.ok(!body.includes(marker),`Hosted marker leaked into client artifact: ${path.relative(root,file)}`);
 }
 console.log('PASS: real Preview client artifacts contain no hosted credential/URL markers.');
 const origin=await start(demoEnv);
 for(const item of apiWriterInventory()) {
  const endpoint='/'+item.file.replace(/^src\/app\//,'').replace(/\/route.ts$/,'').replaceAll(/\[[^\]]+\]/g,'synthetic');
  for(const method of item.methods) {
   const response=await fetch(origin+endpoint,{method,headers:{'Content-Type':'application/json','Authorization':'Bearer synthetic-token','x-cron-secret':'synthetic-cron'},...(method==='GET'?{}:{body:'{}'}),redirect:'manual'});
   assert.equal(response.status,403,`${method} ${endpoint}`);
  }
 }
 assert.equal((await fetch(origin+'/api/not-allowed')).status,403);
 assert.equal((await fetch(origin+'/api/exchange-rate')).status,403);
 assert.equal((await fetch(origin+'/api/auth/callback?code=fake')).status,403);
 console.log('PASS: every inventoried API writer, auth callback and unknown integration is denied by the running Preview server.');
 browser=await chromium.launch({headless:true,...(process.env.CRYSTRACK_CHROMIUM_PATH?{executablePath:process.env.CRYSTRACK_CHROMIUM_PATH}:{}),args:['--no-sandbox'],env:safeEnv});
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 const outbound=[];const browserErrors=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin) {outbound.push(url.origin+url.pathname);await route.abort('blockedbyclient');return;}
  await route.continue();
 });
 const page=await context.newPage();
 page.on('pageerror',error=>browserErrors.push(error.message));
 await page.addInitScript(()=>{
  window.__previewSignals={fetch:[],socket:[],beacon:[],geolocation:0,push:0,worker:0};
  const originalFetch=window.fetch;
  window.fetch=function(input,init){window.__previewSignals.fetch.push(String(input instanceof Request?input.url:input));return originalFetch.call(this,input,init);};
  const OriginalSocket=window.WebSocket;
  window.WebSocket=class extends OriginalSocket {constructor(url,protocols){window.__previewSignals.socket.push(String(url));super(url,protocols);}};
  navigator.sendBeacon=(url)=>{window.__previewSignals.beacon.push(String(url));return false;};
  navigator.geolocation.getCurrentPosition=()=>{window.__previewSignals.geolocation++;throw new Error('Geolocation forbidden');};
  if(navigator.serviceWorker) { const original=navigator.serviceWorker.register.bind(navigator.serviceWorker); navigator.serviceWorker.register=(...args)=>{window.__previewSignals.worker++;return original(...args);}; }
  if(window.PushManager) PushManager.prototype.subscribe=()=>{window.__previewSignals.push++;return Promise.reject(new Error('Push forbidden'));};
 });
 const routes=['/','/plan','/tasks','/goals','/assignments','/calendar','/finance','/insights','/history','/ai','/settings','/auth'];
 const signals=[];
 for(const route of routes) {
  console.log('Browser route:',route);
  assert.equal((await page.goto(origin+route)).status(),200,route);
  await page.getByText('Synthetic read-only demo',{exact:false}).first().waitFor({state:'visible'}).catch(async error=>{
    const dir=path.join(root,'.preview-test');fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'failure.txt'),JSON.stringify({route,errors:browserErrors,text:await page.locator('body').innerText()},null,2));
    await page.screenshot({path:path.join(dir,'failure.png'),fullPage:true});throw error;
  });
  for(const marker of markers) assert.ok(!(await page.content()).includes(marker),'Marker in rendered HTML');
  if(route==='/') await page.getByText('Explore your calm workspace',{exact:false}).first().waitFor({state:'visible'});
  if(route==='/tasks') { await page.getByRole('button',{name:'Week grid',exact:true}).click(); await page.getByTestId('task-week-grid').getByRole('table').waitFor(); assert.equal(await page.getByTestId('task-week-grid').getByRole('button',{name:/Complete .* today/}).isDisabled(),true); }
  if(route==='/history') await page.getByRole('heading',{name:'History',exact:true}).waitFor();
  if(route==='/ai') await page.getByText('About this synthetic demo',{exact:false}).first().waitFor();
  if(route==='/auth') assert.equal(await page.locator('input[type=password]').count(),0);
  signals.push(await page.evaluate(()=>window.__previewSignals));
 }
 await page.goto(origin+'/settings');
 await page.getByText('Synthetic read-only demo',{exact:false}).first().waitFor();
 // Preserve the approved actual switch; its geometry and production code stay intact.
 const switches=page.getByRole('switch');
 assert.ok(await switches.count(),'Approved appearance switch must be present');
 const before=await switches.first().getAttribute('aria-checked');
 await switches.first().click();
 await page.waitForFunction(previous=>document.querySelector('[role=switch]')?.getAttribute('aria-checked')!==previous,before);
 await switches.first().click();
 await page.waitForFunction(previous=>document.querySelector('[role=switch]')?.getAttribute('aria-checked')===previous,before);
 const upload=page.locator('input[type=file]');
 assert.ok(await upload.count(),'Avatar upload control must be probed');
 await upload.first().setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from('synthetic demo bytes')});
 await page.getByText('Uploads are disabled in the synthetic demo.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>localStorage.length),0,'Demo interactions must not persist data');
 await page.getByRole('button',{name:'Reminders',exact:true}).click();
 await page.getByRole('button',{name:'Connect Telegram',exact:true}).click();
 await page.getByText('This is a read-only synthetic demo. Changes and integrations are disabled.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Retry setup',exact:true}).click();
 await page.getByText('Push is disabled in the synthetic demo.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Location & Weather',exact:true}).click();
 await page.getByRole('button',{name:'Use current location',exact:true}).click();
 signals.push(await page.evaluate(()=>window.__previewSignals));
 assert.deepEqual(outbound,[],'The browser attempted an external network request');
 for(const sample of signals) {
  assert.equal(sample.geolocation,0);assert.equal(sample.push,0);assert.equal(sample.worker,0);assert.deepEqual(sample.socket,[]);assert.deepEqual(sample.beacon,[]);
  for(const url of sample.fetch) assert.equal(new URL(url,origin).origin,origin,'Browser transport left the demo origin');
 }
 assert.deepEqual(browserErrors,[],'Browser runtime errors');
 const artifactDir=path.join(root,'.preview-test');fs.mkdirSync(artifactDir,{recursive:true});
 await page.goto(origin+'/');await page.getByText('Explore your calm workspace',{exact:false}).first().waitFor();
 await page.screenshot({path:path.join(artifactDir,'synthetic-today.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.goto(origin+'/tasks');
 await page.getByText('Explore your calm workspace',{exact:false}).first().waitFor();
 await page.screenshot({path:path.join(artifactDir,'synthetic-mobile.png'),fullPage:true});
 await browser.close();browser=undefined;await stop();
 console.log('PASS: Chromium navigation across 12 routes, switch interaction and upload probe made zero external requests, no geolocation/push/session transport, and no runtime errors.');
 const blocked=await start({...demoEnv,CRYSTRACK_PREVIEW_MODE:''});
 for(const route of ['/','/api/profile','/api/auth/callback?code=fake','/_next/static/synthetic.js']) assert.equal((await fetch(blocked+route)).status,503,route);
 await stop();
 console.log('PASS: missing runtime demo flag fails closed, including API, callback and static assets.');
 fs.writeFileSync(path.join(artifactDir,'result.json'),JSON.stringify({routes,apiWriters:apiWriterInventory().length,externalRequests:outbound,clientArtifactMarkersAbsent:markers.length,blockedMode:'passed',browserErrors},null,2));
} finally {if(browser)await browser.close();await stop();}
