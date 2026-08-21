import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const kind = String(body.kind || '');
  const counterparty = String(body.counterparty || '').trim();
  const amount = Number(body.amount);

  if (!['receivable', 'liability'].includes(kind)) {
    return NextResponse.json({ error: 'Debt kind must be receivable or liability' }, { status: 400 });
  }
  if (!counterparty) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('create_wealth_debt', {
    p_kind: kind,
    p_counterparty: counterparty,
    p_amount: amount,
    p_due_date: body.dueDate || null,
    p_note: body.note || null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const debtId = String(body.debtId || '');
  const amount = Number(body.amount);

  if (!debtId) return NextResponse.json({ error: 'Debt id is required' }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Repayment amount must be greater than zero' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('repay_wealth_debt', {
    p_debt_id: debtId,
    p_amount: amount,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
