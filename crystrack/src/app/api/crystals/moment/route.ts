import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { crystalMomentSchema } from '@/lib/crystals';
export async function POST(request:Request){
 const headers={'Cache-Control':'private, no-store'};
 const client=await createClient();const {data:{user}}=await client.auth.getUser();
 if(!user)return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 try{
  z.object({}).strict().parse(await request.json());
  const {data,error}=await client.rpc('sep28_crystal_claim_moment');if(error)throw error;
  return NextResponse.json(crystalMomentSchema.parse(data),{headers});
 }catch{return NextResponse.json({error:'Crystal moment is unavailable.'},{status:503,headers});}
}
