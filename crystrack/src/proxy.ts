import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { taskMaintenance } from '@/lib/task-maintenance';
import { releaseApiStop } from '@/lib/release-api-stop';
import { previewRequest } from '@/lib/preview/request';

export async function proxy(request: NextRequest) {
  const preview = previewRequest(request);
  if (preview) return preview;
  const releaseStop = releaseApiStop(request);
  if (releaseStop) return releaseStop;
  const maintenance = taskMaintenance(request);
  if (maintenance) return maintenance;
  // Preserve the original production asset bypass without bypassing Preview safety.
  const path = request.nextUrl.pathname;
  if (path.startsWith('/_next/static') || path.startsWith('/_next/image') || path === '/favicon.ico' || /\.(svg|png|jpg|jpeg|gif|webp)$/.test(path)) return NextResponse.next();
  return await updateSession(request);
}
export const config = { matcher: ['/:path*'] };
