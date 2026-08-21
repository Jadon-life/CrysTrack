import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

function computeStatus(deadline: string): string {
  const diffMinutes = (new Date(deadline).getTime() - Date.now()) / 60_000;
  if (diffMinutes < 0) return 'overdue';
  if (diffMinutes < 24 * 60) return 'due_today';
  if (diffMinutes < 3 * 24 * 60) return 'due_soon';
  return 'upcoming';
}

function normaliseReminderConfig(value: any, priority: string) {
  const proposed = priority === 'urgent' ? [2880, 1440, 360, 60, 0] : [1440, 120, 0];
  const channels = Array.isArray(value?.channels)
    ? Array.from(new Set(value.channels.filter((channel: unknown) => channel === 'push' || channel === 'telegram')))
    : ['push'];
  const offsets = Array.isArray(value?.offsetMinutes)
    ? Array.from(new Set<number>(value.offsetMinutes.map(Number).filter((minutes: number) => Number.isFinite(minutes) && minutes >= 0 && minutes <= 30 * 24 * 60))).sort((a, b) => b - a)
    : proposed;
  return {
    enabled: value?.enabled !== false,
    channels: channels.length ? channels : ['push'],
    offsetMinutes: offsets,
  };
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: assignments, error } = await supabase
    .from('assignments')
    .select('*')
    .eq('user_id', user.id)
    .neq('status', 'completed')
    .order('deadline', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json((assignments || []).map((assignment: any) => ({
    ...assignment,
    computed_status: computeStatus(assignment.deadline),
    days_until: Math.ceil((new Date(assignment.deadline).getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
  })));
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const title = String(body.title || '').trim();
  const deadline = new Date(body.deadline);
  const priority = ['low', 'medium', 'high', 'urgent'].includes(body.priority) ? body.priority : 'medium';
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  if (Number.isNaN(deadline.getTime())) return NextResponse.json({ error: 'A valid deadline is required' }, { status: 400 });

  const deadlineIso = deadline.toISOString();
  const { data: assignment, error } = await supabase
    .from('assignments')
    .insert({
      user_id: user.id,
      title,
      description: body.description || null,
      deadline: deadlineIso,
      priority,
      status: computeStatus(deadlineIso),
      category: body.category || null,
      reminder_config: normaliseReminderConfig(body.reminderConfig, priority),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(assignment, { status: 201 });
}
