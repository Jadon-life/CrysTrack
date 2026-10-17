'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/components/layout/theme-provider';
import type { Rocker3D } from '@/lib/three-rocker';

/**
 * Real Three.js rocker: ON = Light; OFF = Dark.
 * Adaptive stays in Settings and the button always works without WebGL.
 */
export function PhysicalThemeSwitch() {
  const { preference, environment, reducedMotion, setPreference } = useTheme();
  const isLight = preference === 'light' || (
    preference === 'adaptive' && (environment.phase === 'morning' || environment.phase === 'day')
  );
  const [ready, setReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<Rocker3D | null>(null);
  const latestRef = useRef({ isLight, reducedMotion });

  useEffect(() => {
    latestRef.current = { isLight, reducedMotion };
    modelRef.current?.update(isLight, reducedMotion);
  }, [isLight, reducedMotion]);

  useEffect(() => {
    let mounted = true;
    const start = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        // Three.js and its GPU code are not loaded for server rendering.
        const { mountRocker } = await import('@/lib/three-rocker');
        if (!mounted || !canvas.isConnected) return;
        const model = mountRocker(canvas, latestRef.current.isLight);
        if (!mounted) { model.dispose(); return; }
        modelRef.current = model;
        model.update(latestRef.current.isLight, latestRef.current.reducedMotion);
        setReady(true);
      } catch {
        // Canvas/WebGL-disabled browser: preserve the semantic CSS switch.
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
      aria-label="Light mode"
      aria-description={preference === 'adaptive'
        ? 'Automatic time-of-day theme is active. Press to choose a manual mode. Restore Adaptive in Settings, Appearance.'
        : 'Press to toggle Light and Dark. Adaptive is in Settings, Appearance.'}
      title={preference === 'adaptive'
        ? 'Adaptive active · Switch to ' + (isLight ? 'Dark' : 'Light') + ' · Auto in Settings'
        : 'Switch to ' + (isLight ? 'Dark' : 'Light') + ' mode'}
      data-mode={isLight ? 'on' : 'off'}
      data-auto={preference === 'adaptive' ? 'true' : 'false'}
      data-ready={ready ? 'true' : 'false'}
      onClick={() => void setPreference(isLight ? 'dark' : 'light')}
      className="crys-3d-switch"
    >
      <canvas ref={canvasRef} className="crys-3d-switch__canvas" aria-hidden="true" />
      <span className="crys-3d-switch__fallback" aria-hidden="true" />
      <span className="crys-3d-switch__labels" aria-hidden="true"><span>ON</span><span>OFF</span></span>
      <span className="crys-3d-switch__auto" aria-hidden="true" />
    </button>
  );
}
