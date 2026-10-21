import { isRestrictedPreview } from './preview/mode';
import { QUEUE_BYTES, type DeviceQueue } from './offline-queue';
const DB='crystrack-offline-today-v1';
export const DEVICE_LOCK='crystrack-offline-today-v1';
/** One bounded owner envelope, not an API cache. Transactions also fence late completions after logout. */
export async function deviceStore(){
  if(isRestrictedPreview()||typeof indexedDB==='undefined'||!navigator.locks||typeof BroadcastChannel==='undefined')throw new Error('Offline edits are unavailable in this browser. Stay online to save.');
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore('device');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Device storage is unavailable.'));
    request.onblocked=()=>reject(new Error('Close other CrysTrack tabs before enabling offline edits.'));
  });
  db.onversionchange=()=>db.close();
  const transact=<T>(write:boolean,work:(s:IDBObjectStore,done:(x:T)=>void,fail:()=>void)=>void)=>new Promise<T>((resolve,reject)=>{
    const tx=db.transaction('device',write?'readwrite':'readonly');let value:T;
    tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(new Error('Device storage could not be updated. No action is confirmed.'));
    work(tx.objectStore('device'),v=>{value=v;},()=>tx.abort());
  });
  return{
    read:()=>transact<unknown>(false,(s,done)=>{const r=s.get('queue');r.onsuccess=()=>done(r.result);}),
    replace:(q:DeviceQueue,expectedEpoch:string|null)=>{
      if(new TextEncoder().encode(JSON.stringify(q)).length>QUEUE_BYTES)throw new Error('Device storage limit reached.');
      return transact<void>(true,(s,done,fail)=>{const r=s.get('queue');r.onsuccess=()=>{try{if((r.result?.epoch??null)!==expectedEpoch){fail();return;}s.put(q,'queue');done();}catch{fail();}};});
    },
    clear:()=>transact<void>(true,(s,done)=>{s.clear();done();}),
    close:()=>db.close(),
  };
}
