import { z } from 'zod';
import catalog from './catalog.json';
import columnTypes from './column-types.json';
export const EXPORT_VERSION = 'crystrack-account/v1' as const;
export const MAX_EXPORT_BYTES = 12 * 1024 * 1024;
export const categorySchema = z.enum(['tasks', 'assignments', 'goals', 'wealth', 'settings', 'history', 'ai']);
export type ExportCategory = z.infer<typeof categorySchema>;
export const categoryLabels: Record<ExportCategory,string> = {
  tasks:'Tasks, daily notes & verified history', assignments:'Assignments', goals:'Goals & check-ins',
  wealth:'Wealth & financial provenance', settings:'Profile, preferences & reminder metadata',
  history:'Activity & Crystal receipts', ai:'Current-consent AI conversations',
};
const categories = z.array(categorySchema).min(1).max(7).refine(v=>new Set(v).size===v.length);
export const exportRequestSchema = z.discriminatedUnion('mode',[
  z.object({mode:z.literal('review'),categories}).strict(),
  z.object({mode:z.literal('download'),categories,confirm:z.literal('EXPORT_PRIVATE_INFORMATION')}).strict(),
]);
export const exclusions = [
  'Not a complete account backup; no automatic restore is provided.',
  'Auth identities, credentials, tokens, password hashes, push subscriptions and Telegram connections/keys are excluded.',
  'Device storage, unsynchronized offline intents, caches, device opt-in and internal mutation/receipt/lease metadata are excluded.',
  'Avatar assets/URLs, opaque config/activity/notification payloads/errors and original bank files/CSV reviewed-row payloads are excluded.',
  'Activity/reminder polymorphic entity_id links are excluded: target ownership cannot always be proved after deletion. Owner-held event IDs, types and times remain included.',
  'AI-generated insights and embedded analyses, provider/system prompts and raw external requests are excluded.',
  'AI conversations/messages are limited to trusted stored provenance at the current enabled consent revision; revoked/deleted/unproven/older-revision messages are excluded.',
  'Legacy child records without a provable owner-parent are excluded. Deleted records cannot be reconstructed.',
  'Open and incomplete daily records are not verified closed-day history. No new day recovery, closure or reward calculation is performed.',
];
const countSchema=z.object({rows:z.number().int().nonnegative().max(10000),projectedBytes:z.number().int().nonnegative().max(8388608)}).strict();
export const snapshotSchema=z.object({owner:z.string().uuid(),snapshotAt:z.string().datetime({offset:true}),savedTimezone:z.string().nullable(),categories,
  counts:z.record(z.string(),countSchema),data:z.record(z.string(),z.array(z.record(z.string(),z.unknown())).max(10000)),aiRevision:z.number().int().nonnegative().nullable()}).strict();
export type ExportSnapshot=z.infer<typeof snapshotSchema>;
export type ExportManifest={version:typeof EXPORT_VERSION;createdAt:string;snapshotAt:string;savedTimezone:string|null;owner:string;categories:ExportCategory[];currency:'NGN';unselectedCategories:ExportCategory[];
  completeWithinDeclaredScope:true;restorableBackup:false;exclusions:string[];categoryRows:Record<string,number>;provenance:string;projectionSha256:string;datasets:Record<string,{rows:number;bytes:number;sha256:string}>;aiRevision:number|null};
