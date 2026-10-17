'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/layout/theme-provider';
import type { Rocker3D, RockerPalette } from '@/lib/three-rocker';

/** Physical Light/Dark rocker. Adaptive stays in Settings > Appearance. */
export function PhysicalThemeSwitch() {
  const { theme, preference, environment, reducedMotion, setPreference } = useTheme();
  const isLight = preference === 'light' || (
    preference === 'adaptive' && (environment.phase === 'morning' || environment.phase === 'day')
  );
  const palette = useMemo<RockerPalette>(() => ({
    background: theme.background,
    border: theme.border,
    primary: theme.primary,
  }), [theme.background, theme.border, theme.primary]);

  const [ready, setReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<Rocker3D | null>(null);
  const latestRef = useRef({ isLight, reducedMotion, palette });

  useEffect(() => {
    latestRef.current = { isLight, reducedMotion, palette };
    modelRef.current?.update(isLight, reducedMotion, palette);
  }, [isLight, reducedMotion, palette]);

  useEffect(() => {
    let mounted = true;
    const start = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const { mountRocker } = await import('@/lib/three-rocker');
        if (!mounted || !canvas.isConnected) return;
        const current = latestRef.current;
        const model = mountRocker(canvas, current.isLight, current.palette);
        if (!mounted) { model.dispose(); return; }
        modelRef.current = model;
        model.update(current.isLight, current.reducedMotion, current.palette);
        setReady(true);
      } catch {
        if (mounted) setReady(false);
      }
    };
    void start();
    return () => {
      mounted = false;
      modelRef.current?.dispose();
      modelRef.current = null;
    };
  }, []);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLight}
      aria-label={isLight ? 'Light appearance active' : 'Dark appearance active'}
      aria-description={preference === 'adaptive'
        ? 'Automatic time-of-day appearance is active. Press to choose a manual mode. Adaptive remains in Settings, Appearance.'
        : 'Press to toggle Light and Dark. Adaptive remains in Settings, Appearance.'}
      title={preference === 'adaptive'
        ? 'Adaptive active · Switch to ' + (isLight ? 'Dark' : 'Light')
        : 'Switch to ' + (isLight ? 'Dark' : 'Light') + ' appearance'}
      data-mode={isLight ? 'light' : 'dark'}
      data-auto={preference === 'adaptive' ? 'true' : 'false'}
      data-ready={ready ? 'true' : 'false'}
      onClick={() => void setPreference(isLight ? 'dark' : 'light')}
      className="crys-3d-switch"
    >
      <canvas ref={canvasRef} className="crys-3d-switch__canvas" aria-hidden="true" />
      <span className="crys-3d-switch__fallback" aria-hidden="true" />
      <span className="crys-3d-switch__fallback-icons" aria-hidden="true">
        <Sun className="h-3.5 w-3.5" />
        <Moon className="h-3.5 w-3.5" />
      </span>
      <span className="crys-3d-switch__auto" aria-hidden="true" />
    </button>
  );
}
