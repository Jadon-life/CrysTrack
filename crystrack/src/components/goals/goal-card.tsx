'use client';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import { useTheme } from '@/components/layout/theme-provider';
/** Local surface avoids inheriting the older glass treatment from other routes. */
export function GoalCard({
  children,
  className,
  style,
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  hover?: boolean;
  padding?: string;
}) {
  const { reducedMotion } = useTheme();
  const move = (event: PointerEvent<HTMLElement>) => {
    if (
      !hover ||
      reducedMotion ||
      event.pointerType === 'touch' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const el = event.currentTarget,
      rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width,
      y = (event.clientY - rect.top) / rect.height;
    el.style.setProperty('--glass-pointer-x', `${x * 100}%`);
    el.style.setProperty('--glass-pointer-y', `${y * 100}%`);
    el.style.setProperty('--goal-tilt-x', `${(0.5 - y) * 2}deg`);
    el.style.setProperty('--goal-tilt-y', `${(x - 0.5) * 2}deg`);
  };
  return (
    <article
      className={className}
      style={style}
      onPointerMove={move}
      onPointerLeave={(event) => {
        event.currentTarget.style.setProperty('--goal-tilt-x', '0deg');
        event.currentTarget.style.setProperty('--goal-tilt-y', '0deg');
      }}
    >
      {children}
    </article>
  );
}
