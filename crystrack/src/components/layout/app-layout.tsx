'use client';
import { GamificationProvider } from '@/components/gamification/provider';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { RhythmProvider } from '@/components/rhythm/rhythm-provider';
import { FloatingAppShell } from '@/components/workspace/floating-app-shell';
import { GoalAtmosphere } from '@/components/goals/goal-atmosphere';
import { EnvironmentBackground } from './environment-background';
import { useTheme } from './theme-provider';
import { useAuth } from './auth-provider';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthPage = pathname === '/auth';
  const { requestLocation, environment, reducedMotion } = useTheme();
  const { user, loading } = useAuth();

  React.useEffect(() => {
    if (!loading && !user && !isAuthPage) router.push('/auth');
  }, [user, loading, isAuthPage, router]);

  React.useEffect(() => {
    if (
      !user ||
      isAuthPage ||
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator)
    )
      return;
    import('@/lib/push')
      .then(({ registerCrysTrackServiceWorker }) =>
        registerCrysTrackServiceWorker(),
      )
      .catch(() => null);
  }, [user, isAuthPage]);

  React.useEffect(() => {
    if (!user || isAuthPage) return;
    const displayName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'CrysTrack';

    fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName }),
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

  if (loading)
    return (
      <div className="workspace-loading" role="status">
        <Loader2 className="animate-spin" />
        <span>Opening your workspace…</span>
      </div>
    );
  if (isAuthPage)
    return (
      <div className="workspace-viewport workspace-auth">
        <EnvironmentBackground />
        <div className="workspace-auth-content">{children}</div>
      </div>
    );
  if (!user) return null;
  return (
    <RhythmProvider>
      <GamificationProvider>
        <div className="app-experience-shell workspace-viewport">
          <EnvironmentBackground />
          <GoalAtmosphere
            phase={environment.phase}
            reducedMotion={reducedMotion}
          />
          <FloatingAppShell>{children}</FloatingAppShell>
        </div>
      </GamificationProvider>
    </RhythmProvider>
  );
}
