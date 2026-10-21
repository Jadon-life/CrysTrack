import { createClient } from '@/lib/supabase/server';
import { dailyFailure } from '@/lib/daily-records-server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export async function DELETE(_request: Request, props: {params: Promise<{taskId:string}>}) {
 const client = await createClient();
 const {data:{user}} = await client.auth.getUser();
 if (!user) return NextResponse.json({error:'Unauthorized'}, {status:401});
 try {
  const {taskId} = await props.params;
  z.string().uuid().parse(taskId);
  const {data,error} = await client.rpc('daily_retire_routine', {p_routine:taskId});
  if (error) throw error;
  return NextResponse.json(data);
 } catch (error) { return dailyFailure(error,'retire-routine'); }
}
