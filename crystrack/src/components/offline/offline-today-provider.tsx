'use client';
import React,{createContext,useCallback,useContext,useEffect,useRef,useState}from'react';
import{useAuth}from'@/components/layout/auth-provider';
import{isRestrictedPreview}from'@/lib/preview/mode';
import{offlineSourceSchema,type OfflineSource}from'@/lib/offline-source';
import{offlineOutcomeResolutionSchema,type OfflineOutcomeIntent}from'@/lib/offline-outcomes';
import{DEVICE_TTL,readQueue,stage,sourceMatches,reconciled,type DeviceQueue,type QueueItem}from'@/lib/offline-queue';
import{offlineJSON}from'@/lib/offline-transport';
import{deviceStore,DEVICE_LOCK}from'@/lib/offline-device';
const FLAG='crystrack-offline-enabled-v1';
type Store=Awaited<ReturnType<typeof deviceStore>>;
type Context={unavailable:boolean;locked:boolean;enabled:boolean;online:boolean;busy:boolean;items:QueueItem[];notice:string;confirmed:boolean;enable:()=>Promise<void>;clear:()=>Promise<void>;sync:()=>Promise<void>;stageAction:(id:string,status:OfflineOutcomeIntent['desiredStatus'])=>Promise<boolean>;discard:(id:string)=>Promise<void>};
const empty:Context={unavailable:false,locked:false,enabled:false,online:false,busy:false,items:[],notice:'',confirmed:false,enable:async()=>{},clear:async()=>{},sync:async()=>{},stageAction:async()=>false,discard:async()=>{}};
const OfflineContext=createContext(empty);
export const useOfflineToday=()=>useContext(OfflineContext);
export function OfflineTodayProvider({children}:{children:React.ReactNode}){
  // Synthetic Preview never mounts the storage/network-capable component.
  return isRestrictedPreview()?children:<NormalOfflineProvider>{children}</NormalOfflineProvider>;
}
function NormalOfflineProvider({children}:{children:React.ReactNode}){
  const{user,refreshUser}=useAuth();const owner=user?.id??'';const ownerRef=useRef(owner);
  useEffect(()=>{ownerRef.current=owner;},[owner]);
  const store=useRef<Store|null>(null),channel=useRef<BroadcastChannel|null>(null),abort=useRef<AbortController|null>(null);
  const queue=useRef<DeviceQueue|null>(null),fence=useRef(0),retained=useRef<{owner:string;count:number;expiresAt:number}|null>(null);
  const[lockedOwner,setLockedOwner]=useState<string|null>(null);
  const[unavailable,setUnavailable]=useState(false);
  const[view,setView]=useState<DeviceQueue|null>(null),[online,setOnline]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[confirmed,setConfirmed]=useState(false);
  const publish=useCallback((q:DeviceQueue|null)=>{if(q)retained.current={owner:q.owner,count:q.items.length,expiresAt:q.expiresAt};queue.current=q;setView(q);},[]);
  const valid=(id:string,epoch:number)=>ownerRef.current===id&&fence.current===epoch;
  const source=useCallback(async(id:string,signal?:AbortSignal):Promise<OfflineSource>=>{
    const readFence=fence.current;
    if(ownerRef.current!==id)throw new Error('Account changed. Reconnect before syncing.');
    let reply;try{reply=await offlineJSON('/api/tasks/offline/source',{signal});}catch{setUnavailable(false);setOnline(false);throw new Error('Connection uncertain. Keep this page open and retry Sync when online.');}
    const{response,data:body}=reply;
    if(ownerRef.current!==id||fence.current!==readFence)throw new Error('Device session changed. Reconnect before syncing.');
    if(!response.ok){setUnavailable(response.status!==401);setOnline(false);if(response.status===401){setLockedOwner(id);fence.current++;abort.current?.abort();publish(null);channel.current?.postMessage('fence');}throw new Error(response.status===401?'Sign in again to review pending device actions. No new action was sent.':'Today could not be verified. Reconnect and try again.');}
    const parsed=offlineSourceSchema.safeParse(body);if(!parsed.success)throw new Error('Today metadata could not be verified. Reconnect before editing.');const data=parsed.data;
    if(ownerRef.current!==id||fence.current!==readFence)throw new Error('Device session changed. Reconnect before syncing.');
    if(data.owner!==id){retained.current=null;setLockedOwner(null);fence.current++;abort.current?.abort();publish(null);void store.current?.clear().catch(()=>setNotice('Device data could not be cleared. Use your browser’s site-data controls before sharing this device.'));channel.current?.postMessage('fence');try{localStorage.removeItem(FLAG);}catch{}throw new Error('Account changed. Device actions were cleared; no new action was sent.');}
    setUnavailable(false);setLockedOwner(null);setOnline(true);return data;
  },[publish]);
  const notify=()=>channel.current?.postMessage('changed');
  const persist=async(q:DeviceQueue,epoch:string|null)=>{const version=fence.current;await store.current!.replace(q,epoch);if(!valid(q.owner,version))throw new Error('Device session changed. Reconnect before syncing.');publish(q);notify();};
  const stop=useCallback(()=>{fence.current++;abort.current?.abort();publish(null);setOnline(false);setConfirmed(false);channel.current?.postMessage('fence');},[publish]);
  const closeSession=useCallback(()=>{fence.current++;abort.current?.abort();publish(null);store.current?.close();store.current=null;channel.current?.close();channel.current=null;},[publish]);
  useEffect(()=>{
    if(!owner)return;
    const id=owner,version=++fence.current;
    const init=async()=>{
      try{
        // Verify Auth independently of snapshot eligibility: even an incomplete new account
        // must clear another owner's device data, without displaying it first.
        const identity=await refreshUser();if(identity?.id!==id||!valid(id,version))return;
        let restored:DeviceQueue|null=null;
        if(localStorage.getItem(FLAG)==='yes'){
          const db=await deviceStore();if(!valid(id,version)){db.close();return;}store.current=db;
          const raw=await db.read();if(!valid(id,version))return;
          if(raw){try{restored=readQueue(raw,id);}catch{await db.clear();if(!valid(id,version))return;localStorage.removeItem(FLAG);setNotice('Expired or different-account offline data was cleared. Unsynced actions were not saved.');}}
        }
        if(restored)publish(restored); // Auth was verified, even if the current source is temporarily unavailable.
        await source(id);if(!valid(id,version))return;
      }catch{if(valid(id,version))setOnline(false);}
    };void init();
    if(typeof BroadcastChannel!=='undefined'){
      const c=new BroadcastChannel(DEVICE_LOCK);channel.current=c;
      c.onmessage=async e=>{
        if(e.data==='fence'){setLockedOwner(id);fence.current++;abort.current?.abort();publish(null);setOnline(false);setNotice('Offline edits were cleared or the account changed in another tab. Reconnect before enabling them again.');return;}
        if(e.data==='changed'&&store.current&&ownerRef.current===id){try{const version=fence.current;const raw=await store.current.read();if(valid(id,version)){if(!raw){retained.current=null;setLockedOwner(null);}publish(raw?readQueue(raw,id):null);}}catch{publish(null);setNotice('Offline data needs review. Reconnect or clear it.');}}
      };
    }
    return closeSession;
  // Owner identity changes are the only initialization boundary.
  },[owner,publish,source,closeSession,refreshUser]);
  const clear=async()=>{
    if(retained.current?.owner===ownerRef.current&&retained.current.count>0&&!window.confirm('Clear unsynchronized routine actions from this device? They have not been saved to your account.'))return;
    stop();retained.current=null;setLockedOwner(null);try{const db=store.current??await deviceStore();await db.clear();localStorage.removeItem(FLAG);notify();setNotice('Offline data cleared. Already received server actions are not reversed.');}catch{setNotice('Device storage could not be cleared. Close this tab and use your browser’s site-data controls.');}
  };
  useEffect(()=>{
    const before=(e:BeforeUnloadEvent)=>{if(retained.current?.owner===ownerRef.current&&retained.current.count>0){e.preventDefault();e.returnValue='';}};
    const logout=(e:Event)=>{if(retained.current?.owner===ownerRef.current&&retained.current.count>0&&!window.confirm('Signing out clears unsynchronized actions on this device. Leave without syncing?')){e.preventDefault();return;}stop();retained.current=null;setLockedOwner(null);localStorage.removeItem(FLAG);void store.current?.clear().catch(()=>setNotice('Device data could not be cleared. Use your browser’s site-data controls before sharing this device.'));};
    const offline=()=>{setUnavailable(false);setOnline(false);};
    const authChanged=()=>{stop();retained.current=null;setLockedOwner(null);try{localStorage.removeItem(FLAG);}catch{}void store.current?.clear().catch(()=>setNotice('Device data could not be cleared. Use your browser’s site-data controls before sharing this device.'));};
    window.addEventListener('crystrack-auth-owner-changed',authChanged);
    window.addEventListener('beforeunload',before);window.addEventListener('crystrack-before-signout',logout);window.addEventListener('offline',offline);
    return()=>{window.removeEventListener('beforeunload',before);window.removeEventListener('crystrack-before-signout',logout);window.removeEventListener('offline',offline);window.removeEventListener('crystrack-auth-owner-changed',authChanged);};
  },[stop]);
  const enable=async()=>{
    if(!owner||busy)return;
    if(!navigator.locks||typeof indexedDB==='undefined'||typeof BroadcastChannel==='undefined'){setNotice('Offline edits are unavailable in this browser. Stay online to save.');return;}
    setBusy(true);setNotice('');const version=fence.current;
    try{await navigator.locks.request(DEVICE_LOCK,async()=>{
      const fresh=await source(owner);if(!valid(owner,version))return;
      const db=store.current??await deviceStore();store.current=db;
      const raw=await db.read();if(raw)throw new Error('Clear existing offline data before enabling another device session.');
      const now=Date.now();const q:DeviceQueue={version:1,owner,epoch:crypto.randomUUID(),expiresAt:now+DEVICE_TTL,sourceAt:now,source:fresh,items:[]};
      readQueue(q,owner);localStorage.setItem(FLAG,'yes');await persist(q,null);
      setNotice('Offline edits enabled for this loaded page. Keep it open during an interruption.');
    });}catch(e){setNotice(e instanceof Error?e.message:'Offline edits are unavailable. Stay online to save.');}finally{setBusy(false);}
  };
  const stageAction=async(id:string,status:OfflineOutcomeIntent['desiredStatus'])=>{
    // Opt-in mode owns these actions even when storage fails: never fall through to a second online writer.
    if(!queue.current)return false;
    // Preserve ordinary online writes, including frozen Today records after archival.
    // A pending action for this routine must still resolve its original offline intent.
    if(online&&navigator.onLine&&!queue.current.items.some(x=>x.intent.routineId===id))return false;
    const version=fence.current;setConfirmed(false);
    try{await navigator.locks.request(DEVICE_LOCK,async()=>{
      if(!valid(owner,version))throw new Error('Account changed. Reconnect before editing.');
      const q=readQueue(await store.current!.read(),owner);
      const next=stage(q,id,status,crypto.randomUUID());await persist(next,q.epoch);setNotice('Pending — not yet verified. Sync when you’re ready.');
    });if(online&&navigator.onLine)void syncRef.current();}catch(e){setNotice(e instanceof Error?e.message:'Could not retain this action. Nothing is confirmed.');}return true;
  };
  const sync=async()=>{
    if(!queue.current||busy)return;setBusy(true);setConfirmed(false);setNotice('');const version=fence.current;const controller=new AbortController();abort.current=controller;
    try{await navigator.locks.request(DEVICE_LOCK,{signal:controller.signal},async()=>{
      let q=readQueue(await store.current!.read(),owner);
      const check=()=>{if(!valid(owner,version)||controller.signal.aborted)throw new Error('Account or device session changed. Review before syncing.');};
      const post=async(path:string,i:OfflineOutcomeIntent)=>{
        check();let reply;try{reply=await offlineJSON('/api/tasks/offline/'+path,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(i)});}catch{throw new Error('Connection uncertain. The original request is retained; retry checks its receipt first.');}
        const{response:r,data}=reply;
        if(!r.ok){if(r.status<500)throw new Error('Review required: authorization, routine or day changed.');throw new Error('Connection uncertain. The original request is retained; retry checks its receipt first.');}
        try{return offlineOutcomeResolutionSchema.parse(data);}catch{throw new Error('Connection uncertain. The original request is retained; retry checks its receipt first.');}
      };
      // This GET verifies Auth.getUser on every sync. It is not a cached session assertion.
      let fresh=await source(owner,controller.signal);check();
      for(const entry of [...q.items]){
        if(entry.phase==='conflict')continue;
        const i=entry.intent;let resolution;
        try{
          if(entry.phase==='attempted')resolution=await post('receipt',i);
          if(!resolution||resolution.state==='not-found'){
            if(!sourceMatches(fresh,i))throw new Error('Review required: Today, timezone, routine definition or revision changed.');
            // Durable immutable attempt BEFORE delivery. Crash/ack loss must go through read-only receipt resolution.
            q={...q,items:q.items.map(x=>x.intent.requestId===i.requestId?{...x,phase:'attempted'}:x)};
            check();await persist(q,q.epoch);check();resolution=await post('replay',i);
          }
          fresh=await source(owner,controller.signal);check();
          if(!reconciled(fresh,i,resolution))throw new Error('Review required: receipt is historical or current records differ.');
          q={...q,items:q.items.filter(x=>x.intent.requestId!==i.requestId)};await persist(q,q.epoch);check();
          window.dispatchEvent(new Event('crystrack-activity-updated'));window.dispatchEvent(new Event('crystrack-offline-confirmed'));setConfirmed(true);
        }catch(e){check();const message=e instanceof Error?e.message:'';
          if(message.startsWith('Review required:')){q={...q,items:q.items.map(x=>x.intent.requestId===i.requestId?{...x,phase:'conflict',reason:message}:x)};await persist(q,q.epoch);continue;}
          throw e;
        }
      }
      if(!q.items.length){const now=Date.now();q={...q,source:fresh,sourceAt:now,expiresAt:now+DEVICE_TTL};await persist(q,q.epoch);}
      setNotice(q.items.length?'Some actions need manual review. No revisions were rebased.':'Confirmed against fresh server records. Today remains open; rewards are verified by the server.');
    });}catch(e){setOnline(false);setNotice(e instanceof Error?e.message:'Connection uncertain. Original attempts remain on this device.');}finally{setBusy(false);}
  };
  // Reconnection is an opportunity to verify; navigator.onLine alone never sets Online.
  const syncRef=useRef(sync);useEffect(()=>{syncRef.current=sync;});
  useEffect(()=>{const reconnect=()=>{if(queue.current)void syncRef.current();else if(owner)void source(owner).catch(()=>{});};window.addEventListener('online',reconnect);return()=>window.removeEventListener('online',reconnect);},[owner,source]);
  useEffect(()=>{const refreshEmpty=()=>{if(queue.current&&!queue.current.items.length)void syncRef.current();};window.addEventListener('crystrack-activity-updated',refreshEmpty);return()=>window.removeEventListener('crystrack-activity-updated',refreshEmpty);},[]);
  const discard=async(id:string)=>{
    if(!window.confirm('Discard this device action? A request already received by the server may still be recorded. Review the refreshed routine before editing again.'))return;
    try{await navigator.locks.request(DEVICE_LOCK,async()=>{const q=readQueue(await store.current!.read(),owner);await persist({...q,items:q.items.filter(x=>x.intent.routineId!==id)},q.epoch);setNotice('Device action discarded. Reconnect and refresh before making another change.');});}catch{setNotice('Could not discard safely. Clear offline data instead.');}
  };
  useEffect(()=>{const timer=setInterval(()=>{const metadata=retained.current;if(metadata?.owner===ownerRef.current&&Date.now()>=metadata.expiresAt){stop();retained.current=null;setLockedOwner(null);void store.current?.clear().then(()=>{channel.current?.postMessage('changed');setNotice('Expired device data cleared. Unsynchronized actions were not saved.');}).catch(()=>setNotice('Device data could not be cleared. Use your browser’s site-data controls before sharing this device.'));try{localStorage.removeItem(FLAG);}catch{}}},30000);return()=>clearInterval(timer);},[stop]);
  const owned=view?.owner===owner?view:null;
  return <OfflineContext.Provider value={{unavailable,locked:lockedOwner===owner,enabled:!!owned,online,busy,items:owned?.items??[],notice,confirmed,enable,clear,sync,stageAction,discard}}>{children}</OfflineContext.Provider>;
}
