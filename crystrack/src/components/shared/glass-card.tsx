'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
  padding?: 'sm' | 'md' | 'lg';
}

export function GlassCard({ 
  children, 
  className, 
  hover = false, 
  glow = false,
  padding = 'md' 
}: GlassCardProps) {
  return (
    <div 
      className={cn(
        'rounded-xl border border-white/10 backdrop-blur-xl transition-all duration-300',
        padding === 'sm' && 'p-3',
        padding === 'md' && 'p-5',
        padding === 'lg' && 'p-6',
        hover && 'hover:border-white/20 hover:bg-white/[0.07] cursor-pointer',
        glow && 'shadow-lg shadow-blue-500/10',
        'bg-white/[0.03]',
        className
      )}
    >
      {children}
    </div>
  );
}
