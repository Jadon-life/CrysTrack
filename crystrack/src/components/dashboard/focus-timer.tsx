'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { getLocalDateKey } from '@/lib/utils';

type Mode = 'focus' | 'short' | 'long';

const MODES: Record<Mode, { label: string; minutes: number }> = {
  focus: { label: 'Focus', minutes: 25 },
  short: { label: 'Short Break', minutes: 5 },
  long: { label: 'Long Break', minutes: 15 },
};

function storageKey() {
  return `crystrack-focus-seconds:${getLocalDateKey()}`;
}

export function FocusTimer({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>('focus');
  const [remaining, setRemaining] = useState(MODES.focus.minutes * 60);
  const [running, setRunning] = useState(false);
  const focusSecondsRef = useRef(0);

  useEffect(() => {
    focusSecondsRef.current = Number(window.localStorage.getItem(storageKey()) || 0);
  }, []);

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          setRunning(false);
          return 0;
        }
        return current - 1;
      });

      if (mode === 'focus') {
        focusSecondsRef.current += 1;
        if (focusSecondsRef.current % 5 === 0) {
          window.localStorage.setItem(storageKey(), String(focusSecondsRef.current));
          window.dispatchEvent(new CustomEvent('crystrack:focus-update', { detail: { seconds: focusSecondsRef.current } }));
        }
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [running, mode]);

  const total = MODES[mode].minutes * 60;
  const progress = Math.max(0, Math.min(100, ((total - remaining) / total) * 100));
  const time = useMemo(() => {
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [remaining]);

  const changeMode = (next: Mode) => {
    setMode(next);
    setRunning(false);
    setRemaining(MODES[next].minutes * 60);
  };

  const reset = () => {
    setRunning(false);
    setRemaining(MODES[mode].minutes * 60);
  };

  return (
    <div className={compact ? 'space-y-3' : 'grid md:grid-cols-[180px_1fr] gap-5 items-center'}>
      <div className="relative aspect-square max-w-[180px] mx-auto w-full">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(var(--theme-accent) ${progress}%, rgba(255,255,255,.1) ${progress}% 100%)`,
          }}
        />
        <div className="absolute inset-[7px] rounded-full bg-[color-mix(in_srgb,var(--theme-surface-strong)_96%,transparent)] grid place-items-center border border-white/10">
          <div className="text-center">
            <p className="dashboard-metric-value text-3xl font-semibold text-white">{time}</p>
            <p className="text-xs text-[var(--theme-text-muted)] mt-1">{MODES[mode].label}</p>
          </div>
        </div>
      </div>

      <div>
        <select
          value={mode}
          onChange={(event) => changeMode(event.target.value as Mode)}
          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white"
        >
          <option value="focus" className="bg-slate-950">Pomodoro · 25 min</option>
          <option value="short" className="bg-slate-950">Short break · 5 min</option>
          <option value="long" className="bg-slate-950">Long break · 15 min</option>
        </select>

        <div className="mt-3 space-y-2 text-[11px] text-[var(--theme-text-muted)]">
          {(Object.keys(MODES) as Mode[]).map((key) => (
            <button
              type="button"
              key={key}
              onClick={() => changeMode(key)}
              className="w-full flex items-center gap-2 text-left hover:text-white"
            >
              <span className={`w-2 h-2 rounded-full ${mode === key ? 'bg-[var(--theme-accent)]' : 'bg-white/35'}`} />
              {MODES[key].label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-4">
          <button
            type="button"
            onClick={() => setRunning((value) => !value)}
            className="w-11 h-11 rounded-full grid place-items-center bg-[var(--theme-accent)] text-white shadow-lg shadow-black/20"
            aria-label={running ? 'Pause focus timer' : 'Start focus timer'}
          >
            {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={reset}
            className="w-10 h-10 rounded-full grid place-items-center border border-white/10 bg-black/15 text-[var(--theme-text-muted)] hover:text-white"
            aria-label="Reset focus timer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
