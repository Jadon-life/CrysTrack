import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  budgetQuerySchema,
  budgetViewSchema,
  budgetSetSchema,
  budgetRemoveSchema,
} from '@/lib/budgets';
const headers = { 'Cache-Control': 'private, no-store' };
function failure(error: unknown, input = false) {
  const code =
    error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown';
  const status =
    input && (error instanceof z.ZodError || error instanceof SyntaxError)
      ? 400
      : code === 'PT409' || code === '23505'
        ? 409
        : code === '42501'
          ? 403
          : code === '22023'
            ? 400
            : 503;
  console.error('Budget operation unavailable', { code, status });
  return NextResponse.json(
    {
      error:
        status === 409
          ? 'This budget or month changed. Refresh and review before trying again.'
          : status === 400
            ? 'Please check the category, month and exact NGN limit.'
            : 'Budgets are unavailable. Your financial records have not been changed by this request; refresh before retrying.',
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
    query = budgetQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  } catch (e) {
    return failure(e, true);
  }
  try {
    const { data, error } = await client.rpc('wealth_budget_month', {
      p_month: query.month ?? null,
    });
    if (error) throw error;
    return NextResponse.json(budgetViewSchema.parse(data), { headers });
  } catch (e) {
    return failure(e);
  }
}
async function mutate(request: Request, action: 'set' | 'remove', create = false) {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  let body;
  try {
    body = (action === 'set' ? budgetSetSchema : budgetRemoveSchema).parse(await request.json());
    if ((create && body.revision !== 0) || (!create && body.revision === 0))
      return NextResponse.json(
        { error: 'Refresh before changing this budget' },
        { status: 400, headers },
      );
  } catch (e) {
    return failure(e, true);
  }
  try {
    const { data, error } = await client.rpc('wealth_budget_mutate', {
      p_action: action,
      p_month: body.month,
      p_category: body.category,
      p_limit: 'limit' in body ? body.limit : null,
      p_revision: body.revision,
      p_request_id: body.requestId,
      p_timezone: body.timezone,
    });
    if (error) throw error;
    return NextResponse.json(
      z
        .object({
          id: z.string().uuid(),
          revision: z.number().int().positive(),
          active: z.boolean(),
          requestId: z.string().uuid(),
        })
        .parse(data),
      { headers },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  return mutate(request, 'set', true);
}
export async function PATCH(request: Request) {
  return mutate(request, 'set');
}
export async function DELETE(request: Request) {
  return mutate(request, 'remove');
}
