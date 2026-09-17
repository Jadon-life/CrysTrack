import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

function safeRedirectPath(value: string | null) {
  if (!value) return '/';

  // Only same-origin application paths are allowed.
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return '/';
  }

  try {
    const base = 'https://crystrack.local';
    const target = new URL(value, base);

    if (target.origin !== base) {
      return '/';
    }

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/';
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeRedirectPath(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(
    new URL('/auth?error=auth_callback_error', origin),
  );
}
