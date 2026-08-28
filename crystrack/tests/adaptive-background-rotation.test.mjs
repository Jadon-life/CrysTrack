import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const FILES = [
  '01-deep-night-dubai-terrace.webp',
  '02-predawn-blue-dubai.webp',
  '03-sunrise-mountain-lake.webp',
  '04-morning-mountain-lake.webp',
  '05-midday-nature-terrace.webp',
  '06-afternoon-dubai.webp',
  '07-golden-hour-dubai.webp',
  '08-night-dubai-city.webp',
];

test('approved eight-photo daily rotation keeps exact local-time boundaries', () => {
  const environment = read('src/lib/environment.ts');
  for (const minute of [0, 300, 390, 540, 750, 960, 1110, 1230]) assert.match(environment, new RegExp(`slotStartMinute: ${minute}`));
  assert.match(environment, /millisecondsUntilNextBackgroundSlot/);
});

test('all eight backgrounds are distinct local WebP assets with no photo API dependency', () => {
  const environment = read('src/lib/environment.ts');
  const paths = [...environment.matchAll(/src: '\/backgrounds\/adaptive\/([^']+\.webp)'/g)].map((match) => match[1]);
  assert.deepEqual(paths, FILES);
  assert.equal(new Set(paths).size, 8);
  assert.doesNotMatch(environment, /\/api\/backgrounds\//);
  assert.doesNotMatch(environment, /unsplash\.com|wikimedia|api\.open-meteo\.com|reverse-geocode-client/i);
  const hashes = new Set();
  for (const file of FILES) {
    const absolute = path.join(root, 'public/backgrounds/adaptive', file);
    assert.equal(fs.existsSync(absolute), true, `${file} is missing`);
    const bytes = fs.readFileSync(absolute);
    assert.ok(bytes.length > 250_000, `${file} is unexpectedly small`);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    hashes.add(crypto.createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(hashes.size, 8);
});

test('stability renderer mounts one still image without preload, decode, weather, or animation machinery', () => {
  const renderer = read('src/components/layout/environment-background.tsx');
  assert.match(renderer, /millisecondsUntilNextBackgroundSlot/);
  assert.match(renderer, /visibilitychange/);
  assert.match(renderer, /data-background-rotation="8-photo-static-v10"/);
  assert.match(renderer, /environment-stability-image/);
  assert.match(renderer, /animation: 'none'/);
  assert.match(renderer, /transition: 'none'/);
  assert.match(renderer, /filter: 'none'/);
  assert.match(renderer, /transform: 'none'/);
  assert.doesNotMatch(renderer, /new Image\(/);
  assert.doesNotMatch(renderer, /image\.decode|warmBrowserCache|nextEnvironmentBackgrounds|environment-weather|setInterval/);
  assert.equal(fs.existsSync(path.join(root, 'src/app/api/backgrounds/[id]/route.ts')), false);
});
