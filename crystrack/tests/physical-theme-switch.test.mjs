import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (path) => fs.readFileSync(path, 'utf8');

test('theme rocker is actual Three.js geometry with visible physical depth', () => {
  const component = read('src/components/navigation/physical-theme-switch.tsx');
  const scene = read('src/lib/three-rocker.ts');
  assert.match(component, /theme\.background/);
  assert.match(component, /theme\.primary/);
  assert.match(component, /theme\.secondary/);
  assert.match(component, /<Sun className=/);
  assert.match(component, /<Moon className=/);
  assert.doesNotMatch(component, />ON</);
  assert.doesNotMatch(component, />OFF</);
  assert.match(scene, /face = capsule\(2\.79, \.72, \.245/);
  assert.match(scene, /target = light \? -\.255 : \.255/);
  assert.match(scene, /new THREE\.CylinderGeometry/);
  assert.match(scene, /new THREE\.TorusGeometry/);
  assert.match(scene, /new THREE\.MeshPhysicalMaterial/);
  assert.match(scene, /new THREE\.WebGLRenderer/);
  assert.doesNotMatch(scene, /fillText\('ON'/);
  assert.doesNotMatch(scene, /fillText\('OFF'/);
});

test('3D hardware derives its colours from the current CrysTrack theme', () => {
  const scene = read('src/lib/three-rocker.ts');
  const css = read('src/app/premium-controls.css');
  assert.match(scene, /applyPalette\(palette: RockerPalette/);
  assert.match(scene, /palette\.background/);
  assert.match(scene, /palette\.primary/);
  assert.match(scene, /palette\.secondary/);
  assert.match(scene, /baseMat\.color\.copy\(bg\)\.lerp\(primary/);
  assert.match(scene, /faceMat\.color\.copy\(bg\)\.lerp\(primary/);
  assert.match(css, /var\(--theme-bg\)/);
  assert.match(css, /var\(--theme-primary\)/);
  assert.match(css, /var\(--theme-secondary\)/);
  assert.doesNotMatch(css, /#f2f9fd/i);
  assert.doesNotMatch(css, /#c0d6e5/i);
});

test('switch stays accessible, low-power, and leaves Adaptive in Settings', () => {
  const component = read('src/components/navigation/physical-theme-switch.tsx');
  const scene = read('src/lib/three-rocker.ts');
  const settings = read('src/app/settings/page.tsx');
  assert.match(component, /role="switch"/);
  assert.match(component, /aria-checked=\{isLight\}/);
  assert.match(component, /setPreference\(isLight \? 'dark' : 'light'\)/);
  assert.match(scene, /powerPreference: 'low-power'/);
  assert.doesNotMatch(scene, /setAnimationLoop/);
  assert.match(scene, /renderer\.dispose\(\)/);
  assert.match(settings, /id: 'adaptive', label: 'Adaptive'/);
});
