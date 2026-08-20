import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('final background uses the three approved YouTube videos', () => {
  const manifest = read('src/lib/environment-youtube.ts');
  assert.match(manifest, /AjwcqYZ6cIw/);
  assert.match(manifest, /i9hsP_dLIaM/);
  assert.match(manifest, /vJKEcp3BAVw/);
  assert.match(manifest, /startAt: 30/);
  assert.match(manifest, /youtube-nocookie\.com/);
});

test('wide background is a single full-screen 16:9 video, not a three-panel wall', () => {
  const renderer = read('src/components/layout/environment-background.tsx');
  const css = read('src/app/premium-physical-ui-final.css');

  assert.match(renderer, /mode === 'youtube'/);
  assert.match(renderer, /mode === 'local'/);
  assert.doesNotMatch(renderer, /panelCountForViewport/);
  assert.doesNotMatch(renderer, /panelCount={/);

  assert.match(css, /min-width: 177\.777778vh/);
  assert.match(css, /height: 56\.25vw/);
  assert.match(css, /\.environment-video-wall,/);
  assert.match(css, /display: none !important/);
});

test('video audio remains disabled', () => {
  const renderer = read('src/components/layout/environment-background.tsx');
  const manifest = read('src/lib/environment-youtube.ts');

  assert.match(renderer, /video\.muted = true/);
  assert.match(renderer, /video\.defaultMuted = true/);
  assert.match(renderer, /video\.volume = 0/);
  assert.match(manifest, /mute: '1'/);
});

test('mobile and narrow screens retain one local portrait video fallback', () => {
  const renderer = read('src/components/layout/environment-background.tsx');
  assert.match(renderer, /dubaiVideoScenesForPanels\(phase, 1\)\[0\]/);
  assert.match(renderer, /width >= 900 && landscapeEnough/);
});
