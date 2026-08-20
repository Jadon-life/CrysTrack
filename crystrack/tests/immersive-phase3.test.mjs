import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('Phase 3 renderer removes hard video seams and keeps videos hard-muted', () => {
  const renderer = read('src/components/layout/environment-background.tsx');
  const css = read('src/app/premium-physical-ui-phase3.css');

  assert.match(renderer, /video\.muted = true/);
  assert.match(renderer, /video\.volume = 0/);
  assert.match(renderer, /environment-video-wall__continuity/);
  assert.match(css, /mask-image:/);
  assert.match(css, /environment-video-wall__panel-wrap--2/);
  assert.doesNotMatch(css, /panel-wrap \+ .*::before/);
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
