export interface ThemeColors {
  background: string;
  surface: string;
  surfaceGlass: string;
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
}

export const themes: Record<string, ThemeColors> = {
  morning: {
    background: '#0a1628',
    surface: 'rgba(15, 23, 42, 0.7)',
    surfaceGlass: 'rgba(30, 41, 59, 0.4)',
    primary: '#3b82f6',
    secondary: '#06b6d4',
    accent: '#8b5cf6',
    text: '#f1f5f9',
    textMuted: '#94a3b8',
    border: 'rgba(59, 130, 246, 0.2)',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
    glow: 'rgba(59, 130, 246, 0.3)',
  },
  afternoon: {
    background: '#0f172a',
    surface: 'rgba(15, 23, 42, 0.75)',
    surfaceGlass: 'rgba(30, 41, 59, 0.45)',
    primary: '#60a5fa',
    secondary: '#22d3ee',
    accent: '#a78bfa',
    text: '#f8fafc',
    textMuted: '#cbd5e1',
    border: 'rgba(96, 165, 250, 0.25)',
    success: '#34d399',
    warning: '#fbbf24',
    danger: '#f87171',
    info: '#60a5fa',
    glow: 'rgba(96, 165, 250, 0.35)',
  },
  golden: {
    background: '#1a120b',
    surface: 'rgba(40, 30, 20, 0.7)',
    surfaceGlass: 'rgba(60, 45, 30, 0.4)',
    primary: '#f59e0b',
    secondary: '#fbbf24',
    accent: '#ea580c',
    text: '#fef3c7',
    textMuted: '#d4d4d8',
    border: 'rgba(245, 158, 11, 0.25)',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.35)',
  },
  sunset: {
    background: '#1c1008',
    surface: 'rgba(50, 30, 20, 0.75)',
    surfaceGlass: 'rgba(70, 40, 25, 0.45)',
    primary: '#ea580c',
    secondary: '#f97316',
    accent: '#f59e0b',
    text: '#fef3c7',
    textMuted: '#d6d3d1',
    border: 'rgba(234, 88, 12, 0.3)',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#ea580c',
    glow: 'rgba(234, 88, 12, 0.4)',
  },
  dusk: {
    background: '#0f0a1a',
    surface: 'rgba(20, 15, 40, 0.75)',
    surfaceGlass: 'rgba(40, 30, 70, 0.45)',
    primary: '#7c3aed',
    secondary: '#8b5cf6',
    accent: '#a78bfa',
    text: '#e9d5ff',
    textMuted: '#c4b5fd',
    border: 'rgba(124, 58, 237, 0.25)',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#7c3aed',
    glow: 'rgba(124, 58, 237, 0.35)',
  },
  night: {
    background: '#020617',
    surface: 'rgba(10, 15, 30, 0.8)',
    surfaceGlass: 'rgba(20, 25, 50, 0.5)',
    primary: '#6366f1',
    secondary: '#818cf8',
    accent: '#a5b4fc',
    text: '#e2e8f0',
    textMuted: '#94a3b8',
    border: 'rgba(99, 102, 241, 0.2)',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#6366f1',
    glow: 'rgba(99, 102, 241, 0.3)',
  },
};

export function getCurrentTheme(): ThemeColors {
  const hour = new Date().getHours();
  let key = 'night';
  if (hour >= 5 && hour < 10) key = 'morning';
  else if (hour >= 10 && hour < 16) key = 'afternoon';
  else if (hour >= 16 && hour < 18) key = 'golden';
  else if (hour >= 18 && hour < 19) key = 'sunset';
  else if (hour >= 19 && hour < 21) key = 'dusk';
  return themes[key];
}
