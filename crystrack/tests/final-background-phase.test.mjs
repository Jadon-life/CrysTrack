import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('final background renderer is still-image-only', () => {
  const renderer = read('src/components/layout/environment-background.tsx');
  assert.match(renderer, /environment-still-image/);
  assert.match(renderer, /selectEnvironmentBackground/);
  assert.match(renderer, /data-background-kind="still"/);
  assert.doesNotMatch(renderer, /youtube\.com\/iframe_api/);
  assert.doesNotMatch(renderer, /<video/);
  assert.doesNotMatch(renderer, /LocalDubaiVideo/);
  assert.doesNotMatch(renderer, /StableYouTubeDubaiVideo/);
});

test('adaptive background pool uses phase, weather and stable context', () => {
  const environment = read('src/lib/environment.ts');
  for (const phase of ['morning', 'day', 'golden', 'evening', 'night']) {
    assert.match(environment, new RegExp(`'${phase}'`));
  }
  assert.match(environment, /ENVIRONMENT_BACKGROUND_POOL/);
  assert.match(environment, /selectEnvironmentBackground/);
  assert.match(environment, /environment\.weather/);
  assert.match(environment, /environment\.city/);
  assert.match(environment, /stableHash/);
  assert.match(environment, /3840w/);
});

test('final CSS retires every legacy video surface', () => {
  const css = read('src/app/premium-physical-ui-final.css');
  assert.match(css, /environment-still-image/);
  assert.match(css, /environment-background video/);
  assert.match(css, /environment-background iframe/);
  assert.match(css, /display: none !important/);
  assert.doesNotMatch(css, /height: 56\.25vw/);
});

test('clean golden-hour scenic background is packaged', () => {
  const asset = path.join(root, 'public/backgrounds/crystrack-golden-dubai.webp');
  assert.equal(fs.existsSync(asset), true);
  assert.ok(fs.statSync(asset).size > 200_000);
});
