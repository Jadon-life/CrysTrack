import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_FILES = new Set([
  '/manifest.webmanifest',
  '/sw.js',
  '/robots.txt',
  '/sitemap.xml',
]);

function isPublicPage(pathname: string) {
  return (
    pathname === '/auth' ||
    pathname.startsWith('/auth/') ||
    PUBLIC_FILES.has(pathname)
  );
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });

  return to;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },

        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });

          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });

          response.cookies.set({
            name,
            value,
            ...options,
          });
        },

        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          });

          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });

          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isApiRoute = pathname.startsWith('/api/');
  const requiresAuthentication =
    !isApiRoute && !isPublicPage(pathname);

  if (!user && requiresAuthentication) {
    const redirectUrl = request.nextUrl.clone();

    redirectUrl.pathname = '/auth';
    redirectUrl.search = '';

    const originalDestination =
      `${pathname}${request.nextUrl.search}`;

    redirectUrl.searchParams.set(
      'next',
      originalDestination,
    );

    return copyCookies(
      response,
      NextResponse.redirect(redirectUrl),
    );
  }

  if (user && pathname === '/auth') {
    const redirectUrl = request.nextUrl.clone();

    redirectUrl.pathname = '/';
    redirectUrl.search = '';

    return copyCookies(
      response,
      NextResponse.redirect(redirectUrl),
    );
  }

  return response;
}
