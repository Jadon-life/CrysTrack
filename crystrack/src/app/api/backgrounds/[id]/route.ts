import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type Source = { unsplashId: string; fallback: string };
const SOURCES: Record<string, Source> = {
  'midnight-dubai-marina': { unsplashId: 'Ul-h35vIJiM', fallback: '/backgrounds/crystrack-golden-dubai.webp' },
  'predawn-misty-mountain-lake': { unsplashId: 'C3XFOAc2Va8', fallback: '/backgrounds/crystrack-golden-dubai.webp' },
  'sunrise-mountain-reflection': { unsplashId: 'g5E0pVayCBs', fallback: '/backgrounds/crystrack-golden-dubai.webp' },
  'morning-rocky-mountain-lake': { unsplashId: 'uKtQh_r3ZsY', fallback: '/backgrounds/crystrack-day-urban-4k.webp' },
  'late-morning-swiss-lake': { unsplashId: 'tpQrsYkkTvA', fallback: '/backgrounds/crystrack-day-urban-4k.webp' },
  'midday-green-highlands': { unsplashId: 'H3yr77Q_mwg', fallback: '/backgrounds/crystrack-day-urban-4k.webp' },
  'afternoon-dubai-business-bay': { unsplashId: 'lMo2HjtoUpM', fallback: '/backgrounds/crystrack-day-urban-4k.webp' },
  'late-afternoon-downtown-dubai': { unsplashId: 'bVblbt3tGxM', fallback: '/backgrounds/crystrack-day-urban-4k.webp' },
  'golden-sheikh-zayed-road': { unsplashId: 'v8qWbKNEAIE', fallback: '/backgrounds/crystrack-golden-dubai.webp' },
  'sunset-dubai-skyline': { unsplashId: 'vQY6LPimFks', fallback: '/backgrounds/crystrack-golden-dubai.webp' },
  'blue-hour-downtown-dubai': { unsplashId: 'WyfXOHgI49s', fallback: '/backgrounds/crystrack-golden-dubai.webp' },
  'night-sheikh-zayed-dubai': { unsplashId: 'sTOQG-SAFqY', fallback: '/backgrounds/crystrack-golden-dubai.webp' },
};

function fallbackRedirect(request: Request, fallback: string) {
  const response = NextResponse.redirect(new URL(fallback, request.url), 307);
  response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300');
  return response;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const source = SOURCES[params.id];
  if (!source) return NextResponse.json({ error: 'Background not found' }, { status: 404 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  const upstreamUrl = `https://unsplash.com/photos/${encodeURIComponent(source.unsplashId)}/download?force=true&w=2200`;
  try {
    const upstream = await fetch(upstreamUrl, { cache: 'force-cache', redirect: 'follow', signal: controller.signal, headers: { Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' } });
    if (!upstream.ok || !upstream.body) return fallbackRedirect(request, source.fallback);
    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000');
    headers.set('CDN-Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=2592000');
    headers.set('Vary', 'Accept'); headers.set('X-CrysTrack-Background', params.id); headers.set('X-CrysTrack-Source', source.unsplashId);
    return new Response(upstream.body, { status: 200, headers });
  } catch { return fallbackRedirect(request, source.fallback); }
  finally { clearTimeout(timeout); }
}
