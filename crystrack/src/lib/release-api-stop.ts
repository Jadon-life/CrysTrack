import { NextResponse, type NextRequest } from 'next/server';

/**
 * Opt-in release-only stop for requests arriving at THIS Next.js artifact.
 *
 * This is NOT a database barrier: old deployments, direct PostgREST, RPCs,
 * workers and in-flight requests require independent verified isolation.
 */
export function releaseApiStop(request: NextRequest): NextResponse | null {
  const flag = process.env.CRYSTRACK_RELEASE_API_STOP;
  if (!flag || flag === 'off') return null;

  const path = request.nextUrl.pathname;
  const api = path === '/api' || path.startsWith('/api/');
  // Some seemingly read-only API GET endpoints can perform lazy writes.
  // Non-API unsafe methods may be Next.js server actions on page routes.
  if (!api && (request.method === 'GET' || request.method === 'HEAD')) return null;

  return NextResponse.json(
    { error: 'CrysTrack is temporarily unavailable for updates. Please try again soon.' },
    {
      status: 503,
      headers: {
        'Retry-After': '60',
        'Cache-Control': 'private, no-store',
      },
    },
  );
}
