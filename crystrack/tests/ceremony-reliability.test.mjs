import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd(); const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('ceremony runtime and source are fully retired', () => {
  const layout = read('src/components/layout/app-layout.tsx');
  assert.doesNotMatch(layout, /ImmersiveCeremony|immersive-ceremony/);
  assert.equal(fs.existsSync(path.join(root, 'src/components/layout/immersive-ceremony.tsx')), false);
});

test('ceremony settings control remains a non-rendering compatibility shim', () => {
  const toggle = read('src/components/settings/immersive-intro-toggle.tsx');
  assert.match(toggle, /return null/);
  assert.doesNotMatch(toggle, /button|Preview|previewImmersiveCeremony/);
});

test('dead ceremony preview trigger is absent from any retained compatibility module', () => {
  const legacy = path.join(root, 'src/lib/immersive-experience.ts');
  if (!fs.existsSync(legacy)) return;
  const source = fs.readFileSync(legacy, 'utf8');
  assert.doesNotMatch(source, /export function previewImmersiveCeremony\b/);
});
