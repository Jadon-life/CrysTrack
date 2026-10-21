/** @type {import('next').NextConfig} */
const preview = process.env.VERCEL_ENV === 'preview';
const mode = preview ? (process.env.CRYSTRACK_PREVIEW_MODE === 'synthetic-v1' ? 'preview-demo' : 'preview-blocked') : 'normal';
// Next inlines public variables at build time. Strip ALL public bindings in Preview,
// including stale hosted credentials, before defining the build-owned runtime marker.
const previewPublic = preview ? Object.fromEntries([
  ...Object.keys(process.env).filter(name => name.startsWith('NEXT_PUBLIC_')),
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'NEXT_PUBLIC_APP_URL',
].map(name => [name, ''])) : {};
const nextConfig = {
  env: { ...previewPublic, NEXT_PUBLIC_CRYSTRACK_RUNTIME: mode },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
