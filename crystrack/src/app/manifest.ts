import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CrysTrack',
    short_name: 'CrysTrack',
    description: 'Personal command centre for routines, goals, assignments and progress.',
    start_url: '/',
    display: 'standalone',
    background_color: '#050914',
    theme_color: '#081523',
    orientation: 'any',
    shortcuts: [
      { name: 'Today', short_name: 'Today', url: '/', description: 'Open your routines' },
      { name: 'Plan', short_name: 'Plan', url: '/plan', description: 'Open goals and assignments' },
      { name: 'Wealth', short_name: 'Wealth', url: '/finance', description: 'Open your finance overview' },
    ],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
