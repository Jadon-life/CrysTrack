'use client';

import { assertRealServicesAllowed } from '@/lib/preview/mode';
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  assertRealServicesAllowed();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
