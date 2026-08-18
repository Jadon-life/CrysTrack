import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const VALID_TYPES = new Set(['income', 'expense', 'saving', 'transfer']);

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const amount = Number(body.amount);
  const type = String(body.type || '');

  if (!VALID_TYPES.has(type)) return NextResponse.json({ error: 'Invalid money entry type' }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 });

  let targetId: string | null = body.targetId || null;
  if (targetId) {
    const { data: target } = await supabase
      .from('finance_targets')
      .select('id')
      .eq('id', targetId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (!target) return NextResponse.json({ error: 'Savings target not found' }, { status: 404 });
  }

  const { data: entry, error } = await supabase
    .from('money_entries')
    .insert({
      user_id: user.id,
      type,
      amount,
      date: body.date || new Date().toISOString(),
      source: body.source || null,
      category: body.category || null,
      note: body.note || null,
      target_id: targetId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (targetId && type === 'saving') {
    const { error: incrementError } = await supabase.rpc('increment_target', {
      target_uuid: targetId,
      amount_num: amount,
    });
    if (incrementError) {
      await supabase.from('money_entries').delete().eq('id', entry.id).eq('user_id', user.id);
      return NextResponse.json({ error: 'Could not update the linked savings target' }, { status: 500 });
    }
  }

  await supabase.from('activity_events').insert({
    user_id: user.id,
    type: 'finance_entry',
    entity_type: 'finance',
    entity_id: entry.id,
    metadata_json: {
      title: entry.source || entry.category || `${type} entry`,
      amount: type === 'expense' ? -amount : amount,
      type,
    },
  });

  return NextResponse.json(entry, { status: 201 });
}
