'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { TopNavigation } from '@/components/navigation/top-navigation';
import { EnvironmentBackground } from './environment-background';
import { useTheme } from './theme-provider';
import { isRestrictedPreview } from '@/lib/preview/mode';
import { useAuth } from './auth-provider';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthPage = pathname === '/auth' || pathname === '/auth/reset-password';
  const { theme, requestLocation } = useTheme();
  const { user, loading } = useAuth();

  React.useEffect(() => {
    if (!loading && !user && !isAuthPage) router.push('/auth');
  }, [user, loading, isAuthPage, router]);

  React.useEffect(() => {
    if (isRestrictedPreview() || !user || isAuthPage || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    import('@/lib/push').then(({ registerCrysTrackServiceWorker }) => registerCrysTrackServiceWorker()).catch(() => null);
  }, [user, isAuthPage]);

  React.useEffect(() => {
    if (isRestrictedPreview() || !user || isAuthPage) return;
    // A device's timezone is only a first-account hint. The saved home and
    // scheduling timezones are owner-controlled and must not be overwritten.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    void fetch('/api/profile/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone }),
    }).catch(() => null);
  }, [user, isAuthPage]);

  React.useEffect(() => {
    if (isRestrictedPreview() || !user || isAuthPage) return;
    const key = 'crystrack-location-requested-v1';
    if (window.localStorage.getItem(key)) {
      void requestLocation({ prompt: false });
      return;
    }
    window.localStorage.setItem(key, '1');
    void requestLocation({ prompt: true });
  }, [user, isAuthPage, requestLocation]);

  React.useEffect(() => {
    if (!isRestrictedPreview() || !('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(
      registrations.filter(registration => registration.scope === `${window.location.origin}/`).map(registration => registration.unregister()),
    )).catch(() => null);
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#06101b]"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>;
  }

  if (isAuthPage) {
    return (
      <div className="relative min-h-screen flex items-center justify-center" style={{ background: theme.background }}>
        <EnvironmentBackground />
        <div className="relative z-10 w-full max-w-md px-4">{children}</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="relative min-h-screen app-experience-shell" onClickCapture={event => {
      if (!isRestrictedPreview() || !(event.target instanceof Element)) return;
      const anchor = event.target.closest('a');
      if (anchor && new URL(anchor.href, window.location.origin).origin !== window.location.origin) event.preventDefault();
    }}>
      <EnvironmentBackground />
      <TopNavigation />
      <main key={user.id} className="relative z-10 min-h-screen pt-[88px] sm:pt-[96px] pb-10">
        <div className="w-full max-w-[1560px] mx-auto px-3 sm:px-5 lg:px-7 xl:px-9">
          {isRestrictedPreview() && <div role="status" className="mb-4 rounded-xl border border-sky-300/20 bg-sky-950/40 p-3 text-center text-sm text-sky-100">Synthetic read-only demo · example data dated 28 September 2026 · changes, sign-in and integrations are disabled.</div>}
          {children}
        </div>
      </main>
    </div>
  );
}
