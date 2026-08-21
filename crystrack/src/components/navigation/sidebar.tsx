'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navItems, navItemIsActive } from './nav-items';
import { useAuth } from '@/components/layout/auth-provider';
import { Diamond, LogOut, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 z-50 flex flex-col border-r border-white/10 bg-[#090d1b]/95 backdrop-blur-md">
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-400/20 flex items-center justify-center">
          <Diamond className="w-5 h-5 text-blue-300" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">CrysTrack</h1>
          <p className="text-xs text-slate-500">Personal command centre</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-hide">
        {navItems.map((item) => {
          const isActive = navItemIsActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive ? 'bg-blue-500/10 text-white border border-blue-500/15' : 'text-slate-400 border border-transparent hover:text-white hover:bg-white/[0.035]',
              )}
            >
              <span className={isActive ? 'text-blue-400' : 'text-slate-500'}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10 space-y-3">
        {user && (
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center"><User className="w-4 h-4 text-slate-300" /></div>
            <p className="text-xs text-slate-300 truncate min-w-0">{user.email}</p>
          </div>
        )}
        <button className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-slate-500 hover:text-white hover:bg-white/[0.035] transition-colors" onClick={signOut}>
          <LogOut className="w-5 h-5" /><span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
