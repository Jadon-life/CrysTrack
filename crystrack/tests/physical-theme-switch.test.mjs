import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (path) => fs.readFileSync(path, 'utf8');

test('theme rocker is actual Three.js geometry with visible physical depth', () => {
  const component = read('src/components/navigation/physical-theme-switch.tsx');
  const scene = read('src/lib/three-rocker.ts');
  assert.match(component, /theme\.background/);
  assert.match(component, /theme\.border/);
  assert.match(component, /theme\.primary/);
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
  assert.match(scene, /palette\.border/);
  assert.match(scene, /palette\.primary/);
  assert.match(scene, /background\.clone\(\)\.lerp\(white, \.055\)/);
  assert.match(scene, /baseMat\.color\.copy\(weatherSurface\)/);
  assert.match(scene, /faceMat\.color\.copy\(weatherRaised\)/);
  assert.match(scene, /faceMat\.emissive\.copy\(weatherRaised\)/);
  assert.match(scene, /faceMat\.emissiveIntensity = \.76/);
  assert.match(scene, /toneMappingExposure = 0\.92/);
  assert.match(scene, /edgeMat\.color\.copy\(border\)\.lerp\(weatherSurface/);
  assert.match(scene, /iconMat\.color\.copy\(primary\)/);
  assert.match(css, /background: rgba\(255,255,255,\.055\)/);
  assert.match(css, /border: 1px solid var\(--theme-border\)/);
  assert.match(css, /color: var\(--theme-primary\)/);
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

test('Three.js rocker announces its dynamic guidance with supported ARIA descriptions', () => {
 const component = read('src/components/navigation/physical-theme-switch.tsx');
 assert.match(component, /aria-describedby=\{descriptionId\}/);
 assert.match(component, /const descriptionId = useId\(\)/);
 assert.match(component, /<span id=\{descriptionId\} className="sr-only">/);
 assert.match(component, /Adaptive remains in Settings, Appearance/);
 assert.doesNotMatch(component, /aria-description=/);
});
