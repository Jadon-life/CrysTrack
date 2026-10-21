import { createClient } from '@/lib/supabase/server';
import { dailyContext, dailyFailure } from '@/lib/daily-records-server';
import { NextResponse } from 'next/server';
export async function GET() {
 const client = await createClient();
 const {data:{user}} = await client.auth.getUser();
 if (!user) return NextResponse.json({error:'Unauthorized'},{status:401});
 try { return NextResponse.json(await dailyContext(client),{headers:{'Cache-Control':'private, no-store'}}); }
 catch(error) { return dailyFailure(error,'daily-context'); }
}
