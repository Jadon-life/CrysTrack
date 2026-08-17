'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navItems } from './nav-items';
import { useAuth } from '@/components/layout/auth-provider';
import { Diamond, LogOut, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <aside 
      className="fixed left-0 top-0 h-screen w-64 z-50 flex flex-col border-r border-white/10"
      style={{ background: 'rgba(10, 14, 39, 0.85)', backdropFilter: 'blur(20px)' }}
    >
      {/* Logo */}
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Diamond className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">CrysTrack</h1>
          <p className="text-xs text-slate-400">Progress Companion</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-hide">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group',
                isActive 
                  ? 'bg-white/10 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              )}
            >
              <span className={cn(
                'transition-colors',
                isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'
              )}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Info & Sign Out */}
      <div className="p-4 border-t border-white/10 space-y-3">
        {user && (
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-white truncate">{user.email}</p>
            </div>
          </div>
        )}
        <button 
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-all"
          onClick={signOut}
        >
          <LogOut className="w-5 h-5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
