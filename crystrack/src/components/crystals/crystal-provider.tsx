'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gem, X } from 'lucide-react';
import { useAuth } from '@/components/layout/auth-provider';
import { fetcher } from '@/lib/api';
import { crystalMomentSchema, crystalProgress, crystalSettingsSchema, crystalStage, crystalStateSchema, type CrystalState } from '@/lib/crystals';
import { isRestrictedPreview } from '@/lib/preview/mode';

const Context=createContext<{state:CrystalState|null;error:boolean;refresh:()=>void;configure:(enabled:boolean)=>Promise<void>}>({state:null,error:false,refresh:()=>{},configure:async()=>{}});
export const useCrystals=()=>useContext(Context);
export function CrystalProvider({children}:{children:React.ReactNode}){
 const {user}=useAuth();const ownerId=user?.id;const path=usePathname();
 const [resolvedOwner,setResolvedOwner]=useState<string|null>(null);
 const [state,setState]=useState<CrystalState|null>(null),[error,setError]=useState(false),[moment,setMoment]=useState<number|null>(null);
 const activeOwner=useRef<string|undefined>(undefined),stateRef=useRef<CrystalState|null>(null);
 const changing=useRef(false);
 const sequence=useRef(0),transport=useRef<AbortController|null>(null),channel=useRef<BroadcastChannel|null>(null);
 const refresh=useCallback(async()=>{
  if(!ownerId||changing.current)return;
  const generation=++sequence.current;transport.current?.abort();const controller=new AbortController();transport.current=controller;
  try{
   const next=crystalStateSchema.parse(await fetcher('/api/crystals',{cache:'no-store',signal:controller.signal}));
   if(sequence.current!==generation)return;
   stateRef.current=next;setState(next);setResolvedOwner(ownerId);setError(false);if(!next.enabled)setMoment(null);
   if(next.enabled&&next.pendingMoment&&!isRestrictedPreview()){
    // A claim is atomic and not aborted by a newer count read; one tab owns delivery.
    try {
      const claim=crystalMomentSchema.parse(await fetcher('/api/crystals/moment',{method:'POST',body:'{}',cache:'no-store'}));
      const current=stateRef.current;
      if(activeOwner.current===ownerId&&current?.enabled&&claim&&claim.level<=crystalProgress(current.total).level)setMoment(claim.level);
    } catch { /* An unavailable optional moment must not hide verified counts. */ }
   }
  }catch{if(sequence.current===generation){stateRef.current=null;setState(null);setError(true);setMoment(null);}}
 },[ownerId]);
 useEffect(()=>{
  activeOwner.current=ownerId;stateRef.current=null;
  const gate=sequence;
  queueMicrotask(()=>{if(activeOwner.current===ownerId){setState(null);setMoment(null);void refresh();}});
  const update=()=>void refresh();
  window.addEventListener('crystrack-activity-updated',update);window.addEventListener('crystrack-crystal-updated',update);window.addEventListener('focus',update);
  if(typeof BroadcastChannel!=='undefined'){channel.current=new BroadcastChannel('crystrack-crystal-refresh');channel.current.onmessage=update;}
  return ()=>{changing.current=false;activeOwner.current=undefined;stateRef.current=null;gate.current++;transport.current?.abort();window.removeEventListener('crystrack-activity-updated',update);window.removeEventListener('crystrack-crystal-updated',update);window.removeEventListener('focus',update);channel.current?.close();};
 },[refresh,ownerId]);
 useEffect(()=>{queueMicrotask(()=>void refresh());},[path,refresh]);
 useEffect(()=>{
  if(moment===null)return;
  const timer=setTimeout(()=>setMoment(null),6000);const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setMoment(null);};
  window.addEventListener('keydown',escape);return ()=>{clearTimeout(timer);window.removeEventListener('keydown',escape);};
 },[moment]);
 const configure=async(enabled:boolean)=>{
  if(!state||!ownerId||resolvedOwner!==ownerId||isRestrictedPreview())throw new Error('Reward settings are unavailable.');
  const owner=ownerId;
  sequence.current++;transport.current?.abort();stateRef.current=null;setMoment(null);changing.current=true;
  try {
   const next=crystalStateSchema.parse(await fetcher('/api/crystals',{method:'PUT',body:JSON.stringify(crystalSettingsSchema.parse({enabled,revision:state.revision})),cache:'no-store'}));
   if(activeOwner.current!==owner)return;
   stateRef.current=next;setState(next);setError(false);channel.current?.postMessage('refresh');
  } finally { changing.current=false;if(activeOwner.current===owner)void refresh(); }
 };
 const visibleState=resolvedOwner===ownerId?state:null;
 return <Context.Provider value={{state:visibleState,error,refresh:()=>void refresh(),configure}}>{children}
  {visibleState?.enabled&&moment!==null&&<div role="status" aria-live="polite" data-testid="crystal-moment" className="fixed bottom-6 left-3 right-3 z-[100] mx-auto max-w-md rounded-2xl border border-amber-200/40 bg-[#101b2a]/95 p-4 text-white shadow-[0_0_40px_rgba(226,186,98,0.18)] backdrop-blur-xl">
   <div className="flex items-start gap-3"><Gem aria-hidden="true" className="mt-1 h-6 w-6 shrink-0 text-amber-200" /><div className="flex-1"><p className="text-sm font-semibold">Crystal level {moment} · {crystalStage(moment)}</p><p className="mt-1 text-xs leading-relaxed text-slate-200">A small marker of the actions you recorded. Keep your own pace.</p></div><button type="button" onClick={()=>setMoment(null)} aria-label="Skip crystal moment" className="grid min-h-10 min-w-10 place-items-center rounded-lg hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200"><X className="h-4 w-4" /></button></div>
  </div>}
 </Context.Provider>;
}
export function CrystalNav(){
 const {state}=useCrystals();if(!state?.enabled)return null;const progress=crystalProgress(state.total);
 return <Link href="/insights#your-crystal" data-testid="crystal-nav" className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200" aria-label={`Your crystal: level ${progress.level}, ${progress.stage}. ${progress.toward} of ${progress.requirement} shards toward next level.`}>
  <svg viewBox="0 0 40 40" className="absolute inset-0 h-10 w-10 -rotate-90" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" opacity=".18" strokeWidth="1.5"/><circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="1.5" pathLength="100" strokeDasharray={`${progress.percent} 100`} strokeLinecap="round" /></svg><Gem className="h-4 w-4" aria-hidden="true" />
 </Link>;
}
