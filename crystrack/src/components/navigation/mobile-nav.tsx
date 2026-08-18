'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { mobileNavItems, navItemIsActive } from './nav-items';
import { cn } from '@/lib/utils';
import { Menu, X, Diamond, CheckSquare, Target, ClipboardList, History } from 'lucide-react';

const planLinks = [
  { label: 'Tasks', href: '/tasks', icon: <CheckSquare className="w-5 h-5" /> },
  { label: 'Goals', href: '/goals', icon: <Target className="w-5 h-5" /> },
  { label: 'Assignments', href: '/assignments', icon: <ClipboardList className="w-5 h-5" /> },
  { label: 'History', href: '/history', icon: <History className="w-5 h-5" /> },
];

export function MobileNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const tabs = mobileNavItems.slice(0, 4);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 px-2 py-2 bg-[#090d1b]/95 backdrop-blur-md">
        <div className="flex items-center justify-around max-w-md mx-auto">
          {tabs.map((item) => {
            const isActive = navItemIsActive(pathname, item);
            return (
              <Link key={item.href} href={item.href} className={cn('flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors', isActive ? 'text-blue-400' : 'text-slate-500')}>
                {item.icon}<span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
          <button onClick={() => setMenuOpen(true)} className={cn('flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors', menuOpen || pathname === '/settings' ? 'text-blue-400' : 'text-slate-500')}>
            <Menu className="w-5 h-5" /><span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-[#080c19]/98 backdrop-blur-md">
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex items-center gap-3"><Diamond className="w-6 h-6 text-blue-400" /><span className="text-lg font-bold text-white">CrysTrack</span></div>
            <button onClick={() => setMenuOpen(false)} className="p-2 text-slate-400 hover:text-white"><X className="w-6 h-6" /></button>
          </div>
          <nav className="flex-1 p-4 overflow-y-auto">
            <p className="px-2 mb-2 text-[11px] uppercase tracking-[0.16em] text-slate-600">Main</p>
            <div className="space-y-1">
              {mobileNavItems.map((item) => {
                const isActive = navItemIsActive(pathname, item);
                return <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className={cn('flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-medium transition-colors', isActive ? 'bg-blue-500/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/[0.035]')}><span className={isActive ? 'text-blue-400' : ''}>{item.icon}</span><span>{item.label}</span></Link>;
              })}
            </div>
            <p className="px-2 mt-6 mb-2 text-[11px] uppercase tracking-[0.16em] text-slate-600">Plan shortcuts</p>
            <div className="space-y-1">
              {planLinks.map((item) => <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className="flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.035] transition-colors"><span>{item.icon}</span><span>{item.label}</span></Link>)}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
