import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  billMutationResultSchema,
  billQuerySchema,
  billWriteSchema,
  billViewSchema,
} from '@/lib/bills';
const headers = { 'Cache-Control': 'private, no-store' };
function failed(e: unknown, input = false) {
  const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : 'unknown';
  const status =
    input && (e instanceof z.ZodError || e instanceof SyntaxError)
      ? 400
      : code === 'PT409' || code === '23505'
        ? 409
        : code === '42501'
          ? 403
          : code.startsWith('22')
            ? 400
            : 503;
  console.error('Bill operation not confirmed', { code, status });
  return NextResponse.json(
    {
      error:
        status === 409
          ? 'This bill or scheduling context changed. Refresh and review before continuing.'
          : status === 400
            ? 'Please check the bill details and exact NGN amount.'
            : 'Bill records are unavailable. Payment is not confirmed; refresh before trying again.',
    },
    { status, headers },
  );
}
export async function GET(request: Request) {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  let query;
  try {
    query = billQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  } catch (e) {
    return failed(e, true);
  }
  try {
    const { data, error } = await client.rpc('wealth_bill_list', {
      p_id: query.id ?? null,
      p_page: query.page,
      p_revision: query.revision ?? null,
    });
    if (error) throw error;
    return NextResponse.json(billViewSchema.parse(data), { headers });
  } catch (e) {
    return failed(e);
  }
}
async function mutate(request: Request, creating: boolean) {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  let body;
  try {
    body = billWriteSchema.parse(await request.json());
    if (creating !== (body.action === 'create') || creating !== (body.revision === 0))
      throw new z.ZodError([]);
  } catch (e) {
    return failed(e, true);
  }
  try {
    const { data, error } = await client.rpc('wealth_bill_mutate', {
      p_action: body.action,
      p_id: body.id,
      p_revision: body.revision,
      p_request: body.requestId,
      p_timezone: body.timezone,
      p_fields: body.fields,
    });
    if (error) throw error;
    return NextResponse.json(billMutationResultSchema.parse(data), { headers });
  } catch (e) {
    return failed(e);
  }
}
export async function POST(request: Request) {
  return mutate(request, true);
}
export async function PATCH(request: Request) {
  return mutate(request, false);
}
