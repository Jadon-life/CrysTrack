import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [{ data: targets }, { data: entries }] = await Promise.all([
    supabase.from('finance_targets').select('*').eq('user_id', user.id).eq('status', 'active'),
    supabase.from('money_entries').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(20),
  ]);

  return NextResponse.json({ targets: targets || [], entries: entries || [] });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { data: entry, error } = await supabase
    .from('money_entries')
    .insert({ ...body, user_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update target if applicable
  if (body.target_id && body.type === 'saving') {
    await supabase.rpc('increment_target', {
      target_uuid: body.target_id,
      amount_num: body.amount,
    });
  }

  return NextResponse.json(entry);
}
