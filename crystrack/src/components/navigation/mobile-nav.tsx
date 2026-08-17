'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { mobileNavItems } from './nav-items';
import { cn } from '@/lib/utils';
import { Menu, X, Diamond } from 'lucide-react';

export function MobileNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 px-2 py-2"
        style={{ background: 'rgba(10, 14, 39, 0.9)', backdropFilter: 'blur(20px)' }}
      >
        <div className="flex items-center justify-around max-w-md mx-auto">
          {mobileNavItems.slice(0, 4).map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors',
                  isActive ? 'text-blue-400' : 'text-slate-500'
                )}
              >
                {item.icon}
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setMenuOpen(true)}
            className={cn(
              'flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors',
              menuOpen ? 'text-blue-400' : 'text-slate-500'
            )}
          >
            <Menu className="w-6 h-6" />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* Full Screen Menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col"
          style={{ background: 'rgba(10, 14, 39, 0.98)', backdropFilter: 'blur(20px)' }}
        >
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <Diamond className="w-6 h-6 text-blue-400" />
              <span className="text-lg font-bold text-white">CrysTrack</span>
            </div>
            <button onClick={() => setMenuOpen(false)} className="p-2 text-slate-400 hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>
          <nav className="flex-1 p-4 space-y-2">
            {mobileNavItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-4 px-4 py-4 rounded-xl text-lg font-medium transition-all',
                    isActive 
                      ? 'bg-white/10 text-white' 
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  <span className={isActive ? 'text-blue-400' : ''}>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}
