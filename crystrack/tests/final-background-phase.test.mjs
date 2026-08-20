import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('final stable background retains exactly the three approved sources', () => {
  const manifest = read('src/lib/environment-youtube.ts');
  assert.match(manifest, /AjwcqYZ6cIw/);
  assert.match(manifest, /i9hsP_dLIaM/);
  assert.match(manifest, /vJKEcp3BAVw/);
});

test('walking-tour source receives strongest camera-motion reduction', () => {
  const manifest = read('src/lib/environment-youtube.ts');
  assert.match(manifest, /videoId: 'AjwcqYZ6cIw'[\s\S]*?endAt: 15[\s\S]*?playbackRate: 0\.25/);
  assert.match(manifest, /videoId: 'vJKEcp3BAVw'[\s\S]*?startAt: 30[\s\S]*?endAt: 54/);
});

test('YouTube Player API enforces bounded silent looping', () => {
  const renderer = read('src/components/layout/environment-background.tsx');

  assert.match(renderer, /youtube\.com\/iframe_api/);
  assert.match(renderer, /player\.mute\(\)/);
  assert.match(renderer, /player\.setVolume\(0\)/);
  assert.match(renderer, /player\.setPlaybackRate/);
  assert.match(renderer, /scene\.endAt - 0\.28/);
  assert.match(renderer, /player\.seekTo\(scene\.startAt, true\)/);
});

test('old three-panel wall stays disabled and wide player stays 16:9', () => {
  const css = read('src/app/premium-physical-ui-final.css');

  assert.match(css, /\.environment-video-wall,/);
  assert.match(css, /display: none !important/);
  assert.match(css, /height: 56\.25vw !important/);
  assert.match(css, /min-width: 177\.777778vh !important/);
});
