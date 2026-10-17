/** Every entry point fails closed, including production builds with an accidentally enabled flag. */
export function previewEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (
    env.PIECE9_PREVIEW_ENABLED !== "true" ||
    env.VERCEL_ENV === "production" ||
    env.CRYSTRACK_ENV !== "preview"
  )
    return false;
  if (env.NODE_ENV === "production" && env.VERCEL_ENV !== "preview")
    return false;
  try {
    const staging = new URL(env.NEXT_PUBLIC_SUPABASE_URL || "");
    const production = new URL(env.PIECE9_PRODUCTION_SUPABASE_URL || "");
    return (
      staging.protocol === "https:" &&
      production.protocol === "https:" &&
      staging.hostname !== production.hostname &&
      !!env.PIECE9_SIGNING_SECRET &&
      env.PIECE9_SIGNING_SECRET.length >= 32
    );
  } catch {
    return false;
  }
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !!origin && origin === new URL(request.url).origin;
}
// An abuse brake per warm worker; use an edge/WAF limit as well for distributed deployments.
const buckets = new Map<string, { count: number; reset: number }>();
export function allowPreviewRequest(key: string, limit = 12, now = Date.now()) {
  let bucket = buckets.get(key);
  if (!bucket || bucket.reset <= now) {
    bucket = { count: 0, reset: now + 60000 };
    buckets.set(key, bucket);
  }
  if (buckets.size > 2000)
    for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
  if (buckets.size > 4000) return false;
  return ++bucket.count <= limit;
}
