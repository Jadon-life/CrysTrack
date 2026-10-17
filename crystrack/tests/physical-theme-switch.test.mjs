import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (path) => fs.readFileSync(path, 'utf8');

test('Light/Dark hardware switch renders true Three.js meshes and physics-inspired material', () => {
  const nav = read('src/components/navigation/top-navigation.tsx');
  const src = read('src/components/navigation/physical-theme-switch.tsx');
  const scene = read('src/lib/three-rocker.ts');
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.match(nav, /<PhysicalThemeSwitch \/>/);
  assert.equal(pkg.dependencies.three, '0.167.1');
  assert.equal(lock.packages[''].dependencies.three, '0.167.1');
  assert.equal(lock.packages['node_modules/three'].version, '0.167.1');
  assert.match(src, /import\('@\/lib\/three-rocker'\)/);
  assert.match(scene, /import \* as THREE from 'three'/);
  assert.match(scene, /new THREE\.WebGLRenderer\(/);
  assert.match(scene, /new THREE\.ExtrudeGeometry\(/);
  assert.match(scene, /new THREE\.MeshPhysicalMaterial\(/);
  assert.match(scene, /new THREE\.DirectionalLight\(/);
  assert.match(scene, /pivot\.rotation\.y/);
  assert.doesNotMatch(scene, /setAnimationLoop/);
});

test('Keyboard switch keeps theme state, Auto option, and low-power fallback', () => {
  const component = read('src/components/navigation/physical-theme-switch.tsx');
  const scene = read('src/lib/three-rocker.ts');
  const css = read('src/app/premium-controls.css');
  const settings = read('src/app/settings/page.tsx');
  assert.match(component, /role="switch"/);
  assert.match(component, /aria-checked=\{isLight\}/);
  assert.match(component, /aria-label="Light mode"/);
  assert.match(component, /onClick=\{\(\) => void setPreference\(isLight \? 'dark' : 'light'\)\}/);
  assert.match(component, /reducedMotion/);
  assert.match(component, /setReady\(false\)/);
  assert.match(scene, /powerPreference: 'low-power'/);
  assert.match(scene, /geometry\.dispose\(\)/);
  assert.match(scene, /renderer\.dispose\(\)/);
  assert.match(scene, /ResizeObserver/);
  assert.match(css, /\.crys-3d-switch__fallback/);
  assert.match(css, /forced-colors: active/);
  assert.match(css, /::-webkit-scrollbar-thumb/);
  assert.match(css, /scrollbar-width: thin/);
  assert.match(settings, /id: 'adaptive', label: 'Adaptive'/);
});
