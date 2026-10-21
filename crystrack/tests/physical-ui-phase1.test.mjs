import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('premium physical UI stylesheet is wired after the accepted globals', async () => {
  const layout = await read('src/app/layout.tsx');
  assert.match(layout, /import '\.\/globals\.css';\s*import '\.\/premium-physical-ui\.css';/);
});

test('GlassCard provides substantial depth and pointer/tap liquid response', async () => {
  const glass = await read('src/components/shared/glass-card.tsx');
  assert.match(glass, /depth\?: 'standard' \| 'substantial'/);
  assert.match(glass, /data-glass-reactive="true"/);
  assert.match(glass, /data-glass-pressed/);
  assert.match(glass, /--glass-pointer-x/);
});

test('calendar opts into the deeper glass sheet without changing its data model', async () => {
  const calendar = await read('src/app/calendar/page.tsx');
  assert.match(calendar, /depth="substantial"/);
  assert.match(calendar, /calendar-glass--grid/);
  assert.match(calendar, /calendar-day/);
  assert.match(calendar, /calendar-event-glass/);
});

test('navigation collapses before tablet widths become crowded', async () => {
  const nav = await read('src/components/navigation/top-navigation.tsx');
  assert.match(nav, /hidden lg:flex items-center gap-1/);
  assert.match(nav, /topnav-icon-button lg:hidden/);
  assert.match(nav, /z-\[90\].*lg:hidden/);
});

test('premium UI CSS includes glass depth, safe nav margins and reduced-motion fallback', async () => {
  const css = await read('src/app/premium-physical-ui.css');
  assert.match(css, /\.crys-glass-card--substantial/);
  assert.match(css, /@keyframes crysGlassLiquidSettle/);
  assert.match(css, /\.calendar-glass--grid/);
  assert.match(css, /env\(safe-area-inset-right\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
