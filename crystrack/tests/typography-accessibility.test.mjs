import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(name, 'utf8');
const pages = [
  'src/app/page.tsx', 'src/app/plan/page.tsx', 'src/app/tasks/page.tsx',
  'src/app/goals/page.tsx', 'src/app/assignments/page.tsx',
  'src/app/calendar/page.tsx', 'src/app/insights/page.tsx',
  'src/app/history/page.tsx', 'src/app/finance/page.tsx',
  'src/app/ai/page.tsx', 'src/app/settings/page.tsx',
  'src/components/ai/domain-insight-card.tsx',
  'src/components/navigation/top-navigation.tsx',
  'src/components/navigation/mobile-nav.tsx',
];

test('main screens avoid explicit Tailwind text sizes below 12px', () => {
  for (const page of pages) {
    const small = [...read(page).matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)]
      .filter((m) => Number(m[1]) < 12);
    assert.deepEqual(small.map((m) => m[0]), [], page);
  }
});

test('navigation controls have accessible names and visible focus', () => {
  const nav = read('src/components/navigation/top-navigation.tsx');
  const mobile = read('src/components/navigation/mobile-nav.tsx');
  const css = read('src/app/premium-glass-refinement.css');
  assert.match(nav, /aria-label="Close navigation"/);
  assert.match(nav, /aria-label="Refresh local weather and location"/);
  assert.match(nav, /Close profile menu/);
  assert.match(mobile, /aria-label="Open more navigation"/);
  assert.match(mobile, /aria-label="Close more navigation"/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /font-size: 12px/);
});
