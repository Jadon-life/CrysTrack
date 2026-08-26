import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd(); const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
test('final environment stays still-image-only after ceremony retirement', () => { const renderer = read('src/components/layout/environment-background.tsx'); assert.match(renderer, /environment-still-image/); assert.doesNotMatch(renderer, /<video/); assert.doesNotMatch(renderer, /youtube\.com\/iframe_api/); });
test('authenticated app layout no longer mounts immersive ceremonies', () => { const layout = read('src/components/layout/app-layout.tsx'); assert.match(layout, /<EnvironmentBackground \/>/); assert.match(layout, /<TopNavigation \/>/); assert.match(layout, /max-w-\[1560px\]/); assert.doesNotMatch(layout, /ImmersiveCeremony/); assert.doesNotMatch(layout, /immersive-ceremony/); });
test('settings no longer exposes immersive entrance controls or previews', () => { const toggle = read('src/components/settings/immersive-intro-toggle.tsx'); assert.match(toggle, /return null/); assert.doesNotMatch(toggle, /Preview|previewImmersiveCeremony|setImmersiveIntrosEnabled/); });
