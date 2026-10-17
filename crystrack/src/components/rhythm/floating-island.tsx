'use client';
import { useState } from 'react';
import { FocusTimer } from '@/components/dashboard/focus-timer';
import { useRhythm } from './rhythm-provider';
import { RitualFlow } from './ritual-flow';
export function FloatingIsland() {
  const { data } = useRhythm();
  const [ritual, setRitual] = useState<'morning' | 'evening' | 'weekly' | null>(
      null,
    ),
    [expanded, setExpanded] = useState(false);
  return (
    <>
      <aside
        className="rhythm-island"
        aria-label="Daily rhythm floating island"
      >
        <button onClick={() => setRitual('morning')}>Plan</button>
        <button onClick={() => setRitual('evening')}>Wrap up</button>
        <button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          Focus timer
        </button>
        <div
          className={
            expanded || data?.focus
              ? 'rhythm-island-timer'
              : 'rhythm-island-timer rhythm-island-timer-collapsed'
          }
        >
          <FocusTimer compact />
        </div>
      </aside>
      {ritual && <RitualFlow kind={ritual} onClose={() => setRitual(null)} />}
    </>
  );
}
