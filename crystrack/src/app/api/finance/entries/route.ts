import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const VALID_FLOW_KINDS = new Set([
  'income',
  'expense',
  'saving',
  'savings_release',
  'transfer',
]);

function storageTypeFor(flowKind: string) {
  if (flowKind === 'savings_release') return 'transfer';
  return flowKind;
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const amount = Number(body.amount);
  const requested = String(body.flowKind || body.type || '');
  const flowKind = requested === 'transfer' ? 'transfer' : requested;

  if (!VALID_FLOW_KINDS.has(flowKind)) {
    return NextResponse.json({ error: 'Invalid money entry type' }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 });
  }

  if (flowKind === 'savings_release') {
    const { data: savingsEntries, error: savingsError } = await supabase
      .from('money_entries')
      .select('amount, type, flow_kind')
      .eq('user_id', user.id);

    if (savingsError) return NextResponse.json({ error: savingsError.message }, { status: 500 });

    const savedBalance = (savingsEntries || []).reduce((sum: number, item: any) => {
      const kind = String(item.flow_kind || item.type || '');
      const value = Number(item.amount || 0);
      if (kind === 'saving') return sum + value;
      if (kind === 'savings_release') return sum - value;
      return sum;
    }, 0);

    if (amount > savedBalance) {
      return NextResponse.json({ error: 'Release amount exceeds your recorded savings balance' }, { status: 400 });
    }
  }

  const targetId: string | null = body.targetId || null;
  if (targetId) {
    const { data: target } = await supabase
      .from('finance_targets')
      .select('id, current_amount')
      .eq('id', targetId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (!target) return NextResponse.json({ error: 'Savings target not found' }, { status: 404 });
    if (flowKind === 'savings_release' && Number(target.current_amount || 0) < amount) {
      return NextResponse.json({ error: 'Release amount exceeds this target balance' }, { status: 400 });
    }
  }

  const { data: entry, error } = await supabase
    .from('money_entries')
    .insert({
      user_id: user.id,
      type: storageTypeFor(flowKind),
      flow_kind: flowKind,
      amount,
      date: body.date || new Date().toISOString(),
      source: body.source || null,
      category: body.category || (flowKind === 'saving' || flowKind === 'savings_release' ? 'Savings' : null),
      note: body.note || null,
      target_id: targetId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (targetId && (flowKind === 'saving' || flowKind === 'savings_release')) {
    const delta = flowKind === 'saving' ? amount : -amount;
    const { error: targetError } = await supabase.rpc('adjust_target', {
      target_uuid: targetId,
      amount_delta: delta,
    });

    if (targetError) {
      await supabase.from('money_entries').delete().eq('id', entry.id).eq('user_id', user.id);
      return NextResponse.json({ error: 'Could not update the linked savings target' }, { status: 500 });
    }
  }

  const availableImpact =
    flowKind === 'income' || flowKind === 'savings_release'
      ? amount
      : flowKind === 'expense' || flowKind === 'saving'
        ? -amount
        : 0;

  await supabase.from('activity_events').insert({
    user_id: user.id,
    type: 'finance_entry',
    entity_type: 'finance',
    entity_id: entry.id,
    metadata_json: {
      title: entry.source || entry.category || `${flowKind} entry`,
      amount: availableImpact,
      type: flowKind,
    },
  });

  return NextResponse.json(entry, { status: 201 });
}
