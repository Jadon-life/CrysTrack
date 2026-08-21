'use client';

import React from 'react';
import {
  immersiveIntrosEnabled,
  setImmersiveIntrosEnabled,
  subscribeImmersiveIntroPreference,
} from '@/lib/immersive-experience';
import { cn } from '@/lib/utils';

export function ImmersiveIntroToggle() {
  const [enabled, setEnabled] = React.useState(true);

  React.useEffect(() => {
    setEnabled(immersiveIntrosEnabled());
    return subscribeImmersiveIntroPreference(setEnabled);
  }, []);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setImmersiveIntrosEnabled(next);
  };

  return (
    <div className="flex items-center justify-between mt-5 pt-5 border-t border-white/10">
      <div className="pr-5">
        <p className="text-sm font-medium text-white">Immersive entrances</p>
        <p className="text-xs text-[var(--theme-text-muted)] mt-1">
          Show the morning, evening and night cinematic entrance once per local time block.
        </p>
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-label="Toggle immersive entrances"
        aria-pressed={enabled}
        className={cn('w-11 h-6 rounded-full relative transition-colors shrink-0', enabled ? 'bg-[var(--theme-primary)]' : 'bg-white/10')}
      >
        <span className={cn('absolute top-1 w-4 h-4 rounded-full bg-white transition-all', enabled ? 'left-6' : 'left-1')} />
      </button>
    </div>
  );
}
