import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DEFAULTS = {
  theme_preference: 'adaptive',
  reduced_motion: false,
  weather_enabled: true,
  dnd_enabled: false,
  dnd_start_time: '22:00',
  dnd_end_time: '07:00',
  default_reminder_channels: ['push'],
  untimed_task_reminder_time: '10:00',
  incomplete_task_reminder_time: '19:00',
  location_enabled: true,
};

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || { ...DEFAULTS, user_id: user.id });
}

export async function PUT(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const updates: Record<string, unknown> = { user_id: user.id };

  if (['adaptive', 'light', 'dark'].includes(body.themePreference)) updates.theme_preference = body.themePreference;
  if (typeof body.reducedMotion === 'boolean') updates.reduced_motion = body.reducedMotion;
  if (typeof body.weatherEnabled === 'boolean') updates.weather_enabled = body.weatherEnabled;
  if (typeof body.locationEnabled === 'boolean') updates.location_enabled = body.locationEnabled;
  if (typeof body.dndEnabled === 'boolean') updates.dnd_enabled = body.dndEnabled;
  if (typeof body.dndStart === 'string') updates.dnd_start_time = body.dndStart.slice(0, 5);
  if (typeof body.dndEnd === 'string') updates.dnd_end_time = body.dndEnd.slice(0, 5);
  if (typeof body.untimedTaskReminderTime === 'string') updates.untimed_task_reminder_time = body.untimedTaskReminderTime.slice(0, 5);
  if (typeof body.incompleteTaskReminderTime === 'string') updates.incomplete_task_reminder_time = body.incompleteTaskReminderTime.slice(0, 5);
  if (Array.isArray(body.defaultReminderChannels)) {
    updates.default_reminder_channels = body.defaultReminderChannels.filter((value: unknown) => value === 'push' || value === 'telegram');
  }
  if (body.reminderDefaults && typeof body.reminderDefaults === 'object') updates.reminder_defaults = body.reminderDefaults;

  const { data, error } = await supabase
    .from('user_preferences')
    .upsert(updates, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
