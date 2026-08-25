import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }

test('Phase 3 ceremonies coexist with the final still-image renderer', () => {
  const renderer = read('src/components/layout/environment-background.tsx');
  assert.match(renderer, /environment-still-image/);
  assert.doesNotMatch(renderer, /<video/);
  assert.doesNotMatch(renderer, /youtube\.com\/iframe_api/);
});

test('entrance ceremonies are visible, versioned, previewable and marked only after experience', () => {
  const component = read('src/components/layout/immersive-ceremony.tsx');
  const logic = read('src/lib/immersive-experience.ts');
  const toggle = read('src/components/settings/immersive-intro-toggle.tsx');
  assert.match(component, /setReady\(true\)/);
  assert.match(component, /if \(block && !previewing\) markCeremonySeen/);
  assert.doesNotMatch(component, /markCeremonySeen\(userKey, nextBlock/);
  assert.match(component, /2400/);
  assert.match(component, /Clean the glass\?/);
  assert.match(logic, /crystrack-ceremony-v2/);
  assert.match(logic, /cores <= 2 \|\| memory <= 2/);
  assert.match(logic, /PREVIEW_EVENT/);
  assert.match(toggle, /\['morning', 'evening', 'night'\]/);
  assert.match(toggle, /Preview \{block\}/);
});

test('ceremony timing follows live local phase and location date', () => {
  const theme = read('src/components/layout/theme-provider.tsx');
  const layout = read('src/components/layout/app-layout.tsx');
  assert.match(theme, /environmentLocalIso/);
  assert.match(theme, /setInterval\(tick, 60_000\)/);
  assert.match(theme, /crysReducedMotion/);
  assert.match(layout, /dateKey=\{environment\.localTime\.slice\(0, 10\)\}/);
});

test('Phase 3 preserves layout and authenticated ceremony mounting', () => {
  const layout = read('src/components/layout/app-layout.tsx');
  assert.match(layout, /<EnvironmentBackground \/>/);
  assert.match(layout, /<TopNavigation \/>/);
  assert.match(layout, /max-w-\[1560px\]/);
  assert.match(layout, /<ImmersiveCeremony/);
});
