/** Reproducible local-only production build + retained Chromium rehearsal. Never deploys or resets. */
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {ROOT,readLocalKeys,localSql} from './local-supabase.mjs';
import {localEnvironment} from './local-supabase-policy.mjs';
const mode=process.argv.slice(2);
if(mode.length>1||(mode.length&&!['--browser-only','--calm-only'].includes(mode[0])))throw Error('Only --browser-only or --calm-only is supported; no target overrides.');
const dest=ROOT+'/docs/validation/issue44';fs.mkdirSync(dest,{recursive:true});
const blank=Object.fromEntries(fs.readFileSync(ROOT+'/.env.example','utf8').split('\n').filter(l=>/^[A-Z][A-Z0-9_]*=/.test(l)).map(l=>[l.split('=')[0],'']));
const env={...localEnvironment(process.env),...blank,...readLocalKeys(),VERCEL_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',CRYSTRACK_CHROMIUM_PATH:process.env.CRYSTRACK_CHROMIUM_PATH||'/usr/bin/chromium'};
function run(args,log,timeout=600000){const fd=fs.openSync(dest+'/'+log,'w');try{const r=spawnSync(args[0],args.slice(1),{cwd:ROOT,env,stdio:['ignore',fd,fd],timeout});return{exitCode:r.status,signal:r.signal};}finally{fs.closeSync(fd);}}
if(!mode.length){const r=run(['npm','run','build'],'build.log');if(r.exitCode!==0)throw Error('Local production build failed; no browser suite started.');}
if(JSON.parse(fs.readFileSync(ROOT+'/.next/required-server-files.json')).config.env.NEXT_PUBLIC_CRYSTRACK_RUNTIME!=='normal')throw Error('Build a normal local artifact before signed-in workflows; Preview remains isolated.');
const suites=mode[0]==='--calm-only'?['calm']:['account-export','offline-guard','assignments','today-streak','crystals','week-grid','budgets','bills','csv','money-presentation','overview','ai-privacy','offline-queue','calm'];
const results=mode[0]==='--calm-only'&&fs.existsSync(dest+'/browser-results.json')?JSON.parse(fs.readFileSync(dest+'/browser-results.json')):[];
for(const suite of suites){
 if(suite==='calm'){
  const file=ROOT+'/.preview-test/calm-private-fixture.json';
  if(fs.existsSync(file)){const fixture=JSON.parse(fs.readFileSync(file));if(!/^[a-f0-9-]{36}$/.test(fixture.uid))throw Error('Invalid synthetic fixture');
   const present=localSql(`SELECT count(*) FROM auth.users WHERE id='${fixture.uid}'`).trim();if(present==='0')fs.unlinkSync(file);
   else if(localSql(`SELECT email LIKE '%@example.invalid' FROM auth.users WHERE id='${fixture.uid}'`).trim()!=='t')throw Error('Refusing a non-synthetic fixture');
  }
  if(!fs.existsSync(file)){const r=run([process.execPath,'scripts/test-calm.mjs','--phase=fixture'],'calm-fixture.log');if(r.exitCode!==0)throw Error('Synthetic Calm fixture preparation failed.');}
 }
 const start=Date.now(),r=run([process.execPath,'scripts/test-'+suite+'.mjs',...(suite==='calm'?['--phase=after']:[])],'browser-'+suite+'.log');
 const item={suite,...r,seconds:Math.round((Date.now()-start)/1000)},index=results.findIndex(x=>x.suite===suite);if(index<0)results.push(item);else results[index]=item;
 fs.writeFileSync(dest+'/browser-results.json',JSON.stringify(results,null,2)+'\n');console.log(suite,r.exitCode===0?'PASS':'FAIL');
 for(const schema of['crystrack_daily','crystrack_bills','crystrack_budgets','crystrack_csv','crystrack_overview'])localSql(`CREATE OR REPLACE FUNCTION ${schema}.clock()RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path=''AS $$SELECT clock_timestamp()$$`);
 if(r.exitCode!==0){process.exitCode=1;break;}
}
