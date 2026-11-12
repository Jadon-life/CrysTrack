import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const sw=readFileSync('public/sw.js','utf8');
const script=readFileSync('public/offline-workspace.js','utf8');
const settings=readFileSync('src/components/settings/offline-workspace.tsx','utf8');

test('offline workspace JS is valid and no private responses enter the service-worker cache',()=>{
  execFileSync(process.execPath,['--check','public/offline-workspace.js']);
  assert.match(sw,/cache\.addAll\(\[OFFLINE_PAGE, OFFLINE_SCRIPT\]\)/);
  assert.match(sw,/request\.mode !== 'navigate'/);
  assert.doesNotMatch(sw,/caches\.put\(request/);
  assert.match(sw,/url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(settings,/getJSON\('\/api\/goals'\)/);
  assert.match(settings,/getJSON\('\/api\/wealth'\)/);
  assert.match(settings,/getJSON\('\/api\/tasks\/offline\/source'\)/);
});

test('vault uses authenticated owner context, AES-GCM encryption and fresh passphrase',()=>{
  assert.match(script,/PBKDF2/);
  assert.match(script,/iterations:250000/);
  assert.match(script,/AES-GCM/);
  assert.match(script,/passphrase\.length < 12/);
  assert.match(script,/previous\.owner !== data\.owner/);
  assert.match(script,/data\.owner !== owner/);
  assert.doesNotMatch(script,/localStorage/);
  assert.doesNotMatch(sw,/(?:finance|wealth|goals).*cache\.put/);
});

test('offline edits are server-authorized, durable before write and receipt-first on retry',()=>{
  assert.match(script,/dayInZone\(source\.context\.timezone\)===source\.context\.day/);
  assert.match(script,/next\.expectedRevision!==result\.receipt\.revision/);
  assert.match(script,/item\.phase==='attempted' \? await actionRequest\('receipt',i\)/);
  assert.match(script,/item\.phase='attempted';await persist\(\)/);
  assert.match(script,/await actionRequest\('replay',i\)/);
  assert.match(script,/data\.owner!==payload\.owner/);
  assert.doesNotMatch(script,/\/api\/(?:finance\/entries|wealth\/entries|goals\/.*\/checkins)['"]/);
  assert.match(script,/Notes are NOT uploaded/);
});

function mockIndexedDB() {
  const stored=new Map();
  const db={
    createObjectStore:()=>{},
    close:()=>{},
    transaction:()=>{
      const tx={};
      const store={
        get:key=>{
          const req={};
          queueMicrotask(()=>{
            req.result=stored.get(key);
            req.onsuccess?.();
            queueMicrotask(()=>tx.oncomplete?.());
          });
          return req;
        },
        put:(value,key)=>{stored.set(key,value);},
        delete:key=>{stored.delete(key);},
      };
      tx.objectStore=()=>store;
      tx.abort=()=>queueMicrotask(()=>tx.onabort?.());
      return tx;
    },
  };
  return {
    stored,
    open:()=>{
      const req={result:db};
      queueMicrotask(()=>{req.onupgradeneeded?.();req.onsuccess?.();});
      return req;
    },
  };
}

test('encrypted vault rejects wrong password and different account; no readable task titles on disk',async()=>{
  const idb=mockIndexedDB();
  const w={};
  runInNewContext(script,{
    window:w,
    document:{querySelector:()=>null},
    indexedDB:idb,
    crypto:webcrypto,
    TextEncoder,TextDecoder,Uint8Array,btoa,atob,
    queueMicrotask,console,
  });
  const api=w.CrysTrackOfflineVault;
  const data={version:1,owner:'account-1',savedAt:new Date().toISOString(),day:'2026-11-12',
    timezone:'Africa/Lagos',tasks:[{title:'PRIVATE_TASK_TITLE'}],goals:[],assignments:[],wealth:null,
    source:null,pending:[],journal:[]};
  const pass='correct horse battery staple';
  await api.saveSnapshot(data,pass);
  assert.equal(await api.hasVault(),true);
  const record=idb.stored.get('vault');
  assert.equal(record.version,1);
  assert.ok(!JSON.stringify(record).includes('PRIVATE_TASK_TITLE'),'raw task leaked from encrypted blob');
  await assert.rejects(()=>api.saveSnapshot(data,'wrong-password-123'),/Passphrase is incorrect/);
  await assert.rejects(()=>api.saveSnapshot({...data,owner:'account-2'},pass),/another account/);
  await api.saveSnapshot(data,pass);
  await assert.rejects(()=>api.deleteVault('wrong-password-123','account-1'),/Passphrase is incorrect/);
  await api.deleteVault(pass,'account-1');
  assert.equal(await api.hasVault(),false);
});
