import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('premium physical UI stylesheet is wired after the accepted globals', async () => {
  const layout = await read('src/app/layout.tsx');
  assert.match(layout, /import '\.\/workspace\.css';/);
  assert.doesNotMatch(layout, /import '\.\/premium-physical-ui(?:-phase2|-phase3)?\.css';/);
});

test('GlassCard provides substantial depth and pointer/tap liquid response', async () => {
  const glass = await read('src/components/shared/glass-card.tsx');
  assert.match(glass, /depth\?: 'standard' \| 'substantial'/);
  assert.match(glass, /data-glass-reactive="true"/);
  assert.match(glass, /data-glass-pressed/);
  assert.match(glass, /--glass-pointer-x/);
});

test('calendar uses a deeper interactive glass sheet for unified timeboxing', async () => {
  const calendar = await read('src/app/calendar/page.tsx');
  assert.match(calendar, /depth="substantial"/);
  assert.match(calendar, /rhythm-calendar-surface/);
  assert.match(calendar, /rhythm-month-grid/);
  assert.match(calendar, /rhythm-event/);
});

test('sidebar adapts to a tablet rail and accessible portalled mobile drawer', async () => {
  const shell=await read('src/components/workspace/floating-app-shell.tsx');
  const css=await read('src/app/workspace.css');
  assert.match(shell, /GlassSidebar/);assert.match(shell,/WorkspaceOverlay/);
  assert.match(css, /max-width:\s*1099px/);assert.match(css,/max-width:\s*767px/);
  assert.match(css,/--workspace-sidebar-width:\s*76px/);
});

test('workspace styling provides floating geometry, reactive glass and reduced-motion support', async () => {
  const css=await read('src/app/workspace.css');
  assert.match(css,/width:\s*min\(94vw,\s*1800px\)/);assert.match(css,/height:\s*92dvh/);
  assert.match(css,/--glass-tilt-x/);assert.match(css,/backdrop-filter:\s*blur/);
  assert.match(css,/env\(safe-area-inset-right\)/);assert.match(css,/prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css,/!important/);
});
