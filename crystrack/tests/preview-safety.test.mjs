import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {apiWriterInventory} from '../scripts/preview-write-audit.mjs';
const require=createRequire(import.meta.url);
function load(file,{env={},deps={},browser=false}={}) {
 const compiledModule={exports:{}};
 const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const customRequire=name=>name in deps ? deps[name] : name.startsWith('.') ? load(path.resolve(path.dirname(file),name+'.ts'),{env,browser}) : require(name);
 new Function('require','module','exports','process','window',source)(customRequire,compiledModule,compiledModule.exports,{env},browser?{}:undefined);
 return compiledModule.exports;
}
const preview={VERCEL_ENV:'preview',CRYSTRACK_PREVIEW_MODE:'synthetic-v1',NEXT_PUBLIC_CRYSTRACK_RUNTIME:'preview-demo'};
const mode=env=>load('src/lib/preview/mode.ts',{env});
const requestModule=env=>load('src/lib/preview/request.ts',{env,deps:{'./mode':mode(env),'./data':load('src/lib/preview/data.ts')}});
const req=(path,method='GET')=>({method,nextUrl:new URL(path,'http://127.0.0.1:3000')});

test('Preview fails closed unless both server flag and build marker match; production ignores demo input',()=>{
 const {resolvePreviewMode:resolve}=mode({});
 for(const flag of [undefined,'','true','demo','synthetic-v1 ']) assert.equal(resolve('preview',flag,'preview-demo'),'preview-blocked');
 assert.equal(resolve('preview','synthetic-v1','normal'),'preview-blocked');
 assert.equal(resolve('preview','synthetic-v1','preview-demo'),'preview-demo');
 assert.equal(resolve('production','synthetic-v1','normal'),'normal');
 assert.equal(resolve(undefined,undefined,'preview-demo'),'preview-demo');
 assert.equal(requestModule({VERCEL_ENV:'preview'}).previewRequest(req('/')).status,503);
 assert.equal(requestModule({VERCEL_ENV:'preview'}).previewRequest(req('/_next/static/example.js')).status,503);
 assert.equal(requestModule({VERCEL_ENV:'production'}).previewRequest(req('/api/profile','PUT')),null);
});
test('all inventoried writers and every integration/auth surface are blocked before route execution',async()=>{
 const gate=requestModule(preview);
 for(const writer of apiWriterInventory()) {
  const path='/'+writer.file.replace(/^src\/app\//,'').replace(/\/route.ts$/,'').replaceAll(/\[[^\]]+\]/g,'synthetic');
  for(const method of writer.methods) {
   const response=gate.previewRequest(req(path,method));
   assert.equal(response.status,403,`${method} ${path}`);
   assert.equal(response.headers.get('cache-control'),'private, no-store');
  }
 }
 for(const path of ['/api/auth/callback?code=fake','/api/exchange-rate','/api/telegram/setup','/api/reminders/dispatch','/api/ai/domain/wealth','/api/unrecognized','/_next/image?url=https://example.invalid/avatar.png']) {
  assert.equal(gate.previewRequest(req(path)).status,403,path);
 }
 for(const verb of ['POST','PUT','PATCH','DELETE','OPTIONS']) assert.equal(gate.previewRequest(req('/',verb)).status,403);
});
test('browser, server, admin and middleware refuse construction before cookies, credentials or SDK use',async()=>{
 let constructions=0;
 const sdk={createClient:()=>{constructions++;return {};},createServerClient:()=>{constructions++;return {};},createBrowserClient:()=>{constructions++;return {};}};
 const deps={'@/lib/preview/mode':mode(preview),'@supabase/ssr':sdk,'@supabase/supabase-js':sdk,'next/headers':{cookies:()=>{throw new Error('Cookies must not be read');}}};
 for(const name of ['client','server','admin','middleware']) {
  const exports=load(`src/lib/supabase/${name}.ts`,{env:preview,deps});
  const fn=exports.createClient || exports.createAdminClient || exports.updateSession;
  if(name==='server'||name==='middleware') await assert.rejects(()=>fn(req('/')),/Real services are disabled/);
  else assert.throws(()=>fn(),/Real services are disabled/);
 }
 assert.equal(constructions,0);
 const live=load('src/lib/supabase/admin.ts',{env:{SUPABASE_SERVICE_ROLE_KEY:'synthetic-key',NEXT_PUBLIC_SUPABASE_URL:'http://localhost:54321'},deps:{...deps,'@/lib/preview/mode':mode({})}});
 live.createAdminClient();assert.equal(constructions,1,'Normal production factory still constructs the original client');
});
test('synthetic navigation DTOs have no external URLs, credentials or mutable shared backing service',async()=>{
 const gate=requestModule(preview);
 const endpoints=['profile','preferences','tasks','goals','assignments','wealth','history','insights','ai/conversations','daily-records/context'];
 for(const path of endpoints) {
  const response=gate.previewRequest(req('/api/'+path));
  assert.equal(response.status,200,path);
  assert.doesNotMatch(JSON.stringify(await response.json()),/https?:\/\/|supabase|service_role|access_token|refresh_token/i);
 }
 const first=await gate.previewRequest(req('/api/tasks')).json();first[0].title='Changed';
 const second=await gate.previewRequest(req('/api/tasks')).json();assert.notEqual(second[0].title,'Changed');
 const page=gate.previewRequest(req('/tasks'));
 assert.match(page.headers.get('content-security-policy'),/connect-src 'self'/);
 assert.match(page.headers.get('content-security-policy'),/worker-src 'none'/);
 assert.match(page.headers.get('permissions-policy'),/geolocation=\(\)/);
 const worker=gate.previewRequest(req('/sw.js'));assert.match(await worker.text(),/unregister/);
});
test('Preview Next build config blanks public bindings even when stale hosted values exist',()=>{
 const compiledModule={exports:{}};
 const env={...preview,NEXT_PUBLIC_SUPABASE_URL:'https://synthetic-host.example.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-public-marker',NEXT_PUBLIC_ANOTHER_BINDING:'synthetic-other-marker'};
 new Function('module','process',fs.readFileSync('next.config.js','utf8'))(compiledModule,{env});
 assert.equal(compiledModule.exports.env.NEXT_PUBLIC_CRYSTRACK_RUNTIME,'preview-demo');
 for(const key of Object.keys(env).filter(k=>k.startsWith('NEXT_PUBLIC_')&&k!=='NEXT_PUBLIC_CRYSTRACK_RUNTIME')) assert.equal(compiledModule.exports.env[key],'');
 const live={exports:{}};new Function('module','process',fs.readFileSync('next.config.js','utf8'))(live,{env:{VERCEL_ENV:'production'}});
 assert.deepEqual(live.exports.env,{NEXT_PUBLIC_CRYSTRACK_RUNTIME:'normal'});
});
test('push and weather execution cannot reach browser APIs or transport in Preview',async()=>{
 const deps={'@/lib/preview/mode':mode(preview)};
 const push=load('src/lib/push.ts',{env:preview,deps});
 assert.equal((await push.enablePushNotifications()).status,'unsupported');
 assert.equal((await push.getPushSetupStatus()).status,'unsupported');
 await push.disablePushNotifications();
 await assert.rejects(()=>push.registerCrysTrackServiceWorker(),/Real services are disabled/);
 // The environment dependency graph is browser-neutral; direct transport is guarded before use.
 const environment=fs.readFileSync('src/lib/environment.ts','utf8');
 assert.match(environment,/if \(isRestrictedPreview\(\)\) return fallback;[\s\S]*await reverseGeocode/);
});
