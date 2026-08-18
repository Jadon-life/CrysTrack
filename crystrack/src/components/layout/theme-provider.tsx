'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fallbackEnvironment, loadEnvironment, type EnvironmentState } from '@/lib/environment';
import { getThemeForPhase, type ThemeColors, type ThemePreference } from '@/lib/theme';

interface ThemeContextType {
  theme: ThemeColors;
  timeOfDay: string;
  reducedMotion: boolean;
  setReducedMotion: (value: boolean) => void;
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => Promise<void>;
  environment: EnvironmentState;
  environmentLoading: boolean;
  locationPermission: PermissionState | 'unsupported' | 'unknown';
  requestLocation: (options?: { prompt?: boolean }) => Promise<void>;
  refreshEnvironment: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}

async function savePreference(payload: Record<string, unknown>) {
  try {
    await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // The interface remains functional if preference persistence is temporarily unavailable.
  }
}

async function saveDetectedLocation(environment: EnvironmentState) {
  try {
    await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentTimezone: environment.timezone,
        currentCity: environment.city,
        currentCountryCode: environment.countryCode,
      }),
    });
  } catch {
    // Location persistence is best-effort; precise coordinates are intentionally never sent.
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [environment, setEnvironment] = useState<EnvironmentState>(() => fallbackEnvironment());
  const [environmentLoading, setEnvironmentLoading] = useState(false);
  const [preference, setPreferenceState] = useState<ThemePreference>('adaptive');
  const [reducedMotion, setReducedMotionState] = useState(false);
  const [locationPermission, setLocationPermission] = useState<PermissionState | 'unsupported' | 'unknown'>('unknown');

  const theme = useMemo(() => getThemeForPhase(environment.phase, preference), [environment.phase, preference]);

  const resolvePermission = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setLocationPermission('unsupported');
      return 'unsupported' as const;
    }
    if (!navigator.permissions?.query) {
      setLocationPermission('unknown');
      return 'unknown' as const;
    }
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      setLocationPermission(result.state);
      result.onchange = () => setLocationPermission(result.state);
      return result.state;
    } catch {
      setLocationPermission('unknown');
      return 'unknown' as const;
    }
  }, []);

  const loadApproximateEnvironment = useCallback(async () => {
    setEnvironmentLoading(true);
    try {
      setEnvironment(await loadEnvironment());
    } finally {
      setEnvironmentLoading(false);
    }
  }, []);

  const requestLocation = useCallback(async (options?: { prompt?: boolean }) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      await loadApproximateEnvironment();
      return;
    }

    const permission = await resolvePermission();
    if (permission === 'denied' || (permission === 'prompt' && options?.prompt === false)) {
      await loadApproximateEnvironment();
      return;
    }

    setEnvironmentLoading(true);
    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const next = await loadEnvironment({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
            setEnvironment(next);
            await saveDetectedLocation(next);
          } finally {
            setEnvironmentLoading(false);
            resolve();
          }
        },
        async () => {
          try {
            setEnvironment(await loadEnvironment());
          } finally {
            setEnvironmentLoading(false);
            resolve();
          }
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 15 * 60 * 1000 },
      );
    });
  }, [loadApproximateEnvironment, resolvePermission]);

  const refreshEnvironment = useCallback(async () => {
    await requestLocation({ prompt: false });
  }, [requestLocation]);

  const setPreference = useCallback(async (value: ThemePreference) => {
    setPreferenceState(value);
    await savePreference({ themePreference: value });
  }, []);

  const setReducedMotion = useCallback((value: boolean) => {
    setReducedMotionState(value);
    void savePreference({ reducedMotion: value });
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotionState(media.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotionState(event.matches);
    media.addEventListener('change', onChange);

    void resolvePermission();
    void loadApproximateEnvironment();

    fetch('/api/preferences')
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!data) return;
        if (['adaptive', 'light', 'dark'].includes(data.theme_preference)) setPreferenceState(data.theme_preference);
        if (typeof data.reduced_motion === 'boolean') setReducedMotionState(data.reduced_motion);
      })
      .catch(() => null);

    return () => media.removeEventListener('change', onChange);
  }, [loadApproximateEnvironment, resolvePermission]);

  useEffect(() => {
    const interval = window.setInterval(() => void refreshEnvironment(), 10 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [refreshEnvironment]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.phase = environment.phase;
    root.dataset.weather = environment.weather;
    root.dataset.themePreference = preference;
    root.style.setProperty('--theme-bg', theme.background);
    root.style.setProperty('--theme-surface', theme.surface);
    root.style.setProperty('--theme-surface-glass', theme.surfaceGlass);
    root.style.setProperty('--theme-surface-strong', theme.surfaceStrong);
    root.style.setProperty('--theme-primary', theme.primary);
    root.style.setProperty('--theme-secondary', theme.secondary);
    root.style.setProperty('--theme-accent', theme.accent);
    root.style.setProperty('--theme-text', theme.text);
    root.style.setProperty('--theme-text-muted', theme.textMuted);
    root.style.setProperty('--theme-border', theme.border);
    root.style.setProperty('--theme-glow', theme.glow);
    root.style.setProperty('--theme-glass-tint', theme.glassTint);
  }, [environment.phase, environment.weather, preference, theme]);

  return (
    <ThemeContext.Provider value={{
      theme,
      timeOfDay: environment.phase,
      reducedMotion,
      setReducedMotion,
      preference,
      setPreference,
      environment,
      environmentLoading,
      locationPermission,
      requestLocation,
      refreshEnvironment,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}
