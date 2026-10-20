import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/** Existing backend-only credential. Never use a cookie client or anon-key fallback. */
export function hasTrustedAiCredential() {
  return !!(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
}
export function createTrustedAiClient() {
  if (!hasTrustedAiCredential()) throw new Error('Trusted AI backend is not configured');
  return createAdminClient();
}
