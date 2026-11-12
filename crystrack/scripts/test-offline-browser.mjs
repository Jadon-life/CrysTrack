// Synthetic browser-only test of the PWA offline fall-back. No credentials, hosted URLs or private records.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dirname,'../public');
const routes=new Map([
  ['/sw.js',['text/javascript','sw.js']],
  ['/offline.html',['text/html','offline.html']],
  ['/offline-workspace.js',['text/javascript','offline-workspace.js']],
]);
const server=createServer((req,res)=>{
  if(req.url==='/'){
    res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
    res.end('<!doctype html><html><title>Synthetic entry</title><body>Public test entrance</body></html>');
    return;
  }
  const route=routes.get(req.url);
  if(!route){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':route[0],'Cache-Control':'no-store'});
  res.end(readFileSync(path.join(root,route[1])));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({serviceWorkers:'allow'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(origin+'/');
  await page.evaluate(async()=>{
    await navigator.serviceWorker.register('/sw.js',{scope:'/'});
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller),null,{timeout:12000});
  await page.waitForFunction(async()=>{
    const c=await caches.open('crystrack-public-offline-v2');
    return Boolean(await c.match('/offline.html')) && Boolean(await c.match('/offline-workspace.js'));
  });
  await page.goto(origin+'/offline.html');
  await page.waitForFunction(()=>!!window.CrysTrackOfflineVault);
  await page.evaluate(async()=>{
    const saved={
      version:1,owner:'11111111-1111-4111-8111-111111111111',day:'2026-11-12',timezone:'Africa/Lagos',
      savedAt:new Date().toISOString(),tasks:[{id:'22222222-2222-4222-8222-222222222222',title:'SYNTHETIC_OFFLINE_TASK',scheduled_today:true,today_status:'pending',daily_revision:1}],
      goals:[{id:'33333333-3333-4333-8333-333333333333',title:'SYNTHETIC_OFFLINE_GOAL',progress_value:30}],
      assignments:[{id:'44444444-4444-4444-8444-444444444444',title:'SYNTHETIC_OFFLINE_ASSIGNMENT',deadline:'2026-12-01T12:00:00Z'}],
      wealth:{summary:{availableBalance:'30000.00',savedBalance:'1200.00',monthIncome:'45000.00',monthExpenses:'12000.00',safeToSpend:'10000.00'}},
      source:null,pending:[],journal:[]
    };
    await window.CrysTrackOfflineVault.saveSnapshot(saved,'correct horse battery staple');
  });
  // Both public files must be available after the network is completely disconnected.
  await context.setOffline(true);
  await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#offline-passphrase').fill('correct horse battery staple');
  await page.getByRole('button',{name:'Unlock saved workspace'}).click();
  await page.getByText('SYNTHETIC_OFFLINE_TASK').waitFor();
  await page.getByRole('button',{name:'Goals',exact:true}).click();
  await page.getByText('SYNTHETIC_OFFLINE_GOAL').waitFor();
  await page.getByRole('button',{name:'Assignments',exact:true}).click();
  await page.getByText('SYNTHETIC_OFFLINE_ASSIGNMENT').waitFor();
  await page.getByRole('button',{name:'Wealth',exact:true}).click();
  await page.getByText('₦30000.00').waitFor();
  await page.getByRole('button',{name:'Notes',exact:true}).click();
  await page.locator('textarea').fill('Synthetic offline journal entry');
  await page.getByRole('button',{name:'Save note on device'}).click();
  await page.getByText('Synthetic offline journal entry').waitFor();
  const cached=await page.evaluate(async()=>{
    const c=await caches.open('crystrack-public-offline-v2');
    return (await c.keys()).map(r=>new URL(r.url).pathname).sort();
  });
  assert.deepEqual(cached,['/offline-workspace.js','/offline.html']);
  assert.deepEqual(errors,[]);
  console.log('PASS: offline app entry, unlock, tasks/goals/assignments/Wealth, encrypted notes, public-only CacheStorage.');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
