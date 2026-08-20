'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  depth?: 'standard' | 'substantial';
  style?: React.CSSProperties;
  as?: 'div' | 'section' | 'article';
}

function setGlassPointer(element: HTMLElement, clientX: number, clientY: number) {
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

  element.style.setProperty('--glass-pointer-x', `${(x * 100).toFixed(2)}%`);
  element.style.setProperty('--glass-pointer-y', `${(y * 100).toFixed(2)}%`);
  element.style.setProperty('--glass-fluid-x', `${((x - 0.5) * 5).toFixed(2)}px`);
  element.style.setProperty('--glass-fluid-y', `${((y - 0.5) * 3.5).toFixed(2)}px`);
}

export function GlassCard({
  children,
  className,
  hover = false,
  glow = false,
  padding = 'md',
  depth = 'standard',
  style,
  as: Component = 'div',
}: GlassCardProps) {
  const pressTimer = React.useRef<number | null>(null);

  React.useEffect(() => () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
  }, []);

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch') return;
    setGlassPointer(event.currentTarget, event.clientX, event.clientY);
  };

  const handlePointerLeave = (event: React.PointerEvent<HTMLElement>) => {
    const element = event.currentTarget;
    element.style.setProperty('--glass-pointer-x', '50%');
    element.style.setProperty('--glass-pointer-y', '45%');
    element.style.setProperty('--glass-fluid-x', '0px');
    element.style.setProperty('--glass-fluid-y', '0px');
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    const element = event.currentTarget;
    setGlassPointer(element, event.clientX, event.clientY);

    element.removeAttribute('data-glass-pressed');
    // Force the liquid-settle animation to restart on repeated taps without
    // introducing React state or re-rendering card contents.
    void element.offsetWidth;
    element.setAttribute('data-glass-pressed', 'true');

    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      element.removeAttribute('data-glass-pressed');
      pressTimer.current = null;
    }, 560);
  };

  return (
    <Component
      style={style}
      data-glass-reactive="true"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      className={cn(
        'crys-glass-card',
        depth === 'substantial' && 'crys-glass-card--substantial',
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
