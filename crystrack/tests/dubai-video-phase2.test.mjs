import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Dubai video environment keeps five local-time phases and hard-mutes playback', () => {
  const manifest = read('src/lib/environment-video.ts');
  const renderer = read('src/components/layout/environment-background.tsx');

  for (const phase of ['morning', 'day', 'golden', 'evening', 'night']) {
    assert.match(manifest, new RegExp(`${phase}: \\[`));
    assert.match(manifest, new RegExp(`posters/\\$\\{phase\\}\\.jpg`));
  }

  assert.match(renderer, /<video/);
  assert.match(renderer, /muted/);
  assert.match(renderer, /playsInline/);
  assert.match(renderer, /disablePictureInPicture/);
  assert.match(renderer, /video\.volume = 0/);
  assert.match(renderer, /video\.defaultMuted = true/);
});

test('Phase 2 glass removes the rejected light hover wash', () => {
  const css = read('src/app/premium-physical-ui-phase2.css');
  assert.match(css, /physical 3D glass correction/i);
  assert.match(css, /crys-glass-card\.crys-glass-card--hover:hover/);
  assert.match(css, /transition: none/);
  assert.match(css, /inset 0 -7px 11px/);
});

test('all selected Dubai motion assets and posters are packaged', () => {
  const mediaRoot = path.join(root, 'public/backgrounds/dubai-video');
  const assets = [
    'morning-burj-al-arab.mp4',
    'morning-aura.mp4',
    'morning-downtown.mp4',
    'day-palm-aura.mp4',
    'golden-drive.mp4',
    'golden-skyline.mp4',
    'golden-city.mp4',
    'night-fountain.mp4',
    'night-burj.mp4',
    'night-aerial.mp4',
  ];

  for (const asset of assets) {
    const target = path.join(mediaRoot, asset);
    assert.equal(fs.existsSync(target), true, `${asset} is missing`);
    assert.ok(fs.statSync(target).size > 500_000, `${asset} is unexpectedly small`);
  }

  for (const phase of ['morning', 'day', 'golden', 'evening', 'night']) {
    assert.equal(fs.existsSync(path.join(mediaRoot, 'posters', `${phase}.jpg`)), true);
  }
});
