import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const MAX_BODY_BYTES = 512;
const NO_STORE = { 'Cache-Control': 'private, no-store' };

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

/** A narrow hint used ONLY when the owner has no profile row yet. */
async function readInitialTimezone(request: Request): Promise<string | null> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) return null;
      chunks.push(value);
    }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;
    if (Object.keys(obj).length !== 1 || typeof obj.timezone !== 'string') return null;
    const zone = obj.timezone.trim();
    if (!zone || zone.length > 100) return null;
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return null;
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  // A signed-in user's first profile must never be initialised cross-site.
  if (origin !== new URL(request.url).origin) return errorResponse('Request origin not permitted.', 403);

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return errorResponse('Unauthorized.', 401);

  const timezone = await readInitialTimezone(request);
  if (!timezone) return errorResponse('Invalid initial timezone.', 400);

  const displayName = String(
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'CrysTrack'
  ).trim().slice(0, 255) || 'CrysTrack';

  // IMPORTANT: ignoreDuplicates is PostgreSQL ON CONFLICT DO NOTHING.
  // No existing owner-selected timezone or display name is overwritten.
  const { error } = await supabase.from('profiles').upsert(
    { user_id: user.id, display_name: displayName, timezone },
    { onConflict: 'user_id', ignoreDuplicates: true },
  );
  if (error) return errorResponse('Could not open your profile. Please try again.', 503);
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
