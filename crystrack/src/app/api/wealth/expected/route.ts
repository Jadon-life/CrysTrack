import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DIRECTIONS = new Set(['income', 'expense']);
const FREQUENCIES = new Set(['one_off', 'weekly', 'monthly', 'quarterly', 'yearly', 'irregular']);

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const title = String(body.title || '').trim();
  const direction = String(body.direction || '');
  const frequency = String(body.frequency || 'monthly');
  const amountMin = Number(body.amountMin);
  const amountMax = body.amountMax === '' || body.amountMax == null ? null : Number(body.amountMax);

  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  if (!DIRECTIONS.has(direction)) return NextResponse.json({ error: 'Direction must be income or expense' }, { status: 400 });
  if (!FREQUENCIES.has(frequency)) return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 });
  if (!Number.isFinite(amountMin) || amountMin <= 0) return NextResponse.json({ error: 'Minimum amount must be greater than zero' }, { status: 400 });
  if (amountMax != null && (!Number.isFinite(amountMax) || amountMax < amountMin)) {
    return NextResponse.json({ error: 'Maximum amount must be at least the minimum amount' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('wealth_expected_flows')
    .insert({
      user_id: user.id,
      direction,
      title,
      category: body.category || null,
      amount_min: amountMin,
      amount_max: amountMax,
      frequency,
      expected_on: body.expectedOn || null,
      timing_hint: body.timingHint || null,
      note: body.note || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const flowId = String(body.flowId || '');
  const action = String(body.action || 'confirm');

  if (!flowId) return NextResponse.json({ error: 'Expected-flow id is required' }, { status: 400 });

  if (action === 'confirm') {
    const actualAmount = Number(body.actualAmount);
    if (!Number.isFinite(actualAmount) || actualAmount <= 0) {
      return NextResponse.json({ error: 'Actual amount must be greater than zero' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('confirm_expected_flow', {
      p_flow_id: flowId,
      p_actual_amount: actualAmount,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === 'pause' || action === 'resume') {
    const { data, error } = await supabase
      .from('wealth_expected_flows')
      .update({ status: action === 'pause' ? 'paused' : 'active' })
      .eq('id', flowId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}
