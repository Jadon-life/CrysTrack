import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { goalCheckinState } from '@/lib/goals/checkin-occurrence';

function normaliseChannels(value: unknown) {
  const channels = Array.isArray(value) ? value.filter((item) => item === 'push' || item === 'telegram') : ['push'];
  return channels.length ? Array.from(new Set(channels)) : ['push'];
}

function normaliseDays(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set<number>(value.map(Number).filter((day: number) => Number.isInteger(day) && day >= 0 && day <= 6))).sort((a, b) => a - b)
    : [];
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [{ data: goals, error }, { data: profile }] = await Promise.all([
    supabase
      .from('goals')
      .select('*, goal_checkins(*)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('timezone, current_timezone')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const timezone = profile?.current_timezone || profile?.timezone || 'UTC';
  const now = new Date();

  return NextResponse.json((goals || []).map((goal: any) => {
    const checkins = [...(goal.goal_checkins || [])].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return {
      ...goal,
      goal_checkins: checkins,
      checkin_state: goalCheckinState(goal.checkin_config, checkins, now, timezone),
    };
  }));
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const title = String(body.title || '').trim();
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const progressMode = body.progressMode === 'ai' ? 'ai' : 'percentage';
  const startingValue = progressMode === 'percentage' && body.startingValue !== '' && body.startingValue != null ? Number(body.startingValue) : null;
  const targetValue = progressMode === 'percentage' && body.targetValue !== '' && body.targetValue != null ? Number(body.targetValue) : null;
  if (progressMode === 'percentage' && (!Number.isFinite(targetValue) || targetValue === startingValue)) {
    return NextResponse.json({ error: 'Numeric goals need a valid target different from the starting value' }, { status: 400 });
  }

  const checkin = body.checkinConfig || {};
  const frequency = ['daily', 'weekly', 'specific'].includes(checkin.frequency) ? checkin.frequency : 'weekly';
  const suppliedDays = normaliseDays(checkin.days);
  if (frequency !== 'daily' && suppliedDays.length === 0) {
    return NextResponse.json({ error: 'Choose at least one valid check-in day' }, { status: 400 });
  }
  const days = frequency === 'daily' ? [] : frequency === 'weekly' ? [suppliedDays[0]] : suppliedDays;
  const checkinConfig = {
    frequency,
    days,
    time: /^\d{2}:\d{2}$/.test(checkin.time || '') ? checkin.time : '20:00',
    channels: normaliseChannels(checkin.channels),
  };

  const deadlineReminder = body.deadlineReminderConfig || {};
  const deadlineReminderConfig = {
    enabled: body.deadline ? deadlineReminder.enabled !== false : false,
    offsetMinutes: Array.isArray(deadlineReminder.offsetMinutes)
      ? Array.from(new Set<number>(deadlineReminder.offsetMinutes.map(Number).filter((minutes: number) => Number.isFinite(minutes) && minutes >= 0))).sort((a, b) => b - a)
      : [10080, 4320, 1440],
    channels: normaliseChannels(deadlineReminder.channels || checkin.channels),
  };

  const deadline = body.deadline ? new Date(body.deadline) : null;
  if (deadline && Number.isNaN(deadline.getTime())) return NextResponse.json({ error: 'Invalid deadline' }, { status: 400 });

  const { data: goal, error } = await supabase
    .from('goals')
    .insert({
      user_id: user.id,
      title,
      description: body.description || null,
      deadline: deadline?.toISOString() || null,
      measurable: progressMode === 'percentage',
      starting_value: startingValue,
      target_value: targetValue,
      progress_value: progressMode === 'percentage' ? (startingValue ?? 0) : null,
      progress_unit: progressMode === 'percentage' ? (String(body.progressUnit || '').trim() || null) : null,
      progress_mode: progressMode,
      ai_coaching: progressMode === 'ai' ? true : Boolean(body.aiCoaching),
      checkin_config: checkinConfig,
      deadline_reminder_config: deadlineReminderConfig,
      category: body.category || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(goal, { status: 201 });
}
