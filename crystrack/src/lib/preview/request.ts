import { NextResponse, type NextRequest } from 'next/server';
import { previewMode } from './mode';
import { demoRead } from './data';

export const PREVIEW_CSP = "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
export function securePreviewResponse(response: NextResponse) {
  response.headers.set('Content-Security-Policy', PREVIEW_CSP);
  response.headers.set('Cache-Control','private, no-store');
  response.headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
  response.headers.set('Permissions-Policy','geolocation=(), camera=(), microphone=(), payment=()');
  response.headers.set('X-CrysTrack-Preview','synthetic-read-only');
  return response;
}
export function previewRequest(request: NextRequest): NextResponse | null {
  const mode = previewMode();
  if (mode === 'normal') return null;
  if (mode === 'preview-blocked') {
    return securePreviewResponse(NextResponse.json({error:'Preview is disabled until the reviewed synthetic demo is configured.'},{status:503}));
  }
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith('/_next/image')) return securePreviewResponse(NextResponse.json({error:'Image proxying is disabled in this demo.'},{status:403}));
  if (pathname === '/sw.js') {
    // Replace an old worker on this Preview origin; never register a new push worker.
    return securePreviewResponse(new NextResponse("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.registration.unregister()));",{headers:{'Content-Type':'application/javascript'}}));
  }
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return securePreviewResponse(NextResponse.json({error:'This is a read-only synthetic demo. Changes and integrations are disabled.'},{status:403}));
    }
    const data = demoRead(pathname, request.nextUrl.searchParams);
    return securePreviewResponse(data === undefined
      ? NextResponse.json({error:'This endpoint is unavailable in the synthetic demo.'},{status:403})
      : request.method === 'HEAD' ? new NextResponse(null) : NextResponse.json(data));
  }
  // No real form submissions/server actions; navigation is GET/HEAD only.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return securePreviewResponse(NextResponse.json({error:'Actions are disabled in this demo.'},{status:403}));
  }
  return securePreviewResponse(NextResponse.next());
}
