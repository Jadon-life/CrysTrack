'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none',
          size === 'sm' && 'h-8 px-3 text-xs',
          size === 'md' && 'h-10 px-4 text-sm',
          size === 'lg' && 'h-12 px-6 text-base',
          variant === 'default' && 'bg-white/10 text-white hover:bg-white/15 border border-white/10',
          variant === 'primary' && 'bg-blue-500/20 text-blue-100 hover:bg-blue-500/30 border border-blue-500/30 shadow-lg shadow-blue-500/10',
          variant === 'ghost' && 'text-slate-400 hover:text-white hover:bg-white/5',
          variant === 'outline' && 'border border-white/20 text-white hover:bg-white/5',
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button };
