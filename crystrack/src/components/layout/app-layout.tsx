'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/navigation/sidebar';
import { MobileNav } from '@/components/navigation/mobile-nav';
import { ThreeBackground } from './three-background';
import { useTheme } from './theme-provider';
import { useAuth } from './auth-provider';
import { Loader2 } from 'lucide-react';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthPage = pathname === '/auth';
  const { theme } = useTheme();
  const { user, loading } = useAuth();

  React.useEffect(() => {
    if (!loading && !user && !isAuthPage) router.push('/auth');
  }, [user, loading, isAuthPage, router]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#080c19]"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>;
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
    <div className="relative min-h-screen flex app-shell-bg">
      <div className="hidden lg:block"><Sidebar /></div>
      <main className="flex-1 min-h-screen pb-24 lg:pb-0 lg:ml-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">{children}</div>
      </main>
      <div className="lg:hidden"><MobileNav /></div>
    </div>
  );
}
