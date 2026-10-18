/** Build-owned marker; never enabled by a URL, cookie, header, or public input flag. */
export type PreviewMode = 'normal' | 'preview-demo' | 'preview-blocked';
export function resolvePreviewMode(deployment: string | undefined, flag: string | undefined, built: string | undefined): PreviewMode {
  if (deployment === 'preview') {
    return flag === 'synthetic-v1' && built === 'preview-demo' ? 'preview-demo' : 'preview-blocked';
  }
  // A Preview artifact stays restricted if its runtime deployment variables disappear.
  if (built === 'preview-demo' || built === 'preview-blocked') return built;
  return 'normal';
}
export function previewMode(): PreviewMode {
  const built = process.env.NEXT_PUBLIC_CRYSTRACK_RUNTIME;
  if (typeof window !== 'undefined') {
    return built === 'preview-demo' || built === 'preview-blocked' ? built : 'normal';
  }
  return resolvePreviewMode(process.env.VERCEL_ENV, process.env.CRYSTRACK_PREVIEW_MODE, built);
}
export function isRestrictedPreview() { return previewMode() !== 'normal'; }
export function assertRealServicesAllowed() {
  if (isRestrictedPreview()) throw new Error('Real services are disabled in Preview. This is a synthetic, read-only demo.');
}
