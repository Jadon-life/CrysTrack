import { createClient } from '@/lib/supabase/server';
import { dailyFailure } from '@/lib/daily-records-server';
import { dayKeySchema, noteRequestSchema } from '@/lib/daily-records';
import { NextResponse } from 'next/server';
type Props = {params:Promise<{date:string}>};
export async function GET(_request:Request,props:Props) {
 const client = await createClient();
 const {data:{user}} = await client.auth.getUser();
 if (!user) return NextResponse.json({error:'Unauthorized'},{status:401});
 try {
  const date = dayKeySchema.parse((await props.params).date);
  const {data,error} = await client.from('daily_notes').select('day_key,body,revision,updated_at').eq('user_id',user.id).eq('day_key',date).maybeSingle();
  if (error) throw error;
  return NextResponse.json(data || {day_key:date,body:'',revision:0,updated_at:null},{headers:{'Cache-Control':'private, no-store'}});
 } catch(error) { return dailyFailure(error,'read-daily-note'); }
}
export async function PUT(request:Request,props:Props) {
 const client = await createClient();
 const {data:{user}} = await client.auth.getUser();
 if (!user) return NextResponse.json({error:'Unauthorized'},{status:401});
 try {
  const date = dayKeySchema.parse((await props.params).date);
  const body = noteRequestSchema.parse(await request.json());
  const {data,error} = await client.rpc('daily_save_note',{p_day:date,p_body:body.body,p_expected_revision:body.expectedRevision});
  if (error) throw error;
  return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});
 } catch(error) { return dailyFailure(error,'save-daily-note'); }
}
