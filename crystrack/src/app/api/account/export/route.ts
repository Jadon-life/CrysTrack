import { NextResponse } from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {isRestrictedPreview} from '@/lib/preview/mode';
import {aiJson,readAiPrivacy} from '@/lib/ai/privacy-server';
import {exportRequestSchema,validateSnapshot,makeArchive,MAX_EXPORT_BYTES} from '@/lib/account-export/format';
export const dynamic='force-dynamic';
export const maxDuration=30;
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; sandbox"};
export async function POST(request:Request){
  if(isRestrictedPreview())return NextResponse.json({error:'Account export is unavailable in the synthetic demo.'},{status:403,headers});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000),abort=()=>controller.abort();request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)controller.abort();
  let status=503,code='UNAVAILABLE';
  const bounded=<T,>(promise:PromiseLike<T>):Promise<T>=>new Promise((resolve,reject)=>{const fail=()=>reject(Error('ABORT'));if(controller.signal.aborted){fail();return;}controller.signal.addEventListener('abort',fail,{once:true});Promise.resolve(promise).then(resolve,reject).finally(()=>controller.signal.removeEventListener('abort',fail));});
  try{
    const client=await createClient(),{data:{user},error}=await bounded(client.auth.getUser());
    if(error||!user){status=401;code='AUTH';throw Error(code);}
    let body;try{body=exportRequestSchema.parse(await bounded(aiJson(request)));}catch{status=400;code='INPUT';throw Error(code);}
    const privacy=body.categories.includes('ai')?await bounded(readAiPrivacy(client)):null;
    if(privacy&&!privacy.enabled){status=403;code='AI_OFF';throw Error(code);}
    const{data,error:readError}=await client.rpc('account_export_snapshot_v1',{p_categories:body.categories,p_counts_only:body.mode==='review',p_ai_revision:privacy?.revision??null}).abortSignal(controller.signal);
    if(readError){if(readError.code==='54000'){status=413;code='SIZE';}else if(readError.code==='PT409'){status=409;code='CHANGED';}throw Error(code);}
    const snapshot=validateSnapshot(data,user.id,body.categories,body.mode==='review');
    const bytes=body.mode==='download'?new TextEncoder().encode(JSON.stringify(await makeArchive(snapshot))):null;
    if(bytes&&bytes.byteLength>MAX_EXPORT_BYTES){status=413;code='SIZE';throw Error(code);}
    const{data:{user:current},error:authError}=await bounded(client.auth.getUser());
    if(authError||!current||current.id!==user.id){status=401;code='AUTH';throw Error(code);}
    if(privacy){const now=await bounded(readAiPrivacy(client));if(!now.enabled||now.revision!==privacy.revision){status=409;code='CHANGED';throw Error(code);}}
    if(controller.signal.aborted)throw Error('ABORT');
    if(body.mode==='review')return NextResponse.json(snapshot,{headers});
    if(!bytes)throw Error('EXPORT_BYTES');
    return new NextResponse(bytes,{headers:{...headers,'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="crystrack-account-v1.json"','Content-Length':String(bytes.byteLength)}});
  }catch{
    console.error('Account export not confirmed',{code});
    return NextResponse.json({code,error:code==='AUTH'?'Sign in again before exporting.':code==='AI_OFF'?'AI history requires current AI consent. You can export other categories without enabling AI.':code==='CHANGED'?'AI permission changed. Review your selection and try again.':code==='SIZE'?'This selection is too large. Choose fewer categories; no partial archive was created.':code==='INPUT'?'Review the export request.':'The export could not be verified. No archive was created. Try again when online.'},{status,headers});
  }finally{clearTimeout(timer);request.signal.removeEventListener('abort',abort);}
}
