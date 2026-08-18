'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
  padding?: 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
}

export function GlassCard({ children, className, hover = false, glow = false, padding = 'md', style }: GlassCardProps) {
  return (
    <div
      style={style}
      className={cn(
        'rounded-xl border border-white/10 bg-[#0e1425]/78 backdrop-blur-sm transition-colors duration-200',
        padding === 'sm' && 'p-3',
        padding === 'md' && 'p-5',
        padding === 'lg' && 'p-6',
        hover && 'hover:border-white/15 hover:bg-[#11182b]/90',
        glow && 'border-blue-500/15',
        className,
      )}
    >
      {children}
    </div>
  );
}
