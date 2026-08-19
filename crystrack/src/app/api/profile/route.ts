import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data || {
    user_id: user.id,
    display_name:
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'CrysTrack',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
}

export async function PUT(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const updates: Record<string, unknown> = { user_id: user.id };

  const hasDisplayName = typeof body.displayName === 'string';
  const displayName = hasDisplayName
    ? body.displayName.trim().slice(0, 255)
    : null;

  if (hasDisplayName && !displayName) {
    return NextResponse.json(
      { error: 'Display name cannot be empty' },
      { status: 400 },
    );
  }

  if (displayName) updates.display_name = displayName;
  if (typeof body.timezone === 'string') updates.timezone = body.timezone.slice(0, 100);
  if (typeof body.locale === 'string') updates.locale = body.locale.slice(0, 10);
  if (typeof body.avatarUrl === 'string') updates.avatar_url = body.avatarUrl;
  if (typeof body.currentTimezone === 'string') updates.current_timezone = body.currentTimezone.slice(0, 100);
  if (typeof body.currentCity === 'string' || body.currentCity === null) updates.current_city = body.currentCity;
  if (typeof body.currentCountryCode === 'string' || body.currentCountryCode === null) updates.current_country_code = body.currentCountryCode;
  if ('currentTimezone' in body || 'currentCity' in body || 'currentCountryCode' in body) {
    updates.current_location_updated_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert(updates, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (displayName) {
    const { error: authError } = await supabase.auth.updateUser({
      data: {
        ...(user.user_metadata || {}),
        full_name: displayName,
        name: displayName,
      },
    });

    if (authError) {
      return NextResponse.json(
        {
          error: 'The profile was saved, but the visible display name could not be synchronized. Please try saving again.',
          code: 'AUTH_METADATA_SYNC_FAILED',
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(data);
}
