import { z } from 'zod';
import { offlineOutcomeIntentSchema, type OfflineOutcomeIntent, type OfflineOutcomeResolution } from './offline-outcomes';
import { offlineSourceSchema, type OfflineSource } from './offline-source';
export const QUEUE_BYTES=65536, QUEUE_LIMIT=20, DEVICE_TTL=24*60*60*1000, SOURCE_TTL=12*60*60*1000;
const itemSchema=z.object({intent:offlineOutcomeIntentSchema,label:z.string().max(160),baseStatus:z.enum(['pending','completed','skipped']),phase:z.enum(['queued','attempted','conflict']),reason:z.string().max(160).optional()}).strict();
export type QueueItem=z.infer<typeof itemSchema>;
export const deviceQueueSchema=z.object({version:z.literal(1),owner:z.string().uuid(),epoch:z.string().uuid(),expiresAt:z.number().finite(),sourceAt:z.number().finite(),source:offlineSourceSchema,items:z.array(itemSchema).max(QUEUE_LIMIT)}).strict();
export type DeviceQueue=z.infer<typeof deviceQueueSchema>;
export function readQueue(raw:unknown,owner:string,now=Date.now()):DeviceQueue{
  const value=deviceQueueSchema.parse(raw);
  if(value.owner!==owner||value.source.owner!==owner||value.expiresAt<=now||value.expiresAt>now+DEVICE_TTL||
    value.sourceAt>now||new TextEncoder().encode(JSON.stringify(value)).length>QUEUE_BYTES||
    new Set(value.source.routines.map(x=>x.routineId)).size!==value.source.routines.length||
    new Set(value.items.map(x=>x.intent.routineId)).size!==value.items.length||new Set(value.items.map(x=>x.intent.requestId)).size!==value.items.length)throw new Error('Device data cannot be safely used. Clear offline data and reconnect.');
  for(const x of value.items){const i=x.intent;
    const r=value.source.routines.find(r=>r.routineId===i.routineId);
    if(!sourceMatches(value.source,i)||x.label!==r?.label||x.baseStatus!==r.status)throw new Error('Invalid device intent source');
    if(i.day!==value.source.context.day||i.timezone!==value.source.context.timezone||i.contextRevision!==value.source.context.revision||i.snapshotId!==value.source.snapshotId)throw new Error('Invalid device source');
  }
  return value;
}
export function sourceFresh(q:DeviceQueue,now=Date.now()){
  return now>=q.sourceAt&&now-q.sourceAt<SOURCE_TTL&&now<q.expiresAt&&now<Date.parse(q.source.closesAt)&&
    new Intl.DateTimeFormat('en-CA',{timeZone:q.source.context.timezone}).format(new Date(now))===q.source.context.day;
}
export function stage(q:DeviceQueue,routineId:string,desiredStatus:OfflineOutcomeIntent['desiredStatus'],requestId:string,now=Date.now()):DeviceQueue{
  readQueue(q,q.owner,now);
  if(!sourceFresh(q,now))throw new Error('This Today snapshot expired. Reconnect before editing.');
  const r=q.source.routines.find(x=>x.routineId===routineId);if(!r)throw new Error('This routine was not verified for offline edits.');
  const previous=q.items.find(x=>x.intent.routineId===routineId);
  if(previous&&previous.phase!=='queued')throw new Error('Review or resolve the original attempt before making another change.');
  const items=q.items.filter(x=>x!==previous);
  if(desiredStatus!==(previous?.baseStatus??r.status))items.push({label:r.label,baseStatus:previous?.baseStatus??r.status,phase:'queued',intent:previous?{...previous.intent,desiredStatus}:{mode:'offline-v1',requestId,day:q.source.context.day,timezone:q.source.context.timezone,contextRevision:q.source.context.revision,snapshotId:q.source.snapshotId,snapshotVersion:r.snapshotVersion,definitionVersion:r.definitionVersion,routineId,expectedRevision:r.expectedRevision,desiredStatus}});
  return readQueue({...q,items},q.owner,now);
}
export function sourceMatches(source:OfflineSource,i:OfflineOutcomeIntent,revision=i.expectedRevision,status?:string){
  const r=source.routines.find(r=>r.routineId===i.routineId);
  return source.context.day===i.day&&source.context.timezone===i.timezone&&source.context.revision===i.contextRevision&&
    source.snapshotId===i.snapshotId&&r?.snapshotVersion===i.snapshotVersion&&r.definitionVersion===i.definitionVersion&&r.expectedRevision===revision&&(!status||r.status===status);
}
export function reconciled(source:OfflineSource,i:OfflineOutcomeIntent,result:OfflineOutcomeResolution){
  if(result.state!=='confirmed'||result.reconciliation!=='current')return false;
  const r=result.receipt;
  return r.requestId===i.requestId&&r.day===i.day&&r.routineId===i.routineId&&r.status===i.desiredStatus&&
    [i.expectedRevision,i.expectedRevision+1].includes(r.revision)&&sourceMatches(source,i,r.revision,r.status);
}
