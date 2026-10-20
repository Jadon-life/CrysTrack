import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readOfflineSource } from '@/lib/offline-source-server';
import { dailyFailure } from '@/lib/daily-records-server';
export async function GET() {
  const headers={'Cache-Control':'private, no-store'};
  const client=await createClient();const {data:{user},error}=await client.auth.getUser();
  if(error||!user)return NextResponse.json({error:'Unauthorized'},{status:401,headers});
  try{return NextResponse.json(await readOfflineSource(client,user.id),{headers});}
  catch(error){const response=dailyFailure(error,'offline-source');response.headers.set('Cache-Control',headers['Cache-Control']);return response;}
}
