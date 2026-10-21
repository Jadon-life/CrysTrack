'use client';
import { useState } from 'react';
import { Gem } from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';
import { useCrystals } from './crystal-provider';
import { crystalProgress } from '@/lib/crystals';
import { isRestrictedPreview } from '@/lib/preview/mode';
export function CrystalCard(){
 const {state}=useCrystals();
 // Do not flash reward UI for an opted-out owner while preferences are loading.
 if(!state?.enabled)return null;
 const progress=crystalProgress(state.total);
 return <GlassCard as="section" className="tabular-nums" padding="lg"><div id="your-crystal" data-testid="crystal-card">
  <div className="flex items-start gap-4"><div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-amber-200/30 bg-amber-200/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"><Gem aria-hidden="true" className="h-7 w-7 text-amber-200"/></div><div><h2 className="text-lg font-semibold text-white">Your crystal</h2><p className="mt-1 text-sm text-amber-200">Level {progress.level} · {progress.stage}</p><p className="mt-1 text-xs text-[var(--theme-text-muted)]">A quiet reflection of recorded actions, never a measure of you.</p></div></div>
  <div className="mt-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs text-[var(--theme-text-muted)]">Total crystal shards</p><p className="mt-1 text-3xl font-semibold text-white">{progress.total}</p></div><p className="text-sm text-white/90">{progress.toward} / {progress.requirement} toward level {progress.level+1}</p></div>
  <div role="progressbar" aria-label="Shards toward your next crystal level" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${progress.toward} of ${progress.requirement} shards`} className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-100" style={{width:`${progress.percent}%`}}/></div>
  <p className="mt-4 text-xs leading-relaxed text-[var(--theme-text-muted)]">Routine tick +5 · verified all-done day +50 at closure · goal check-in +25 · assignment +30 · genuine spending log +5. No cash value. Today stays open until your saved-zone midnight.</p>
  <p className="mt-2 text-xs leading-relaxed text-[var(--theme-text-muted)]">Each level starts a new segment: 500, then 600, 720… increasing by 20%, rounded up. Corrections can reduce shards. You can turn rewards off in Settings.</p>
 </div></GlassCard>;
}
export function CrystalSettings(){
 const {state,error,configure,refresh}=useCrystals();const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const toggle=async()=>{if(!state)return;setBusy(true);setMessage('');try{await configure(!state.enabled);setMessage(state.enabled?'Rewards are off. Your history is preserved.':'Rewards are on for new actions.');}catch{setMessage('Could not save reward settings. Refresh and try again.');refresh();}finally{setBusy(false);}};
 return <GlassCard padding="lg"><h2 className="text-lg font-semibold text-white">Crystal rewards</h2><p className="mt-2 text-sm leading-relaxed text-[var(--theme-text-muted)]">Keep this workspace as quiet as you like.</p>
  <div className="mt-5 flex items-center justify-between gap-4"><p className="text-sm text-white">Earn crystal shards</p><button type="button" role="switch" aria-checked={state?.enabled??false} aria-label="Earn crystal shards" disabled={!state||busy||isRestrictedPreview()} onClick={()=>void toggle()} className="min-h-10 min-w-20 rounded-full border border-amber-200/30 bg-white/10 px-4 text-sm font-semibold text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 disabled:opacity-50">{busy?'Saving…':!state?'Unavailable':state.enabled?'On':'Off'}</button></div>
  <p className="mt-4 text-xs leading-relaxed text-[var(--theme-text-muted)]">Off stops future shard earnings and level moments, and hides your crystal and navigation gem. Earned history stays; undoing or deleting an earned action still removes its shards. Turning rewards back on never catches up past actions. A new completion after an undo may earn again, once per action.</p>
  <p className="mt-2 text-xs leading-relaxed text-[var(--theme-text-muted)]">The +50 all-done bonus requires a verified, closed, non-empty day with rewards on for the whole saved-zone day. It begins on the next full day after activation or re-enabling. No badges, challenges or streak protection are added.</p>
  {(error||!state)&&<button type="button" onClick={refresh} className="mt-3 min-h-10 rounded-lg px-3 text-sm text-[var(--theme-primary)] focus-visible:outline focus-visible:outline-2">Refresh reward settings</button>}
  {message&&<p role="status" className="mt-3 text-sm text-white">{message}</p>}
 </GlassCard>;
}
