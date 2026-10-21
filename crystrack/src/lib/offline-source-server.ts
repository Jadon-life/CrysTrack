import { z } from 'zod';
import { dailyContext, type DailyClient } from './daily-records-server';
import { dailyPageSchema } from './daily-records';
import { offlineSourceSchema, OFFLINE_ROUTINE_LIMIT } from './offline-source';
const headerSchema = dailyPageSchema.shape.records.element.extend({
  id:z.string().uuid(), closes_at:z.string().datetime({offset:true}),
  routines:z.array(dailyPageSchema.shape.records.element.shape.routines.element.extend({schedule_version_id:z.string().uuid()})),
});
/** Existing owner-lock RPC token fences ALL source reads, including definition capture.
 * Version count + data revision are monotone. No new DB function, client token or privileged credential. */
export async function readOfflineSource(client:DailyClient, owner:string) {
  const ctx=await dailyContext(client);
  const call=async(name:string,args:Record<string,unknown>)=>{
    const {data,error}=await client.rpc(name,args);if(error)throw error;return data;
  };
  const args={p_from:null,p_after:null,p_limit:1,p_filter:'all',p_revision:null};
  const first=await call('daily_read_week',args);
  const token=z.string().min(1).parse(first.revision);
  const raw=await call('daily_read_window',{p_from:ctx.day,p_to:ctx.day,p_after:null,p_limit:1,p_data_revision:null});
  const record=headerSchema.parse(raw.records?.[0]);
  const sameContext=(v:unknown)=>{const parsed=dailyPageSchema.shape.context.safeParse(v);return parsed.success&&JSON.stringify(parsed.data)===JSON.stringify(ctx);};
  if(!sameContext(raw.context)||record.day_key!==ctx.day||record.timezone!==ctx.timezone||
    record.evidence!=='verified'||record.close_status!=='open'||record.expected_count!==record.routines.length||
    record.routines.length>OFFLINE_ROUTINE_LIMIT||new Set(record.routines.map(r=>r.routine_key)).size!==record.expected_count||
    record.routines.some(r=>r.legacy_conflict))throw {code:'PT409'};
  const routines=[];
  for(const r of record.routines){
    const {data:task,error:taskError}=await client.from('recurring_tasks').select('id').eq('user_id',owner).eq('id',r.routine_key).eq('active',true).is('archived_at',null).maybeSingle();
    if(taskError)throw taskError;if(!task)continue; // Retain normal online frozen-Today behavior; not offline eligible.
    const {data:version,error}=await client.from('routine_schedule_versions').select('id,enabled').eq('user_id',owner).eq('routine_key',r.routine_key).order('version',{ascending:false}).limit(1).maybeSingle();
    if(error)throw error;
    if(version?.enabled)routines.push({routineId:r.routine_key,snapshotVersion:r.schedule_version_id,definitionVersion:version.id,expectedRevision:r.revision,status:r.status,label:r.title.slice(0,160)});
  }
  const last=await call('daily_read_week',{...args,p_revision:token});
  if(last.revision!==token||!sameContext(last.context))throw {code:'PT409'};
  return offlineSourceSchema.parse({owner,context:ctx,snapshotId:record.id,closesAt:record.closes_at,routines});
}
