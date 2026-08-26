import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const FILES = [
  '01-deep-night-dubai-terrace.png',
  '02-predawn-blue-dubai.png',
  '03-sunrise-mountain-lake.png',
  '04-morning-mountain-lake.png',
  '05-midday-nature-terrace.png',
  '06-afternoon-dubai.png',
  '07-golden-hour-dubai.png',
  '08-night-dubai-city.png',
];

function pngDimensions(bytes) {
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('approved eight-photo daily rotation has exact local-time boundaries', () => {
  const environment = read('src/lib/environment.ts');
  for (const minute of [0, 300, 390, 540, 750, 960, 1110, 1230]) assert.match(environment, new RegExp(`slotStartMinute: ${minute}`));
  assert.match(environment, /millisecondsUntilNextBackgroundSlot/);
  assert.match(environment, /nextEnvironmentBackgrounds/);
});

test('all eight approved backgrounds are distinct sharp local PNG assets', () => {
  const environment = read('src/lib/environment.ts');
  const paths = [...environment.matchAll(/src: '\/backgrounds\/adaptive\/([^']+\.png)'/g)].map((match) => match[1]);
  assert.deepEqual(paths, FILES);
  assert.equal(new Set(paths).size, 8);
  assert.doesNotMatch(environment, /\/api\/backgrounds\//);
  assert.doesNotMatch(environment, /unsplash\.com|wikimedia/i);
  const hashes = new Set();
  for (const file of FILES) {
    const absolute = path.join(root, 'public/backgrounds/adaptive', file);
    assert.equal(fs.existsSync(absolute), true, `${file} is missing`);
    const bytes = fs.readFileSync(absolute);
    assert.ok(bytes.length > 250_000, `${file} is unexpectedly small`);
    const { width, height } = pngDimensions(bytes);
    assert.ok(width >= 1600 && height >= 900, `${file} is below the approved source-fidelity size`);
    assert.ok(Math.abs(width / height - 16 / 9) < 0.01, `${file} is not approximately 16:9`);
    hashes.add(crypto.createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(hashes.size, 8);
});

test('background switching is exact, decoded, sharp and animation-free', () => {
  const renderer = read('src/components/layout/environment-background.tsx');
  assert.match(renderer, /millisecondsUntilNextBackgroundSlot/);
  assert.match(renderer, /5 \* 60_000/);
  assert.match(renderer, /visibilitychange/);
  assert.match(renderer, /nextEnvironmentBackgrounds\(environment, new Date\(clock\), 3\)/);
  assert.match(renderer, /image\.decode/);
  assert.match(renderer, /data-background-rotation="8-photo-approved-v9"/);
  assert.match(renderer, /filter: 'none'/);
  assert.match(renderer, /transform: 'none'/);
  assert.match(renderer, /transition: 'none'/);
  assert.doesNotMatch(renderer, /setOutgoing|is-outgoing|transitionTimer/);
  assert.equal(fs.existsSync(path.join(root, 'src/app/api/backgrounds/[id]/route.ts')), false);
});
