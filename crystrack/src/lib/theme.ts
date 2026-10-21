export type TimePhase = 'morning' | 'day' | 'golden' | 'evening' | 'night';
export type ThemePreference = 'adaptive' | 'light' | 'dark';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceGlass: string;
  surfaceStrong: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  glow: string;
  glassTint: string;
}

export const themes: Record<TimePhase, ThemeColors> = {
  morning: {
    background: '#081523',
    surface: 'rgba(7, 28, 45, 0.78)',
    surfaceGlass: 'rgba(12, 42, 61, 0.58)',
    surfaceStrong: 'rgba(5, 20, 34, 0.88)',
    primary: '#38a8ff',
    secondary: '#48d7d0',
    accent: '#f7a85a',
    text: '#f8fbff',
    textMuted: '#c5d2dd',
    border: 'rgba(206, 235, 255, 0.25)',
    success: '#4ade80',
    warning: '#fbbf24',
    danger: '#fb7185',
    info: '#60a5fa',
    glow: 'rgba(56, 168, 255, 0.28)',
    glassTint: 'rgba(8, 34, 52, 0.62)',
  },
  day: {
    background: '#0a1724',
    surface: 'rgba(10, 31, 46, 0.78)',
    surfaceGlass: 'rgba(16, 50, 67, 0.56)',
    surfaceStrong: 'rgba(7, 25, 39, 0.9)',
    primary: '#4aa8ff',
    secondary: '#4fd1c5',
    accent: '#f59e6a',
    text: '#f8fbff',
    textMuted: '#c7d4df',
    border: 'rgba(219, 239, 252, 0.24)',
    success: '#4ade80',
    warning: '#fbbf24',
    danger: '#fb7185',
    info: '#60a5fa',
    glow: 'rgba(74, 168, 255, 0.24)',
    glassTint: 'rgba(10, 37, 53, 0.62)',
  },
  golden: {
    background: '#1c1209',
    surface: 'rgba(40, 27, 17, 0.8)',
    surfaceGlass: 'rgba(67, 42, 23, 0.58)',
    surfaceStrong: 'rgba(28, 18, 11, 0.9)',
    primary: '#F88F22',
    secondary: '#FBB931',
    accent: '#EA6113',
    text: '#FFF6E7',
    textMuted: '#E5D7C6',
    border: 'rgba(255, 227, 179, 0.26)',
    success: '#5fd278',
    warning: '#FBB931',
    danger: '#ff6b5f',
    info: '#69a7ff',
    glow: 'rgba(248, 143, 34, 0.3)',
    glassTint: 'rgba(47, 29, 16, 0.66)',
  },
  evening: {
    background: '#170f0b',
    surface: 'rgba(31, 21, 16, 0.84)',
    surfaceGlass: 'rgba(48, 31, 20, 0.62)',
    surfaceStrong: 'rgba(20, 14, 11, 0.92)',
    primary: '#F88F22',
    secondary: '#FBB931',
    accent: '#EA6113',
    text: '#FFF7EA',
    textMuted: '#E7D9C8',
    border: 'rgba(255, 227, 179, 0.25)',
    success: '#5dd574',
    warning: '#FBB931',
    danger: '#ff6b5f',
    info: '#64a8ff',
    glow: 'rgba(234, 97, 19, 0.32)',
    glassTint: 'rgba(38, 24, 16, 0.72)',
  },
  night: {
    background: '#050914',
    surface: 'rgba(7, 12, 25, 0.86)',
    surfaceGlass: 'rgba(13, 22, 40, 0.64)',
    surfaceStrong: 'rgba(4, 8, 18, 0.94)',
    primary: '#8ab4ff',
    secondary: '#7dd3fc',
    accent: '#a78bfa',
    text: '#f5f8ff',
    textMuted: '#b8c3d3',
    border: 'rgba(173, 202, 255, 0.2)',
    success: '#4ade80',
    warning: '#fbbf24',
    danger: '#fb7185',
    info: '#60a5fa',
    glow: 'rgba(99, 143, 255, 0.25)',
    glassTint: 'rgba(8, 14, 27, 0.76)',
  },
};

export function getThemeForPhase(phase: TimePhase, preference: ThemePreference = 'adaptive'): ThemeColors {
  if (preference === 'light') return themes.morning;
  if (preference === 'dark') return phase === 'golden' || phase === 'evening' ? themes.evening : themes.night;
  return themes[phase];
}

export function getFallbackPhase(date = new Date()): TimePhase {
  const hour = date.getHours();
  if (hour >= 5 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 16) return 'day';
  if (hour >= 16 && hour < 18) return 'golden';
  if (hour >= 18 && hour < 21) return 'evening';
  return 'night';
}

// Backwards-compatible helper for components that existed before the adaptive engine.
export function getCurrentTheme(): ThemeColors {
  return getThemeForPhase(getFallbackPhase());
}
