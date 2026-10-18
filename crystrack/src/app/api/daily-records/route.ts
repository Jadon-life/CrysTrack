import { createClient } from '@/lib/supabase/server';
import { dailyWindow, dailyFailure } from '@/lib/daily-records-server';
import { NextResponse } from 'next/server';
export async function GET(request: Request) {
 const client = await createClient();
 const {data:{user}} = await client.auth.getUser();
 if (!user) return NextResponse.json({error:'Unauthorized'},{status:401});
 try {
  const params = new URL(request.url).searchParams;
  const data = await dailyWindow(client,params.get('from') || '',params.get('to') || '');
  return NextResponse.json({snapshots:data.snapshots,context:data.context},{headers:{'Cache-Control':'private, no-store'}});
 } catch(error) { return dailyFailure(error,'read-daily-window'); }
}
