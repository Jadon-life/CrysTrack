'use client';
import { useEffect,useMemo,useRef,useState } from 'react';
import {createClient} from '@/lib/supabase/client';
import {useAuth} from '@/components/layout/auth-provider';
import {isRestrictedPreview} from '@/lib/preview/mode';
import {aiPrivacySchema} from '@/lib/ai/privacy';
import {categoryLabels,validateSnapshot,categoryRows,type ExportCategory,readArchive,verifyArchive} from '@/lib/account-export/format';
const initial:ExportCategory[]=['tasks','assignments','goals','wealth','settings','history'];
type Review=ReturnType<typeof validateSnapshot>;
export function AccountExport(){
 const {user}=useAuth();const client=useMemo(()=>isRestrictedPreview()?null:createClient(),[]);const [open,setOpen]=useState(false),[selected,setSelected]=useState(initial),[aiAllowed,setAiAllowed]=useState(false),[review,setReview]=useState<Review|null>(null),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const controller=useRef<AbortController|null>(null),generation=useRef(0),owner=useRef(user?.id);
 useEffect(()=>{owner.current=user?.id;},[user?.id]);
 const invalidate=()=>{generation.current++;controller.current?.abort();setBusy(false);setReview(null);setConfirm(false);};
 useEffect(()=>()=>{generation.current++;controller.current?.abort();},[]);
 useEffect(()=>{const revoke=()=>{generation.current++;controller.current?.abort();setReview(null);setConfirm(false);setBusy(false);setAiAllowed(false);setSelected(x=>x.filter(v=>v!=='ai'));};window.addEventListener('crystrack-auth-owner-changed',revoke);return()=>window.removeEventListener('crystrack-auth-owner-changed',revoke);},[]);
 useEffect(()=>{
  if(!open||isRestrictedPreview())return;
  let active=true;let read:AbortController|null=null;
  const load=async()=>{read?.abort();const next=new AbortController();read=next;const timer=setTimeout(()=>next.abort(),10000);try{const r=await fetch('/api/ai/privacy',{cache:'no-store',signal:next.signal});if(!r.ok)throw Error();const {configured:_,...data}=await r.json();const p=aiPrivacySchema.parse(data);if(active&&!next.signal.aborted)setAiAllowed(p.enabled);}catch{if(active&&!next.signal.aborted)setAiAllowed(false);}finally{clearTimeout(timer);}};
  const changed=()=>{generation.current++;controller.current?.abort();setBusy(false);setReview(null);setConfirm(false);setAiAllowed(false);setSelected(x=>x.filter(v=>v!=='ai'));setNotice('AI privacy changed. Review your selection before downloading.');void load();};
  const storage=(e:StorageEvent)=>{if(e.key==='crystrack-ai-privacy-changed')changed();};
  window.addEventListener('crystrack-ai-privacy-changed',changed);window.addEventListener('storage',storage);void load();
  return()=>{active=false;read?.abort();window.removeEventListener('crystrack-ai-privacy-changed',changed);window.removeEventListener('storage',storage);};
 },[open,user?.id]);
 const show=()=>{setOpen(true);setNotice('');};
 const run=async(download:boolean)=>{
  if(!user||busy||isRestrictedPreview())return;const id=user.id,epoch=++generation.current,abort=new AbortController();controller.current=abort;const timer=setTimeout(()=>abort.abort(),25000);setBusy(true);setNotice(download?'Preparing your private archive…':'Checking your selected records…');
  const current=()=>epoch===generation.current&&owner.current===id&&!abort.signal.aborted;
  const readOwner=()=>new Promise<Awaited<ReturnType<NonNullable<typeof client>['auth']['getUser']>>>((resolve,reject)=>{const fail=()=>reject(Error('ABORT'));if(abort.signal.aborted){fail();return;}abort.signal.addEventListener('abort',fail,{once:true});client!.auth.getUser().then(resolve,reject).finally(()=>abort.signal.removeEventListener('abort',fail));});
  try{
   if(!navigator.onLine)throw Error('OFFLINE');
   const {data:{user:who},error:whoError}=await readOwner();if(whoError)throw Error(whoError.status===401||whoError.status===403?'AUTH':'UNAVAILABLE');if(!current()||who?.id!==id)throw Error('AUTH');
   const response=await fetch('/api/account/export',{method:'POST',cache:'no-store',signal:abort.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:download?'download':'review',categories:selected,...download?{confirm:'EXPORT_PRIVATE_INFORMATION'}:{}})});
   if(!response.ok){if(response.status===401)throw Error('AUTH');if(response.status===413)throw Error('SIZE');if(response.status===403||response.status===409)throw Error('CONSENT');throw Error('UNAVAILABLE');}
   if(!download){const data=validateSnapshot(await response.json(),id,selected,true);if(!current())return;setReview(data);setConfirm(false);setNotice('Review the estimated scope, then confirm your download. Counts may change before the final snapshot.');return;}
   const {blob,raw}=await readArchive(response,abort.signal),archive=await verifyArchive(raw,id,selected);
   const {data:{user:checked},error:checkedError}=await readOwner();if(checkedError)throw Error(checkedError.status===401||checkedError.status===403?'AUTH':'UNAVAILABLE');if(!current()||checked?.id!==id)throw Error('AUTH');
   if(selected.includes('ai')){const r=await fetch('/api/ai/privacy',{cache:'no-store',signal:abort.signal});if(!r.ok)throw Error('CONSENT');const p=await r.json();if(!p.enabled||p.revision!==archive.manifest.aiRevision)throw Error('CONSENT');}
   if(!current())return;
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='crystrack-account-v1.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
   setNotice('Archive verified and offered for download. Keep it private. This is not an automatically restorable backup.');setConfirm(false);
  }catch(e){if(epoch!==generation.current)return;const code=e instanceof Error?e.message:'';setReview(null);setConfirm(false);setNotice(abort.signal.aborted?'Export cancelled or timed out. No file was offered.':code==='AUTH'?'Sign in again before exporting. No file was offered.':code==='SIZE'?'This selection is too large. Choose fewer categories; no partial archive was created.':code==='CONSENT'?'AI permission changed or is unavailable. Review AI & Privacy or export other categories.':'Export could not be verified. Reconnect and try again. No file was offered.');}
  finally{clearTimeout(timer);if(epoch===generation.current)setBusy(false);}
 };
 return <section aria-labelledby="your-data-title" className="rounded-xl border border-white/15 bg-slate-950/80 p-4 text-sm text-slate-100">
  <h3 id="your-data-title" className="font-semibold text-white">Your data</h3><p className="mt-2">Download selected CrysTrack account information. This does not delete anything or create an automatically restorable backup.</p>
  {!open?<button className="mt-3 min-h-10 rounded-lg border border-cyan-200/40 px-4 text-cyan-100" disabled={isRestrictedPreview()} onClick={()=>void show()}>Export my data</button>:<div className="mt-4 space-y-4" data-testid="account-export">
   <p>Online access is required. The archive may contain private notes, financial descriptions and chat text. Anyone with the file can read it. Store it somewhere private; it is not encrypted.</p>
   <fieldset disabled={busy} className="space-y-2"><legend className="mb-2 font-semibold text-white">Choose categories</legend>{(Object.keys(categoryLabels)as ExportCategory[]).map(k=><label key={k} className="flex min-h-10 cursor-pointer items-center gap-3"><input type="checkbox" checked={selected.includes(k)} disabled={k==='ai'&&!aiAllowed} onChange={e=>{invalidate();setSelected(v=>e.target.checked?[...v,k]:v.filter(x=>x!==k));setNotice('');}} className="h-5 w-5 accent-cyan-400"/><span>{categoryLabels[k]}{k==='ai'&&' — optional, off by default'}</span></label>)}</fieldset>
   {!aiAllowed&&<p>AI history is unavailable without current AI consent. You do not need to enable AI to export other categories.</p>}
   <details><summary className="min-h-10 cursor-pointer py-2">What is included and excluded?</summary><p>All stored rows in the selected documented datasets, within size limits. Technical secrets, push/Telegram keys, provider requests, generated AI insights, opaque metadata, avatar files and unsynchronized device actions are excluded. Only current-consent trusted AI conversations are eligible. Open or incomplete days are not verified closed-day history.</p><p className="mt-2">UTF-8 JSON · crystrack-account/v1 · exact decimal-string money · original timestamps and saved timezone · manifest counts and SHA-256 checksums. Up to 10,000 rows per dataset, 25,000 total and 8 MiB projected data. Oversized scopes fail; nothing is silently truncated. An empty dataset is shown as zero only after a successful read.</p></details>
   <button disabled={busy||!selected.length} className="min-h-10 rounded-lg border border-white/30 px-4" onClick={()=>void run(false)}>Review export</button>
   {review&&<div className="space-y-3"><p>Approximate scope: {Object.values(review.counts).reduce((n,x)=>n+x.rows,0).toLocaleString()} rows · about {Math.ceil(Object.values(review.counts).reduce((n,x)=>n+x.projectedBytes,0)/1024)} KiB before manifest overhead. Saved timezone: {review.savedTimezone??'Not configured'}.</p><details><summary className="min-h-10 cursor-pointer py-2">Estimated rows by category</summary><ul>{Object.entries(categoryRows(review)).map(([k,n])=><li key={k}>{categoryLabels[k as ExportCategory]}: {n.toLocaleString()}</li>)}</ul></details><label className="flex min-h-10 items-start gap-3"><input type="checkbox" checked={confirm} disabled={busy} onChange={e=>setConfirm(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-cyan-400"/><span>I understand this file may contain private notes, that unsynchronized offline actions are excluded, and that this is not an automatically restorable backup.</span></label><button disabled={!confirm||busy} className="min-h-10 rounded-lg border border-cyan-200/40 px-4 text-cyan-100" onClick={()=>void run(true)}>Download JSON archive</button></div>}
   {busy?<button className="min-h-10 rounded-lg border border-white/30 px-4" onClick={()=>{invalidate();setNotice('Export cancelled. No file was offered.');}}>Cancel export</button>:<button className="ml-2 min-h-10 rounded-lg px-4" onClick={()=>{invalidate();setOpen(false);setSelected(initial);setNotice('');}}>Close export</button>}
   {notice&&<p role="status" aria-live="polite">{notice}</p>}
  </div>}
  {isRestrictedPreview()&&<p className="mt-2">Account export is unavailable in the synthetic demo.</p>}
 </section>;
}
