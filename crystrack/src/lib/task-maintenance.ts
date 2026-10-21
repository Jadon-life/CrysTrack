import { NextResponse, type NextRequest } from 'next/server';

/** Independent API stop; never a substitute for the release-only DB freeze. */
export function taskMaintenance(request: NextRequest): NextResponse | null {
  const flag = process.env.CRYSTRACK_TASK_WRITE_MAINTENANCE;
  if (!flag || flag === 'off') return null;
  const path = request.nextUrl.pathname;
  const blocked = ['/api/tasks', '/api/daily-records', '/api/daily-notes', '/api/reminders/dispatch']
    .some(prefix => path === prefix || path.startsWith(prefix + '/'));
  if (!blocked) return null;
  // A mistyped non-empty value fails closed on these surfaces.
  return NextResponse.json({ error: 'Task updates are taking a short pause. Please try again soon.' }, {
    status: 503, headers: { 'Retry-After': '60', 'Cache-Control': 'private, no-store' },
  });
}
