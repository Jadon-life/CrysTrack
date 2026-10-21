import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { crystalSettingsSchema, crystalStateSchema } from '@/lib/crystals';
const headers={'Cache-Control':'private, no-store'};
async function handle(request?:Request) {
 const client=await createClient();const {data:{user}}=await client.auth.getUser();
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 try{
  const body=request?crystalSettingsSchema.parse(await request.json()):null;
  const {data,error}=body?await client.rpc('sep28_crystal_configure',{p_enabled:body.enabled,p_revision:body.revision}):await client.rpc('sep28_crystal_state');
  if(error)throw error;
  return NextResponse.json(crystalStateSchema.parse(data),{headers});
 }catch(error){
  const code=error && typeof error==='object' && 'code' in error?String(error.code):'';
  const invalid=error instanceof SyntaxError || (error instanceof Error && error.name==='ZodError');
  return NextResponse.json({error:code==='PT409'?'Reward settings changed. Refresh and try again.':'Crystals are unavailable right now. Your activities are still yours.'},{status:code==='PT409'?409:invalid?400:503,headers});
 }
}
export async function GET(){return handle();}
export async function PUT(request:Request){return handle(request);}
