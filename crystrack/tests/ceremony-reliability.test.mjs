import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd(); const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
test('ceremony runtime is retired from the authenticated shell', () => { const layout = read('src/components/layout/app-layout.tsx'); assert.doesNotMatch(layout, /ImmersiveCeremony|immersive-ceremony/); });
test('ceremony settings control is a non-rendering compatibility shim', () => { const toggle = read('src/components/settings/immersive-intro-toggle.tsx'); assert.match(toggle, /return null/); assert.doesNotMatch(toggle, /button|Preview|previewImmersiveCeremony/); });
