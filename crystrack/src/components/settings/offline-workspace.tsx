'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/components/layout/auth-provider';
import { isRestrictedPreview } from '@/lib/preview/mode';
import { registerCrysTrackServiceWorker } from '@/lib/push';

type VaultAPI = {
  saveSnapshot(data: unknown, passphrase: string): Promise<{savedAt: string;taskCount: number}>;
  hasVault(): Promise<boolean>;
  deleteVault(passphrase: string, owner: string): Promise<void>;
};
declare global {
  interface Window { CrysTrackOfflineVault?: VaultAPI }
}
async function loadVaultScript(): Promise<VaultAPI> {
  if (window.CrysTrackOfflineVault) return window.CrysTrackOfflineVault;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-crys-offline]');
    const script = existing || document.createElement('script');
    const done = () => resolve();
    const fail = () => reject(new Error('Offline workspace code is unavailable. Reconnect and try again.'));
    script.addEventListener('load', done, { once: true });
    script.addEventListener('error', fail, { once: true });
    if (!existing) {
      script.src = '/offline-workspace.js';
      script.async = true;
      script.dataset.crysOffline = 'true';
      document.head.appendChild(script);
    }
  });
  if (!window.CrysTrackOfflineVault) throw new Error('Offline setup is unavailable in this browser.');
  return window.CrysTrackOfflineVault;
}
async function getJSON(path: string) {
  const r = await fetch(path, {cache:'no-store', credentials:'same-origin'});
  if (!r.ok) throw new Error(r.status === 401 ? 'Sign in again to prepare offline access.' : 'Could not read the latest CrysTrack data.');
  return r.json();
}
async function shellIsReady() {
  const registration = await registerCrysTrackServiceWorker();
  await registration.update();
  for (let n=0;n<20;n++) {
    const cache = await caches.open('crystrack-public-offline-v2');
    if (await cache.match('/offline.html') && await cache.match('/offline-workspace.js')) return;
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  throw new Error('The offline pages were not installed. Check your browser storage settings and retry.');
}
export function OfflineWorkspaceControls() {
  const {user} = useAuth();
  const [passphrase, setPassphrase] = useState('');
  const [ready, setReady] = useState(false);
  const [exists, setExists] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const preview = isRestrictedPreview();
  useEffect(() => {
    if (preview || !user) return;
    let alive = true;
    void loadVaultScript().then(async api => {
      const found = await api.hasVault();
      if (alive) { setReady(true); setExists(found); }
    }).catch(e=>{if (alive) setMessage(e.message);});
    return () => {alive = false;};
  }, [preview, user?.id]);

  const prepare = async () => {
    if (!user || preview || busy) return;
    if (passphrase.length < 12) {setMessage('Choose a passphrase of at least 12 characters.');return;}
    setBusy(true);setMessage('Preparing your encrypted offline workspace…');
    const owner = user.id;
    try {
      await shellIsReady();
      const api = await loadVaultScript();
      // Each API verifies the signed-in account. Never cache its HTTP response.
      const context = await getJSON('/api/daily-records/context');
      const [profile,tasks,goals,assignments,wealth,source] = await Promise.all([
        getJSON('/api/profile'),
        getJSON('/api/tasks?date='+encodeURIComponent(context.day)),
        getJSON('/api/goals'),
        getJSON('/api/assignments'),
        getJSON('/api/wealth').catch(()=>null),
        getJSON('/api/tasks/offline/source').catch(()=>null),
      ]);
      if (!Array.isArray(tasks) || !Array.isArray(goals) || !Array.isArray(assignments))
        throw new Error('Unexpected server data. Your old offline copy was not changed.');
      if (tasks.length>200 || goals.length>200 || assignments.length>=200)
        throw new Error('This account needs paged offline export. No partial snapshot was saved.');
      if (profile?.user_id!==owner || (source && source.owner!==owner))
        throw new Error('Signed-in account changed. No offline data was saved.');
      const snapshot = {
        version:1, owner, savedAt:new Date().toISOString(), day:context.day,
        timezone:context.timezone,
        tasks:tasks.map((t: any)=>({
          id:t.id,title:String(t.title||'Untitled task').slice(0,160),
          scheduled_today:Boolean(t.scheduled_today),today_status:t.today_status,
          daily_revision:t.daily_revision,
        })),
        goals:goals.map((g: any)=>({
          id:g.id,title:String(g.title||'Untitled goal').slice(0,160),
          deadline:g.deadline,progress_value:g.progress_value,progress_mode:g.progress_mode,
        })),
        assignments:assignments.map((a:any)=>({
          id:a.id,title:String(a.title||'Untitled assignment').slice(0,160),
          deadline:a.deadline,status:a.status,computed_status:a.computed_status,
        })),
        wealth:wealth?.summary ? {summary:wealth.summary,reporting:wealth.reporting}:null,
        source:source?.context?.day===context.day ? source : null,
        pending:[],journal:[],
      };
      const saved=await api.saveSnapshot(snapshot,passphrase);
      setExists(true);
      setMessage('Offline access prepared. Saved '+saved.taskCount+' tasks securely. Open Offline Workspace to test it before turning data off.');
      setPassphrase('');
    } catch(e) {setMessage(e instanceof Error ? e.message : 'Offline setup failed. Nothing was changed.');}
    finally {setBusy(false);}
  };
  const remove = async () => {
    if (!user || preview || busy) return;
    if (!window.confirm('Remove this device’s encrypted offline workspace?')) return;
    setBusy(true);
    try {
      const api=await loadVaultScript();
      await api.deleteVault(passphrase,user.id);
      setExists(await api.hasVault());
      setPassphrase('');
      setMessage('Offline workspace removed from this device (if no pending edits were kept).');
    }catch(e){setMessage(e instanceof Error?e.message:'Could not remove the encrypted workspace.');}
    finally{setBusy(false);}
  };
  return (
    <section aria-label="Secure offline workspace" className="rounded-2xl border border-cyan-100/20 bg-cyan-950/20 p-4 space-y-3">
      <h3 className="text-lg font-semibold text-white">Offline workspace</h3>
      <p className="text-sm text-slate-200">
        Save an encrypted, passphrase-protected copy of Tasks, Goals, Assignments and Wealth summaries on this device.
        Reopen it without internet. Routine ticks can sync after reconnection when their verified snapshot remains valid;
        notes stay on this device. Goal check-ins, money edits, AI, live exchange rates and notifications still require internet.
      </p>
      <p className="text-xs text-amber-100">
        Do not forget the passphrase; CrysTrack cannot recover it. Shared device? Remove this copy when finished.
        Your main CrysTrack database is not replaced by this device snapshot.
      </p>
      <label className="block text-sm text-slate-200" htmlFor="offline-vault-password">Offline passphrase (at least 12 characters)</label>
      <input id="offline-vault-password" type="password" minLength={12} maxLength={200}
        autoComplete="new-password" value={passphrase} onChange={e=>setPassphrase(e.target.value)}
        disabled={busy||preview} placeholder="Create or enter your saved passphrase"
        className="w-full rounded-xl border border-white/20 bg-slate-950/70 p-3 text-white" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!ready||busy||preview} onClick={()=>void prepare()}
          className="min-h-11 rounded-xl border border-cyan-300/50 px-4 text-cyan-100 disabled:opacity-40">
          {busy?'Preparing…':exists?'Refresh offline copy':'Prepare offline access'}
        </button>
        <a href="/offline.html" className="inline-flex min-h-11 items-center rounded-xl border border-white/20 px-4 text-sm text-slate-100">
          Open offline workspace
        </a>
        {exists && <button type="button" disabled={busy||preview} onClick={()=>void remove()}
          className="min-h-11 rounded-xl border border-red-300/40 px-4 text-sm text-red-200 disabled:opacity-40">Remove device copy</button>}
      </div>
      {message && <p role="status" className="text-sm text-cyan-100">{message}</p>}
    </section>
  );
}
