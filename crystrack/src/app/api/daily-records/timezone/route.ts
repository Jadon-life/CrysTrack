import { createClient } from '@/lib/supabase/server';
import { dailyFailure } from '@/lib/daily-records-server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
const schema = z.object({timezone:z.string().min(1).max(100),expectedRevision:z.number().int().positive()}).strict();
export async function PUT(request:Request) {
 const client = await createClient();
 const {data:{user}} = await client.auth.getUser();
 if (!user) return NextResponse.json({error:'Unauthorized'},{status:401});
 try {
  const body = schema.parse(await request.json());
  const {data,error} = await client.rpc('daily_request_timezone',{p_timezone:body.timezone,p_expected_revision:body.expectedRevision});
  if (error) throw error;
  return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});
 } catch(error) { return dailyFailure(error,'request-scheduling-timezone'); }
}
