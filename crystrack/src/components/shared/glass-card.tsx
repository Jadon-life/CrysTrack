'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
  as?: 'div' | 'section' | 'article';
}

export function GlassCard({
  children,
  className,
  hover = false,
  glow = false,
  padding = 'md',
  style,
  as: Component = 'div',
}: GlassCardProps) {
  return (
    <Component
      style={style}
      className={cn(
        'crys-glass-card',
        padding === 'sm' && 'p-3 sm:p-3.5',
        padding === 'md' && 'p-4 sm:p-5',
        padding === 'lg' && 'p-5 sm:p-6',
        hover && 'crys-glass-card--hover',
        glow && 'crys-glass-card--glow',
        className,
      )}
    >
      {children}
    </Component>
  );
}
