import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd(); const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('final environment is still-image-only in stability mode', () => {
  const renderer = read('src/components/layout/environment-background.tsx');
  assert.match(renderer, /environment-stability-image/);
  assert.match(renderer, /8-photo-static-v10/);
  assert.doesNotMatch(renderer, /<video|youtube\.com\/iframe_api|new Image\(/);
});

test('authenticated app layout no longer mounts immersive ceremonies', () => {
  const layout = read('src/components/layout/app-layout.tsx');
  assert.match(layout, /<EnvironmentBackground \/>/);
  assert.match(layout, /<TopNavigation \/>/);
  assert.doesNotMatch(layout, /ImmersiveCeremony|immersive-ceremony/);
});

test('settings compatibility shim stays non-rendering', () => {
  const toggle = read('src/components/settings/immersive-intro-toggle.tsx');
  assert.match(toggle, /return null/);
  assert.doesNotMatch(toggle, /Preview|previewImmersiveCeremony|setImmersiveIntrosEnabled/);
});
