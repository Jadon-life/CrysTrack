import type { ThemePreference, TimePhase } from '@/lib/theme';
export function effectiveWorkspaceTheme(
  preference: ThemePreference,
  phase: TimePhase,
): 'light' | 'dark' {
  return preference === 'adaptive'
    ? phase === 'morning' || phase === 'day'
      ? 'light'
      : 'dark'
    : preference;
}
/** The supplied JPEG is displayed through fixed SVG viewports; its pixels are never redrawn.
 * Transparent original assets can replace these paths without changing theme selection. */
export const officialBrandAssets: {
  light: string | null;
  dark: string | null;
} = {
  light: '/brand/official-reference.jpg',
  dark: '/brand/official-reference.jpg',
};
export function brandAssetForTheme(
  mode: 'light' | 'dark',
  assets = officialBrandAssets,
) {
  return assets[mode];
}
export const workspaceRouteTitles: Record<string, string> = {
  '/': 'Today',
  '/plan': 'Plan',
  '/tasks': 'Tasks',
  '/goals': 'Goals',
  '/assignments': 'Assignments',
  '/calendar': 'Calendar',
  '/finance': 'Wealth',
  '/insights': 'Insights',
  '/history': 'History',
  '/ai': 'AI',
  '/settings': 'Settings',
  '/preview/coach': 'AI preview',
};
