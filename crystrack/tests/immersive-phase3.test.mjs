import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }

test('Phase 3 ceremonies coexist with the final still-image renderer', () => {
  const renderer = read('src/components/layout/environment-background.tsx');
  assert.match(renderer, /environment-still-image/);
  assert.doesNotMatch(renderer, /<video/);
  assert.doesNotMatch(renderer, /youtube\.com\/iframe_api/);
});

test('Phase 3 entrance ceremonies are first-entry-per-block and skippable', () => {
  const component = read('src/components/layout/immersive-ceremony.tsx');
  const logic = read('src/lib/immersive-experience.ts');
  assert.match(component, />Skip </);
  assert.match(component, /markCeremonySeen/);
  assert.match(component, /Clean the glass\?/);
  assert.match(logic, /crystrack-ceremony-v1/);
  assert.match(logic, /phase === 'golden' \|\| phase === 'evening'/);
});

test('Phase 3 preserves layout and only mounts ceremony after authenticated workspace', () => {
  const layout = read('src/components/layout/app-layout.tsx');
  assert.match(layout, /<EnvironmentBackground \/>/);
  assert.match(layout, /<TopNavigation \/>/);
  assert.match(layout, /max-w-\[1560px\]/);
  assert.match(layout, /<ImmersiveCeremony/);
});
