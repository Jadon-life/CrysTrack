'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getCurrentTheme, type ThemeColors } from '@/lib/theme';

interface ThemeContextType {
  theme: ThemeColors;
  timeOfDay: string;
  reducedMotion: boolean;
  setReducedMotion: (v: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeColors>(getCurrentTheme());
  const [timeOfDay, setTimeOfDay] = useState<string>(() => {
    const hour = new Date().getHours();
    if (hour < 10) return 'morning';
    if (hour < 16) return 'afternoon';
    if (hour < 18) return 'golden-hour';
    if (hour < 19) return 'sunset';
    if (hour < 21) return 'dusk';
    return 'night';
  });
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    // Check reduced motion preference
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);

    // Update theme every minute
    const interval = setInterval(() => {
      setTheme(getCurrentTheme());
      const hour = new Date().getHours();
      if (hour < 10) setTimeOfDay('morning');
      else if (hour < 16) setTimeOfDay('afternoon');
      else if (hour < 18) setTimeOfDay('golden-hour');
      else if (hour < 19) setTimeOfDay('sunset');
      else if (hour < 21) setTimeOfDay('dusk');
      else setTimeOfDay('night');
    }, 60000);

    return () => {
      mq.removeEventListener('change', handler);
      clearInterval(interval);
    };
  }, []);

  // Apply CSS variables from theme
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--theme-bg', theme.background);
    root.style.setProperty('--theme-surface', theme.surface);
    root.style.setProperty('--theme-primary', theme.primary);
    root.style.setProperty('--theme-secondary', theme.secondary);
    root.style.setProperty('--theme-accent', theme.accent);
    root.style.setProperty('--theme-text', theme.text);
    root.style.setProperty('--theme-text-muted', theme.textMuted);
    root.style.setProperty('--theme-border', theme.border);
    root.style.setProperty('--theme-glow', theme.glow);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, timeOfDay, reducedMotion, setReducedMotion }}>
      {children}
    </ThemeContext.Provider>
  );
}
