import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const title = String(body.title || '').trim();
  const targetAmount = Number(body.targetAmount);

  if (!title) return NextResponse.json({ error: 'Target name is required' }, { status: 400 });
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    return NextResponse.json({ error: 'Target amount must be greater than zero' }, { status: 400 });
  }

  const { data: target, error } = await supabase
    .from('finance_targets')
    .insert({
      user_id: user.id,
      title,
      target_amount: targetAmount,
      deadline: body.deadline || null,
      description: body.description || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(target, { status: 201 });
}
