import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd(); const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('final background renderer is a single static still-image surface', () => {
  const renderer = read('src/components/layout/environment-background.tsx');
  assert.match(renderer, /environment-stability-image/);
  assert.match(renderer, /data-background-rotation="8-photo-static-v10"/);
  assert.doesNotMatch(renderer, /<video|iframe|new Image\(|image\.decode|warmBrowserCache|environment-weather/);
});

test('adaptive pool contains eight mood-based local-time slots', () => {
  const environment = read('src/lib/environment.ts');
  for (const minute of [0,300,390,540,750,960,1110,1230]) assert.match(environment, new RegExp(`slotStartMinute: ${minute}`));
  for (const id of ['approved-deep-night-dubai-terrace','approved-predawn-blue-dubai','approved-sunrise-mountain-lake','approved-morning-mountain-lake','approved-midday-nature-terrace','approved-afternoon-dubai','approved-golden-hour-dubai','approved-night-dubai-city']) assert.match(environment, new RegExp(id));
});

test('stability CSS override disables background animation and hides retired rich media', () => {
  const css = read('src/app/premium-physical-ui-final.css');
  assert.match(css, /BEGIN CrysTrack background stability override v10/);
  assert.match(css, /environment-background--static-safe/);
  assert.match(css, /animation:\s*none !important/);
  assert.match(css, /environment-background--static-safe video/);
  assert.match(css, /display:\s*none !important/);
});

test('all eight daily backgrounds are packaged as local WebP files', () => {
  const dir = path.join(root, 'public/backgrounds/adaptive');
  assert.equal(fs.existsSync(dir), true);
  const files = fs.readdirSync(dir).filter((name) => /^\d{2}-.+\.webp$/.test(name)).sort();
  assert.equal(files.length, 8);
  for (const file of files) assert.ok(fs.statSync(path.join(dir, file)).size > 250_000);
});
