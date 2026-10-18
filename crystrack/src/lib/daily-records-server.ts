import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { dailyContextSchema, dayKeySchema, outcomeRequestSchema, readDailyWindow } from './daily-records';
import { z } from 'zod';

export type DailyClient = Awaited<ReturnType<typeof createClient>>;
export function dailyFailure(error: unknown, operation: string) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json({error:'Please refresh and check the request details.'}, {status:400});
  }
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown';
  // Never log payloads, raw SQL errors, or private note text.
  console.error('Daily record operation failed', {operation, code});
  const status = code === '40001' ? 409 : code === '42501' ? 403 : code === '22023' || code === '22007' || code === '22008' ? 400 : 503;
  return NextResponse.json({error: status === 409 ? 'This record changed or the day closed. Refresh before trying again.' : status === 403 ? 'This record is not available.' : 'Daily records are unavailable. Please try again later.'}, {status});
}
export async function dailyContext(client: DailyClient) {
  const {data,error} = await client.rpc('daily_context');
  if (error) throw error;
  return dailyContextSchema.parse(data);
}
export async function dailyWindow(client: DailyClient, from: string, to: string) {
  return readDailyWindow(async (after,revision) => {
    const {data,error} = await client.rpc('daily_read_window', {p_from:from,p_to:to,p_after:after,p_limit:31,p_data_revision:revision});
    if (error) throw error;
    return data;
  },from,to);
}
export async function setTaskOutcome(request: Request, params: {taskId:string;date:string}, action:'toggle'|'skip') {
  const client = await createClient();
  const {data:{user}} = await client.auth.getUser();
  if (!user) return NextResponse.json({error:'Unauthorized'}, {status:401});
  try {
    dayKeySchema.parse(params.date); z.string().uuid().parse(params.taskId);
    const body = outcomeRequestSchema.parse(await request.json());
    if ((action === 'toggle' && body.desiredStatus === 'skipped') || (action === 'skip' && body.desiredStatus === 'completed')) {
      return NextResponse.json({error:'Invalid task action'}, {status:400});
    }
    const {data,error} = await client.rpc('daily_set_outcome', {p_day:params.date,p_routine:params.taskId,
      p_status:body.desiredStatus,p_expected_revision:body.expectedRevision,p_request_id:body.requestId});
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) { return dailyFailure(error,'set-outcome'); }
}
