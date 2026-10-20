'use client';
import {useOfflineToday}from'./offline-today-provider';
import {GlassCard} from '@/components/shared/glass-card';
import{isRestrictedPreview}from'@/lib/preview/mode';
export function OfflineTodayStatus(){
  const q=useOfflineToday();if(isRestrictedPreview())return null;
  const conflicts=q.items.some(x=>x.phase==='conflict');
  const state=conflicts?'Conflict':q.items.length?'Pending sync':!q.online?'Offline':q.confirmed?'Confirmed':'Online';
  return <GlassCard padding="sm" className="mb-4 text-sm"><section aria-label="Offline Today controls">
    <div className="flex flex-wrap items-center justify-between gap-2"><p role="status" aria-live="polite" className="text-white">{state} · {q.items.length} pending {q.items.length?'— not yet verified':''}</p>
    {q.enabled?<div className="flex flex-wrap gap-2"><button className="min-h-10 rounded-lg border border-cyan-200/30 px-3 text-cyan-100" disabled={q.busy} onClick={()=>void q.sync()}>Sync now</button><button className="min-h-10 rounded-lg border border-white/20 px-3 text-slate-100" disabled={q.busy} onClick={()=>void q.clear()}>Clear offline data</button></div>:null}</div>
    <details className="mt-2 text-slate-100"><summary className="min-h-10 cursor-pointer py-2">{q.enabled?'About this device’s offline edits':'Optional offline routine edits'}</summary>
      <p>This device can temporarily retain routine labels and up to 20 pending Today actions for at most 24 hours. Device users and scripts running on this site may access them. Use a trusted device. Clearing data, signing out or switching accounts removes unsynchronized actions; expired actions are cleared without saving.</p>
      <p className="mt-2">Keep this already-loaded page open. Offline reload, navigation and other features are not supported. Queued actions do not count toward verified progress or Crystal Shards. Sync rechecks your account, saved timezone and routine version.</p>
      {!q.enabled&&<button className="mt-2 min-h-10 rounded-lg border border-cyan-200/30 px-3 text-cyan-100" disabled={q.busy} onClick={async event=>{const disclosure=event.currentTarget.closest('details');await q.enable();if(disclosure)disclosure.open=false;}}>Enable offline edits on this device</button>}
    </details>
    {q.notice&&<p className="mt-2 text-sm text-slate-100" role="status">{q.notice}</p>}
    {q.items.length>0&&<ul className="mt-2 space-y-2">{q.items.map(x=><li key={x.intent.requestId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/15 p-2"><span>{x.label}: {x.intent.desiredStatus} · <strong>{x.phase==='conflict'?'Conflict — review required':'Pending — not yet verified'}</strong>{x.reason&&<span className="block">{x.reason}</span>}</span><span className="flex flex-wrap gap-2">{x.phase==='queued'&&<button className="min-h-10 rounded-lg border border-white/20 px-3" disabled={q.busy} onClick={()=>void q.stageAction(x.intent.routineId,'pending')}>Undo locally <span className="sr-only">{x.label}</span></button>}<button className="min-h-10 rounded-lg border border-white/20 px-3" disabled={q.busy} onClick={()=>void q.discard(x.intent.routineId)}>Discard <span className="sr-only">{x.label}</span></button></span></li>)}</ul>}
  </section></GlassCard>;
}
export function OfflineRoutineMarker({id}:{id:string}){const q=useOfflineToday();const item=q.items.find(x=>x.intent.routineId===id);return item?<span className="block text-xs text-cyan-100" role="status">{item.phase==='conflict'?'Conflict — review required':`Pending ${item.intent.desiredStatus} — not yet verified`}</span>:null;}
