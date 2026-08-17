import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: tasks } = await supabase
    .from('recurring_tasks')
    .select('*, task_schedules(*)')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  return NextResponse.json(tasks || []);
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { title, description, preferredTime, category, schedules } = body;

  const { data: task, error } = await supabase
    .from('recurring_tasks')
    .insert({ user_id: user.id, title, description, preferred_time: preferredTime, category })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (schedules?.length > 0) {
    const scheduleRows = schedules.map((day: number) => ({
      task_id: task.id,
      weekday: day,
    }));
    await supabase.from('task_schedules').insert(scheduleRows);
  }

  return NextResponse.json(task);
}
