import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const LOCAL_BACKGROUND_FILES = [
  '01-midnight-dubai.jpg',
  '02-predawn-lake.jpg',
  '03-sunrise-lake.jpg',
  '04-morning-mountain-lake.jpg',
  '05-late-morning-glacier-lake.jpg',
  '06-midday-green-hills.jpg',
  '07-afternoon-dubai.jpg',
  '08-late-afternoon-dubai.jpg',
  '09-golden-dubai.jpg',
  '10-sunset-dubai.jpg',
  '11-blue-hour-dubai.jpg',
  '12-night-dubai.jpg',
];

test('twelve-photo daily rotation has exact local-time boundaries', () => {
  const environment = read('src/lib/environment.ts');
  for (const minute of [0, 300, 390, 510, 630, 750, 870, 960, 1050, 1140, 1230, 1350]) {
    assert.match(environment, new RegExp(`slotStartMinute: ${minute}`));
  }
  assert.match(environment, /millisecondsUntilNextBackgroundSlot/);
  assert.match(environment, /nextEnvironmentBackgrounds/);
});

test('all twelve scheduled backgrounds are distinct validated local assets', () => {
  const environment = read('src/lib/environment.ts');
  const paths = [...environment.matchAll(/src: '\/backgrounds\/adaptive\/([^']+\.jpg)'/g)].map((match) => match[1]);
  assert.deepEqual(paths, LOCAL_BACKGROUND_FILES);
  assert.equal(new Set(paths).size, 12);
  assert.doesNotMatch(environment, /\/api\/backgrounds\//);
  assert.doesNotMatch(environment, /unsplash\.com/);

  const hashes = new Set();
  for (const file of LOCAL_BACKGROUND_FILES) {
    const absolute = path.join(root, 'public/backgrounds/adaptive', file);
    assert.equal(fs.existsSync(absolute), true, `${file} is missing`);
    const bytes = fs.readFileSync(absolute);
    assert.ok(bytes.length > 70_000, `${file} is unexpectedly small`);
    hashes.add(crypto.createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(hashes.size, 12, 'All twelve local background files must be distinct');
});

test('background switching is exact, decoded and independent of runtime photo APIs', () => {
  const renderer = read('src/components/layout/environment-background.tsx');
  assert.match(renderer, /millisecondsUntilNextBackgroundSlot/);
  assert.match(renderer, /5 \* 60_000/);
  assert.match(renderer, /visibilitychange/);
  assert.match(renderer, /nextEnvironmentBackgrounds\(environment, new Date\(clock\), 3\)/);
  assert.match(renderer, /image\.decode/);
  assert.match(renderer, /clearTimeout\(cleanupTimer\)/);
  assert.match(renderer, /data-background-rotation="12-photo-local-v8"/);
  assert.match(renderer, /key=\{`active-\$\{activeAsset\.id\}`\}/);
  assert.equal(fs.existsSync(path.join(root, 'src/app/api/backgrounds/[id]/route.ts')), false);
});
