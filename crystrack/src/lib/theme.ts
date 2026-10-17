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

export function getThemeForPhase(
  phase: TimePhase,
  preference: ThemePreference = 'adaptive',
): ThemeColors {
  if (preference === 'light') return themes.morning;
  if (preference === 'dark')
    return phase === 'golden' || phase === 'evening'
      ? themes.evening
      : themes.night;
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

/** Scoped Piece 4 surfaces. Existing scene palettes and navigation remain intact. */
export const goalThemeTokens = {
  '--goal-gold': '#D9B65D',
  '--goal-ivory': 'var(--workspace-text,#F6F1E4)',
  '--goal-muted': 'var(--workspace-muted,#B7BED1)',
  '--goal-glass': 'var(--glass-card,rgba(10,22,52,.55))',
  '--goal-shade': 'var(--glass-reading,rgba(3,5,11,.70))',
  '--goal-border':
    'linear-gradient(135deg,rgba(217,182,93,.4),rgba(255,255,255,.08))',
};

/** Wealth keeps the shared glass shell and uses opaque inner surfaces for data. */
export const wealthThemeTokens = {
  ...goalThemeTokens,
  '--wealth-data': 'var(--glass-reading,#0A1634)',
  '--wealth-raised': 'var(--workspace-hover,#13244F)',
  '--wealth-gold': '#D9B65D',
  '--wealth-ivory': 'var(--workspace-text,#F6F1E4)',
  '--wealth-muted': 'var(--workspace-muted,#B7BED1)',
};

export const gamificationThemeTokens = {
  ...goalThemeTokens,
  '--xp-gold': '#D9B65D',
  '--xp-bright': '#F0D48A',
  '--xp-muted': 'var(--workspace-muted,#B7BED1)',
  '--xp-ivory': 'var(--workspace-text,#F6F1E4)',
};

export const coachThemeTokens = {
  ...goalThemeTokens,
  '--coach-accent': '#D9B65D',
  '--coach-text': 'var(--workspace-text,#F6F1E4)',
  '--coach-muted': 'var(--workspace-muted,#B7BED1)',
  '--coach-glass': 'var(--glass-card,rgba(10,22,52,.55))',
};

/** CrysTrack 2.0: one coordinated surface system for photos, overlays and page modules. */
export function workspaceThemeTokens(
  mode: 'light' | 'dark',
): Record<string, string> {
  const light = mode === 'light';
  return {
    '--glass-blur': '20px',
    '--glass-saturation': '180%',
    '--glass-shell': light ? 'rgba(241,247,255,.62)' : 'rgba(10,19,36,.42)',
    '--glass-sidebar': light ? 'rgba(237,245,255,.54)' : 'rgba(8,17,34,.46)',
    '--glass-card': light ? 'rgba(255,255,255,.56)' : 'rgba(10,20,40,.48)',
    '--glass-elevated': light ? 'rgba(247,250,255,.96)' : 'rgba(8,17,35,.94)',
    '--glass-reading': light ? 'rgba(243,248,255,.74)' : 'rgba(8,17,35,.68)',
    '--glass-border': light ? 'rgba(255,255,255,.70)' : 'rgba(255,255,255,.19)',
    '--glass-highlight': 'rgba(255,255,255,.10)',
    '--workspace-text': light ? '#17263B' : '#F6F1E4',
    '--workspace-muted': light ? '#394B64' : '#D2DAE6',
    '--workspace-subtle': light ? '#394B64' : '#CBD4E1',
    '--workspace-shadow': light ? 'rgba(8,18,36,.18)' : 'rgba(0,0,0,.30)',
    '--workspace-control': light
      ? 'rgba(255,255,255,.36)'
      : 'rgba(255,255,255,.06)',
    '--workspace-hover': light
      ? 'rgba(255,255,255,.62)'
      : 'rgba(255,255,255,.09)',
    '--workspace-blue-text': light ? '#1358B8' : '#91BEFF',
    '--workspace-green-text': light ? '#096344' : '#65E5BA',
    '--workspace-gold-text': light ? '#795210' : '#EFD18B',
    '--action-blue': '#1C64D7',
    '--action-blue-hover': '#216DE0',
    '--accent-blue': '#3284ff',
    '--accent-cyan': '#28c8ef',
    '--accent-emerald': '#24d49b',
    '--accent-gold': '#e2ba62',
    '--glass-shell-radius': '30px',
    '--glass-card-radius': '20px',
  };
}
