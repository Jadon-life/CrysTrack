/* CrysTrack offline vault v1: public code, private records are encrypted in IndexedDB.
   No API responses, auth cookies, keys or private HTML are cached by the service worker. */
(() => {
  'use strict';
  const DB = 'crystrack-secure-workspace-v1';
  const STORE = 'state';
  const RECORD = 'vault';
  const MAX_BYTES = 786432;
  const SOURCE_MS = 12 * 60 * 60 * 1000;
  const QUEUE_MS = 24 * 60 * 60 * 1000;
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  let payload = null, sessionKey = null, envelope = null;

  const to64 = (bytes) => {
    let out = '';
    for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.slice(i, i + 8192));
    return btoa(out);
  };
  const from64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const bytes = (n) => crypto.getRandomValues(new Uint8Array(n));
  async function derive(passphrase, salt) {
    if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 200)
      throw new Error('Enter your offline passphrase (12–200 characters).');
    const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},material,
      {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function openDB() {
    return new Promise((resolve,reject) => {
      const req = indexedDB.open(DB,1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error('Device storage is unavailable.'));
      req.onblocked = () => reject(new Error('Close other CrysTrack tabs and try again.'));
    });
  }
  async function readRecord() {
    const db = await openDB();
    try { return await new Promise((resolve,reject) => {
      const tx = db.transaction(STORE,'readonly'), req = tx.objectStore(STORE).get(RECORD);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(new Error('Offline vault cannot be read.'));
    }); } finally { db.close(); }
  }
  async function compareWrite(next, priorIv) {
    const db = await openDB();
    try { await new Promise((resolve,reject) => {
      const tx = db.transaction(STORE,'readwrite'), store = tx.objectStore(STORE);
      const get = store.get(RECORD);
      get.onsuccess = () => {
        if ((get.result?.iv || null) !== priorIv) { tx.abort(); return; }
        if (next) store.put(next, RECORD); else store.delete(RECORD);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(new Error('Offline vault changed in another tab. Reload and unlock again.'));
    }); } finally { db.close(); }
  }
  async function openEncrypted(record, key) {
    if (!record || record.version !== 1 || typeof record.ciphertext !== 'string' ||
        record.ciphertext.length > MAX_BYTES * 2) throw new Error('Missing or invalid offline vault.');
    try {
      const plaintext = await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(record.iv)},
        key,from64(record.ciphertext));
      const obj = JSON.parse(decoder.decode(plaintext));
      if (!obj || obj.version !== 1 || typeof obj.owner !== 'string' ||
          !Array.isArray(obj.tasks) || !Array.isArray(obj.goals) ||
          !Array.isArray(obj.assignments) || !Array.isArray(obj.pending) ||
          !Array.isArray(obj.journal)) throw new Error('Invalid saved data');
      return obj;
    } catch { throw new Error('Passphrase is incorrect or the saved data is damaged. Nothing was deleted.'); }
  }
  async function seal(obj,key,salt,oldIv) {
    const raw = encoder.encode(JSON.stringify(obj));
    if (raw.byteLength > MAX_BYTES) throw new Error('Offline workspace is full. Sync or remove notes first.');
    const iv = bytes(12);
    const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv},key,raw);
    const next = {version:1,salt:to64(salt),iv:to64(iv),ciphertext:to64(new Uint8Array(ciphertext))};
    await compareWrite(next, oldIv);
    return next;
  }
  async function saveSnapshot(data,passphrase) {
    if (!crypto?.subtle || !indexedDB) throw new Error('This browser cannot keep an encrypted offline workspace.');
    if (!data || data.version !== 1 || typeof data.owner !== 'string') throw new Error('Invalid account snapshot.');
    const old = await readRecord();
    const salt = old ? from64(old.salt) : bytes(16);
    const key = await derive(passphrase,salt);
    let journal = [];
    if (old) {
      const previous = await openEncrypted(old,key);
      if (previous.owner !== data.owner) throw new Error('This offline vault belongs to another account. Clear it with its passphrase first.');
      if (previous.pending.length) throw new Error('Offline routine changes are pending. Open your Offline Workspace and sync or review them first.');
      journal = previous.journal;
    }
    const next = {...data,version:1,pending:[],journal};
    await seal(next,key,salt,old?.iv || null);
    return {savedAt:next.savedAt,taskCount:next.tasks.length};
  }
  async function hasVault() { return Boolean(await readRecord()); }
  async function deleteVault(passphrase,owner) {
    const record = await readRecord();
    if (!record) return;
    const key = await derive(passphrase,from64(record.salt));
    const data = await openEncrypted(record,key);
    if (owner && data.owner !== owner) throw new Error('This device vault belongs to another account.');
    if (data.pending.length && !window.confirm('Delete unsynced routine changes from this device? They cannot be recovered.')) return;
    await compareWrite(null,record.iv);
    payload = null; sessionKey = null; envelope = null;
  }
  window.CrysTrackOfflineVault = { saveSnapshot, hasVault, deleteVault };

  // Only render the standalone, public offline fallback; never expose an online page's records.
  if (!document.querySelector('[data-crystrack-offline-workspace]')) return;
  const $ = (id) => document.getElementById(id);
  const state = $('offline-state');
  const info = $('offline-info');
  const body = $('offline-content');
  const unlockForm = $('unlock-form');
  const actions = $('offline-actions');
  const tabNames = ['Tasks','Goals','Assignments','Wealth','Notes'];
  let activeTab = 'Tasks',busy=false;

  function notice(message,problem=false) {
    state.textContent = message;
    state.style.color = problem ? '#ffc5c5' : '#b7efdd';
  }
  function element(tag,text,cls) {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = String(text);
    if (cls) e.className = cls;
    return e;
  }
  function button(label,click,disabled=false) {
    const b = element('button',label,'offline-button');
    b.type='button'; b.disabled=disabled; b.addEventListener('click',click); return b;
  }
  function dayInZone(timezone) {
    const parts = new Intl.DateTimeFormat('en-US',{timeZone:timezone||'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const v = (type) => parts.find(x=>x.type===type)?.value;
    return [v('year'),v('month'),v('day')].join('-');
  }
  function freshness() {
    const source = payload?.source;
    if (!source || !source.context || !source.context.day) return false;
    const now=Date.now();
    return now-Date.parse(payload.savedAt)<SOURCE_MS &&
      now<Date.parse(source.closesAt) && now<Date.parse(payload.savedAt)+QUEUE_MS &&
      dayInZone(source.context.timezone)===source.context.day &&
      payload.day===source.context.day;
  }
  async function persist() {
    if (!payload || !sessionKey || !envelope) throw new Error('Unlock again before changing offline data.');
    const next=await seal(payload,sessionKey,from64(envelope.salt),envelope.iv);
    envelope=next;
  }
  function row(title,detail) {
    const line = element('div',undefined,'offline-row');
    line.append(element('strong',title));
    if (detail) line.append(element('small',detail));
    return line;
  }
  function render() {
    if (!payload) return;
    unlockForm.hidden=true;actions.hidden=false;body.replaceChildren();
    info.textContent='Saved: '+new Date(payload.savedAt).toLocaleString()+
      ' · Current data may have changed on the server. Offline edits are NOT confirmed.';
    const nav=element('nav',undefined,'offline-tabs');
    for (const name of tabNames) {
      const tab=button(name,()=>{activeTab=name;render();});
      tab.setAttribute('aria-pressed',String(activeTab===name));
      nav.append(tab);
    }
    body.append(nav);
    const heading=element('h2',activeTab);body.append(heading);
    const content=element('section',undefined,'offline-list');body.append(content);
    if (activeTab==='Tasks') {
      if (!payload.tasks.length) content.append(element('p','No saved tasks.'));
      const source=payload.source;
      for (const task of payload.tasks) {
        const pending=payload.pending.find(x=>x.intent.routineId===task.id);
        const status=pending ? pending.intent.desiredStatus : task.today_status||'pending';
        const line=row(task.title,(task.scheduled_today?'Today · ':'Not scheduled today · ')+
          status+(pending?' · PENDING, NOT SYNCED':''));
        const routine=source?.routines?.find(x=>x.routineId===task.id);
        if (routine && task.scheduled_today && freshness() && !pending?.phase?.startsWith('attempted') && pending?.phase!=='conflict') {
          const choices=element('div',undefined,'offline-row-actions');
          for (const opt of ['completed','skipped','pending']) {
            const b=button(opt,async()=>{
              try { await queueRoutine(task.id,opt);render();notice('Saved on device only. Sync when online.'); }
              catch(e){notice(e.message||'Could not save the change.',true);}
            },busy||status===opt);
            choices.append(b);
          }
          line.append(choices);
        }
        if(pending?.phase==='conflict')line.append(element('small','Conflict: review this routine online.'));
        content.append(line);
      }
      if(!freshness())content.prepend(element('p','Routine edits are unavailable because today’s verified snapshot expired or changed. Saved tasks remain readable.'));
    } else if (activeTab==='Goals') {
      if(!payload.goals.length)content.append(element('p','No saved goals.'));
      for(const g of payload.goals) {
        let detail='Progress: '+String(g.progress_value??'not recorded');
        if(g.deadline)detail+=' · Due: '+new Date(g.deadline).toLocaleDateString();
        content.append(row(g.title,detail));
      }
      content.append(element('p','Goal check-ins and AI analysis need internet verification. Use Notes to draft a reflection.'));
    } else if(activeTab==='Assignments'){
      if(!payload.assignments.length)content.append(element('p','No saved assignments.'));
      for(const a of payload.assignments)content.append(row(a.title,'Due: '+new Date(a.deadline).toLocaleString()+' · '+(a.computed_status||a.status||'pending')));
    } else if(activeTab==='Wealth'){
      const w=payload.wealth;
      if(!w?.summary){content.append(element('p','No saved Wealth summary.'));return;}
      for(const [label,key] of [['Available balance','availableBalance'],['Saved','savedBalance'],['Monthly income','monthIncome'],['Monthly expenses','monthExpenses'],['Safe to spend','safeToSpend']]){
        content.append(row(label,'₦'+String(w.summary[key]??'—')));
      }
      content.append(element('p','This is a saved snapshot, NOT a live balance. No new financial transactions can be verified offline.'));
    }else{
      const form=element('form',undefined,'offline-note-form');
      const input=element('textarea');input.placeholder='Write a study note, idea, or goal reflection…';
      input.maxLength=2000;input.required=true;
      form.append(input);
      const submit=element('button','Save note on device','offline-button');submit.type='submit';form.append(submit);
      form.addEventListener('submit',async(e)=>{
        e.preventDefault();if(!input.value.trim())return;
        try{
          if(payload.journal.length>=100)throw new Error('Limit reached. Remove older notes first.');
          payload.journal.unshift({id:crypto.randomUUID(),text:input.value.trim(),createdAt:new Date().toISOString()});
          await persist();notice('Note saved on this device. Notes are NOT uploaded to CrysTrack.');render();
        }catch(err){notice(err.message,true);}
      });
      content.append(form);
      for(const n of payload.journal){
        const line=row(new Date(n.createdAt).toLocaleString(),n.text);
        line.append(button('Delete note',async()=>{if(!confirm('Delete this device note?'))return;payload.journal=payload.journal.filter(x=>x.id!==n.id);await persist();render();}));
        content.append(line);
      }
    }
  }
  async function queueRoutine(id,desiredStatus) {
    if (!freshness()) throw new Error('Today’s verified snapshot expired. Reconnect first.');
    const source=payload.source;
    const r=source.routines.find(x=>x.routineId===id);
    if (!r) throw new Error('This task is not eligible for offline editing.');
    const previous=payload.pending.find(x=>x.intent.routineId===id);
    if (previous && previous.phase!=='queued') throw new Error('A prior sync attempt needs review.');
    const baseStatus=previous?.baseStatus||r.status;
    payload.pending=payload.pending.filter(x=>x!==previous);
    if(desiredStatus!==baseStatus){
      if(payload.pending.length>=20)throw new Error('Offline routine limit reached (20).');
      const intent=previous?.intent||{
        mode:'offline-v1',requestId:crypto.randomUUID(),day:source.context.day,
        timezone:source.context.timezone,contextRevision:source.context.revision,
        snapshotId:source.snapshotId,snapshotVersion:r.snapshotVersion,
        definitionVersion:r.definitionVersion,routineId:id,expectedRevision:r.expectedRevision,
        desiredStatus
      };
      payload.pending.push({phase:'queued',baseStatus,label:r.label,intent:{...intent,desiredStatus}});
    }
    await persist();
  }
  function matches(source,i) {
    const row=source?.routines?.find(x=>x.routineId===i.routineId);
    return source?.context?.day===i.day && source?.context?.timezone===i.timezone &&
      source?.context?.revision===i.contextRevision && source?.snapshotId===i.snapshotId &&
      row?.snapshotVersion===i.snapshotVersion && row?.definitionVersion===i.definitionVersion &&
      row?.expectedRevision===i.expectedRevision;
  }
  async function requestJSON(url,init={}) {
    const response=await fetch(url,{...init,cache:'no-store',credentials:'same-origin',redirect:'error'});
    let data;
    try {data=await response.json();} catch {throw new Error('Server reply is uncertain. Retry later.');}
    if(!response.ok)throw new Error(response.status===401?'Sign in to CrysTrack online before syncing.':
      response.status===409?'Conflict: routine or day changed. Review it online.':
      'Server has not confirmed the operation. No result assumed.');
    return data;
  }
  async function currentSource() {
    const data=await requestJSON('/api/tasks/offline/source');
    if(data.owner!==payload.owner)throw new Error('Different signed-in account. Nothing was sent.');
    return data;
  }
  async function actionRequest(operation,intent) {
    const d=await requestJSON('/api/tasks/offline/'+operation,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(intent)
    });
    if(d.state!=='not-found'&&d.state!=='confirmed')throw new Error('Unknown server receipt; keep the original attempt.');
    if(d.state==='confirmed' && (
      d.receipt?.requestId!==intent.requestId || d.receipt?.day!==intent.day ||
      d.receipt?.routineId!==intent.routineId || d.receipt?.status!==intent.desiredStatus
    ))throw new Error('Receipt mismatch. Manual review required.');
    return d;
  }
  async function sync() {
    if(!payload||!sessionKey||busy)return;
    busy=true;notice('Checking your signed-in account and saved routine versions…');render();
    try {
      // Do not trust navigator.onLine. The authenticated source is authoritative.
      let source=await currentSource();
      for(const item of [...payload.pending]){
        if(item.phase==='conflict')continue;
        const i=item.intent;
        try{
          let result = item.phase==='attempted' ? await actionRequest('receipt',i) : null;
          if(!result || result.state==='not-found'){
            if(!matches(source,i))throw new Error('Conflict: saved day, timezone or routine version changed.');
            // Persist original request and attempted marker BEFORE any possible write.
            item.phase='attempted';await persist();
            result=await actionRequest('replay',i);
          }
          if(result.state!=='confirmed')throw new Error('No confirmed receipt yet.');
          source=await currentSource();
          const next=source.routines.find(x=>x.routineId===i.routineId);
          if(source.context.day!==i.day || next?.status!==i.desiredStatus ||
              next.expectedRevision!==result.receipt.revision)
            throw new Error('Receipt needs manual review; saved record was not assumed current.');
          payload.pending=payload.pending.filter(x=>x.intent.requestId!==i.requestId);
          const task=payload.tasks.find(x=>x.id===i.routineId);
          if(task){task.today_status=i.desiredStatus;task.daily_revision=next.expectedRevision;}
          payload.source=source;await persist();
        }catch(e) {
          if(String(e?.message||'').startsWith('Conflict:')||String(e?.message||'').includes('manual review')){
            item.phase='conflict';item.reason=String(e.message).slice(0,160);await persist();
            continue;
          }
          throw e;
        }
      }
      notice(payload.pending.length?'Some edits need manual review. Other edits were confirmed.':'All queued routine edits were confirmed by the server.');
    }catch(e){notice((e?.message||'Connection uncertain. Please retry later.')+' The pending changes stay encrypted.',true);}
    finally{busy=false;render();}
  }
  async function unlock(passphrase) {
    const record=await readRecord();
    if(!record)throw new Error('No offline workspace saved yet. Connect to the internet and set it up in CrysTrack Settings.');
    const key=await derive(passphrase,from64(record.salt));
    const data=await openEncrypted(record,key);
    payload=data;sessionKey=key;envelope=record;notice('Offline workspace unlocked.');render();
  }
  unlockForm.addEventListener('submit',async(e)=>{
    e.preventDefault();
    const p=$('offline-passphrase').value;
    try{await unlock(p);$('offline-passphrase').value='';}
    catch(err){notice(err.message||'Unable to unlock.',true);}
  });
  $('offline-sync').addEventListener('click',()=>void sync());
  $('offline-lock').addEventListener('click',()=>{payload=null;sessionKey=null;envelope=null;actions.hidden=true;body.replaceChildren();unlockForm.hidden=false;notice('Locked.');});
  $('offline-open-online').href='/';
  hasVault().then(v=>notice(v?'Enter your offline passphrase to open CrysTrack.':'Set up offline access in CrysTrack Settings while connected.')).catch(()=>notice('Device storage is unavailable.',true));
})();
