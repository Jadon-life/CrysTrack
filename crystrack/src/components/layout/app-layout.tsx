'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { TopNavigation } from '@/components/navigation/top-navigation';
import { EnvironmentBackground } from './environment-background';
import { ImmersiveCeremony } from './immersive-ceremony';
import { ThreeBackground } from './three-background';
import { useTheme } from './theme-provider';
import { useAuth } from './auth-provider';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthPage = pathname === '/auth';
  const { theme, requestLocation, environment, reducedMotion } = useTheme();
  const { user, loading } = useAuth();

  React.useEffect(() => {
    if (!loading && !user && !isAuthPage) router.push('/auth');
  }, [user, loading, isAuthPage, router]);

  React.useEffect(() => {
    if (!user || isAuthPage || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    import('@/lib/push').then(({ registerCrysTrackServiceWorker }) => registerCrysTrackServiceWorker()).catch(() => null);
  }, [user, isAuthPage]);

  React.useEffect(() => {
    if (!user || isAuthPage) return;
    const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'CrysTrack';
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, timezone }),
    }).catch(() => null);
  }, [user, isAuthPage]);

  React.useEffect(() => {
    if (!user || isAuthPage) return;
    const key = 'crystrack-location-requested-v1';
    if (window.localStorage.getItem(key)) {
      void requestLocation({ prompt: false });
      return;
    }
    window.localStorage.setItem(key, '1');
    void requestLocation({ prompt: true });
  }, [user, isAuthPage, requestLocation]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#06101b]"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>;
  }

  if (isAuthPage) {
    return (
      <div className="relative min-h-screen flex items-center justify-center" style={{ background: theme.background }}>
        <ThreeBackground />
        <div className="relative z-10 w-full max-w-md px-4">{children}</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="relative min-h-screen app-experience-shell">
      <EnvironmentBackground />
      <TopNavigation />
      <main className="relative z-10 min-h-screen pt-[88px] sm:pt-[96px] pb-10">
        <div className="w-full max-w-[1560px] mx-auto px-3 sm:px-5 lg:px-7 xl:px-9">
          {children}
        </div>
      </main>
      <ImmersiveCeremony
        phase={environment.phase}
        userKey={user.id}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
