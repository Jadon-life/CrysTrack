import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('legacy Phase 2 moving-background renderer has been retired', () => {
  const renderer = read('src/components/layout/environment-background.tsx');
  assert.match(renderer, /environment-still-image/);
  assert.doesNotMatch(renderer, /<video/);
  assert.doesNotMatch(renderer, /video\.volume = 0/);
});

test('Phase 2 glass correction remains preserved', () => {
  const css = read('src/app/premium-physical-ui-phase2.css');
  assert.match(css, /physical 3D glass correction/i);
  assert.match(css, /crys-glass-card\.crys-glass-card--hover:hover/);
  assert.match(css, /transition: none/);
  assert.match(css, /inset 0 -7px 11px/);
});
