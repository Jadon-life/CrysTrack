import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(name, 'utf8');

test('refinement loads after the September glass cascade and preserves theme tokens', () => {
  const layout = read('src/app/layout.tsx');
  const css = read('src/app/premium-glass-refinement.css');
  const theme = read('src/lib/theme.ts');
  assert.ok(layout.indexOf("import './premium-glass-refinement.css';") > layout.indexOf("import './premium-physical-ui-final.css';"));
  assert.match(css, /var\(--theme-glass-tint\)/);
  assert.match(css, /var\(--theme-primary\)/);
  assert.match(theme, /#38a8ff/);
  assert.doesNotMatch(css, /#D9B65D/i);
});

test('refined glass has legibility, mobile, and accessibility fallbacks', () => {
  const css = read('src/app/premium-glass-refinement.css');
  assert.match(css, /\.crys-glass-card--substantial/);
  assert.match(css, /@media \(max-width: 719px\)/);
  assert.match(css, /prefers-reduced-transparency: reduce/);
  assert.match(css, /@supports not/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\[data-crys-reduced-motion='true'\]/);
});
