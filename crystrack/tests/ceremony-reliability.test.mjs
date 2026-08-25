import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('reduced-motion CSS is controlled by CrysTrack preference instead of silently killing ceremonies', () => {
  const css = read('src/app/premium-physical-ui-phase3.css');
  assert.match(css, /html\[data-crys-reduced-motion='true'\] \.immersive-ceremony \*/);
  assert.doesNotMatch(css, /\n  \.immersive-ceremony \*,\n  \.immersive-ceremony \*::before/);
});

test('morning, evening and night previews are available from Settings', () => {
  const toggle = read('src/components/settings/immersive-intro-toggle.tsx');
  assert.match(toggle, /\['morning', 'evening', 'night'\]/);
  assert.match(toggle, /Preview \{block\}/);
  assert.match(toggle, /previewImmersiveCeremony/);
});