export type AccountArchive={manifest:ExportManifest;manifestSha256:string;data:ExportSnapshot['data']};
export async function sha256(text:string){const bytes=new TextEncoder().encode(text);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export function validateSnapshot(raw:unknown,owner:string,selected:ExportCategory[],countsOnly=false){
  const s=snapshotSchema.parse(raw);
  if(s.owner!==owner||JSON.stringify(s.categories)!==JSON.stringify(selected))throw Error('EXPORT_SCOPE');
  if(s.savedTimezone!==null){try{new Intl.DateTimeFormat('en',{timeZone:s.savedTimezone});}catch{throw Error('EXPORT_TIMEZONE');}}
  const specs=catalog.filter(x=>selected.includes(x.category as ExportCategory));
  const names=specs.map(x=>x.table).sort();
  if(JSON.stringify(Object.keys(s.counts).sort())!==JSON.stringify(names)||JSON.stringify(Object.keys(s.data).sort())!==JSON.stringify(countsOnly?[]:names))throw Error('EXPORT_COVERAGE');
  let total=0,bytes=0;
  for(const d of specs){const c=s.counts[d.table];total+=c.rows;bytes+=c.projectedBytes;if(countsOnly)continue;
    const rows=s.data[d.table];if(rows.length!==c.rows)throw Error('EXPORT_COUNT');
    const ids=new Set<string>();
    for(const row of rows){if(JSON.stringify(Object.keys(row).sort())!==JSON.stringify([...d.columns].sort()))throw Error('EXPORT_FIELDS');
      if('user_id'in row&&row.user_id!==owner)throw Error('EXPORT_OWNER');
      for(const [key,value]of Object.entries(row)){
        if(key==='schedule')z.array(z.object({weekday:z.number().int().min(0).max(6),start:z.union([z.string().datetime({offset:true}),z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).nullable(),end:z.union([z.string().datetime({offset:true}),z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).nullable()}).strict()).max(1000).parse(value);
        const kind=(columnTypes as Record<string,Record<string,string>>)[d.table]?.[key];
        if(!kind)throw Error('EXPORT_COLUMN_TYPE');
        if(value===null)continue;
        if(kind==='uuid')z.string().uuid().parse(value);
        else if(kind==='timestamp with time zone')z.string().datetime({offset:true}).parse(value);
        else if(kind==='date')z.string().date().parse(value);
        else if(kind==='integer')z.number().int().min(-2147483648).max(2147483647).parse(value);
        else if(kind==='boolean')z.boolean().parse(value);
        else if(kind==='ARRAY')z.array(z.string().nullable()).max(1000).parse(value);
        else if(kind!=='jsonb')z.string().parse(value);
      }
      if(d.order.some(k=>row[k]===null||row[k]===undefined))throw Error('EXPORT_ID');
      for(const field of d.decimals){const v=row[field];if(v!==null&&(typeof v!=='string'||! /^-?\d+(?:\.\d+)?$/.test(v)))throw Error('EXPORT_DECIMAL');}
      const id=JSON.stringify(d.order.map(k=>row[k]));if(ids.has(id))throw Error('EXPORT_DUPLICATE');ids.add(id);
    }
  }
  if(!countsOnly&&selected.includes('ai')){
    const conversations=new Set(s.data.ai_conversations.map(r=>r.id));
    if(s.data.ai_messages.some(r=>!conversations.has(r.conversation_id)))throw Error('EXPORT_AI_RELATION');
  }
  if(!countsOnly&&selected.includes('tasks')){
    const headers=new Map(s.data.daily_records.map(r=>[r.day_key,r])),versions=new Map(s.data.routine_schedule_versions.map(r=>[r.id,r]));
    const perDay=new Map<unknown,number>();
    for(const row of s.data.daily_routine_records){const version=versions.get(row.schedule_version_id);if(!headers.has(row.day_key)||!version||version.routine_key!==row.routine_key)throw Error('EXPORT_DAILY_RELATION');perDay.set(row.day_key,(perDay.get(row.day_key)??0)+1);}
    for(const row of s.data.daily_records)if(row.evidence==='verified'&&row.expected_count!==(perDay.get(row.day_key)??0))throw Error('EXPORT_DAILY_COUNT');
  }
  if(total>25000||bytes>8388608)throw Error('EXPORT_SIZE');
  if(selected.includes('ai')?s.aiRevision===null:s.aiRevision!==null)throw Error('EXPORT_AI_SCOPE');
  return s;
}
export function categoryRows(s:ExportSnapshot){return Object.fromEntries(s.categories.map(category=>[category,catalog.filter(d=>d.category===category).reduce((n,d)=>n+s.counts[d.table].rows,0)]));}
export async function makeArchive(s:ExportSnapshot):Promise<AccountArchive>{
  const datasets:ExportManifest['datasets']={};
  for(const [name,rows]of Object.entries(s.data)){const text=JSON.stringify(rows);datasets[name]={rows:rows.length,bytes:new TextEncoder().encode(text).length,sha256:await sha256(text)};}
  const manifest:ExportManifest={version:EXPORT_VERSION,createdAt:new Date().toISOString(),snapshotAt:s.snapshotAt,savedTimezone:s.savedTimezone,owner:s.owner,categories:s.categories,currency:'NGN',unselectedCategories:categorySchema.options.filter(c=>!s.categories.includes(c)),
    completeWithinDeclaredScope:true,restorableBackup:false,exclusions:[...exclusions],categoryRows:categoryRows(s),provenance:'CrysTrack Sep28 authenticated PostgreSQL statement snapshot / projection v1',projectionSha256:await sha256(JSON.stringify(catalog)),datasets,aiRevision:s.aiRevision};
  return{manifest,manifestSha256:await sha256(JSON.stringify(manifest)),data:s.data};
}
export async function verifyArchive(raw:unknown,owner:string,selected:ExportCategory[]):Promise<AccountArchive>{
  // Exact shape, version and immutable manifest content; reject malformed or partially received documents.
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('EXPORT_DOCUMENT');
  const a=raw as AccountArchive;
  if(JSON.stringify(Object.keys(a).sort())!==JSON.stringify(['data','manifest','manifestSha256']))throw Error('EXPORT_DOCUMENT');
  const m=z.object({version:z.literal(EXPORT_VERSION),createdAt:z.string().datetime({offset:true}),snapshotAt:z.string().datetime({offset:true}),savedTimezone:z.string().nullable(),owner:z.string().uuid(),categories,currency:z.literal('NGN'),unselectedCategories:z.array(categorySchema),
    completeWithinDeclaredScope:z.literal(true),restorableBackup:z.literal(false),exclusions:z.array(z.string()),categoryRows:z.record(z.string(),z.number().int().nonnegative().max(25000)),provenance:z.literal('CrysTrack Sep28 authenticated PostgreSQL statement snapshot / projection v1'),projectionSha256:z.string().regex(/^[a-f0-9]{64}$/),datasets:z.record(z.string(),z.object({rows:z.number().int().nonnegative().max(10000),bytes:z.number().int().nonnegative().max(MAX_EXPORT_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict()),aiRevision:z.number().int().nonnegative().nullable()}).strict().parse(a.manifest);
  if(!m||m.version!==EXPORT_VERSION||m.restorableBackup!==false||m.completeWithinDeclaredScope!==true||JSON.stringify(m.exclusions)!==JSON.stringify(exclusions)
    ||!m.datasets||await sha256(JSON.stringify(m))!==a.manifestSha256)throw Error('EXPORT_MANIFEST');
  const counts:ExportSnapshot['counts']={};
  for(const [name,rows]of Object.entries(a.data)){const text=JSON.stringify(rows),c=m.datasets[name];if(!c||c.rows!==rows.length||c.bytes!==new TextEncoder().encode(text).length||c.sha256!==await sha256(text))throw Error('EXPORT_CHECKSUM');counts[name]={rows:c.rows,projectedBytes:c.bytes};}
  if(JSON.stringify(Object.keys(m.datasets).sort())!==JSON.stringify(Object.keys(a.data).sort()))throw Error('EXPORT_COVERAGE');
  const verified=validateSnapshot({owner:m.owner,snapshotAt:m.snapshotAt,savedTimezone:m.savedTimezone,categories:m.categories,counts,data:a.data,aiRevision:m.aiRevision},owner,selected);
  if(JSON.stringify(m.unselectedCategories)!==JSON.stringify(categorySchema.options.filter(c=>!selected.includes(c))))throw Error('EXPORT_SCOPE');
  if(m.projectionSha256!==await sha256(JSON.stringify(catalog))||JSON.stringify(m.categoryRows)!==JSON.stringify(categoryRows(verified)))throw Error('EXPORT_PROVENANCE');
  return a;
}
export async function readArchive(response:Response,signal:AbortSignal){
  const reader=response.body?.getReader();if(!reader)throw Error('EXPORT_STREAM');
  const buffer=new Uint8Array(MAX_EXPORT_BYTES);let size=0;
  const abort=()=>void reader.cancel();signal.addEventListener('abort',abort,{once:true});
  try{for(;;){if(signal.aborted)throw Error('EXPORT_CANCELLED');const{done,value}=await reader.read();if(done)break;if(size+value.byteLength>MAX_EXPORT_BYTES){await reader.cancel();throw Error('EXPORT_SIZE');}buffer.set(value,size);size+=value.byteLength;}if(signal.aborted)throw Error('EXPORT_CANCELLED');
    const length=response.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||(!response.headers.get('content-encoding')&&Number(length)!==size)))throw Error('EXPORT_INCOMPLETE');
    const blob=new Blob([buffer.slice(0,size)],{type:'application/json;charset=utf-8'});return{blob,raw:JSON.parse(await blob.text())};
  }finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
}
