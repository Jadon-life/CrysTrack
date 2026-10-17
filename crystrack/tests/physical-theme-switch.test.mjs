import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (path) => fs.readFileSync(path, 'utf8');

test('navigation has tactile 2-state accessible switch that keeps Adaptive phase behavior', () => {
  const nav = read('src/components/navigation/top-navigation.tsx');
  const component = read('src/components/navigation/physical-theme-switch.tsx');
  assert.match(nav, /<PhysicalThemeSwitch \/>/);
  assert.doesNotMatch(nav, /function ThemeControl/);
  assert.match(component, /role="switch"/);
  assert.match(component, /aria-checked=\{isLight\}/);
  assert.match(component, /aria-label="Light mode"/);
  assert.match(component, /onClick=\{\(\) => void setPreference\(nextPreference\)\}/);
  assert.match(component, /preference === 'adaptive'/);
  assert.match(component, /environment.phase === 'morning'/);
  assert.match(component, /environment.phase === 'day'/);
});

test('Settings still includes the actual time-of-day Adaptive preference', () => {
  const settings = read('src/app/settings/page.tsx');
  const provider = read('src/components/layout/theme-provider.tsx');
  assert.match(settings, /id: 'adaptive', label: 'Adaptive'/);
  assert.match(settings, /automatic time-of-day appearance/);
  assert.match(provider, /savePreference\(\{ themePreference: value \}\)/);
});

test('physical CSS uses real depth, graceful contrast and minimal scrollbars', () => {
  const layout = read('src/app/layout.tsx');
  const css = read('src/app/premium-controls.css');
  assert.ok(layout.indexOf("import './premium-controls.css';") > layout.indexOf("import './premium-glass-refinement.css';"));
  for (const regex of [/perspective: 260px/,/rotateY\(/,/box-shadow:/,/::-webkit-scrollbar-thumb/,/scrollbar-width: thin/,/\.scrollbar-hide/,/forced-colors: active/,/prefers-reduced-motion: reduce/,/:focus-visible/]) {
    assert.match(css, regex);
  }
});
