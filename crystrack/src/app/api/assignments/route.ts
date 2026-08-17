import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

function computeStatus(deadline: string): string {
  const now = new Date();
  const d = new Date(deadline);
  const diffMs = d.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 0) return 'overdue';
  if (diffDays < 1) return 'due_today';
  if (diffDays < 3) return 'due_soon';
  return 'upcoming';
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: assignments } = await supabase
    .from('assignments')
    .select('*')
    .eq('user_id', user.id)
    .neq('status', 'completed')
    .order('deadline', { ascending: true });

  const enriched = (assignments || []).map((a: any) => ({
    ...a,
    computed_status: computeStatus(a.deadline),
    days_until: Math.ceil((new Date(a.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  }));

  return NextResponse.json(enriched);
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const status = computeStatus(body.deadline);

  const { data: assignment, error } = await supabase
    .from('assignments')
    .insert({ ...body, user_id: user.id, status })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(assignment);
}
