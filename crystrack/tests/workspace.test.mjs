import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const { effectiveWorkspaceTheme, brandAssetForTheme } = loadTs(
  'src/lib/workspace/design.ts',
);
const { workspaceThemeTokens } = loadTs('src/lib/theme.ts');
test('explicit appearance choices remain stable while adaptive mode follows all five phases', () => {
  for (const phase of ['morning', 'day', 'golden', 'evening', 'night']) {
    assert.equal(effectiveWorkspaceTheme('light', phase), 'light');
    assert.equal(effectiveWorkspaceTheme('dark', phase), 'dark');
    assert.equal(
      effectiveWorkspaceTheme('adaptive', phase),
      ['morning', 'day'].includes(phase) ? 'light' : 'dark',
    );
  }
});
test('branding selects the approved variant using effective theme rather than the stored auto preference', () => {
  const assets = {
    light: '/original-first-mark.svg',
    dark: '/original-second-mark.svg',
  };
  assert.equal(
    brandAssetForTheme(effectiveWorkspaceTheme('adaptive', 'morning'), assets),
    assets.light,
  );
  assert.equal(
    brandAssetForTheme(effectiveWorkspaceTheme('adaptive', 'night'), assets),
    assets.dark,
  );
  assert.equal(
    brandAssetForTheme(effectiveWorkspaceTheme('light', 'night'), assets),
    assets.light,
  );
});
function rgba(value) {
  const match = /rgba\((\d+),(\d+),(\d+),([.\d]+)\)/.exec(value);
  assert.ok(match, value);
  return match.slice(1).map(Number);
}
function over(foreground, background) {
  return foreground
    .slice(0, 3)
    .map((v, i) => v * foreground[3] + background[i] * (1 - foreground[3]));
}
function luminance(rgb) {
  const channels = rgb
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(text, bg) {
  const hex = text.slice(1),
    rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)),
    a = luminance(rgb),
    b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
test('both palettes retain real alpha glass and readable text on composed card surfaces', () => {
  for (const mode of ['light', 'dark']) {
    const tokens = workspaceThemeTokens(mode);
    for (const key of ['--glass-shell', '--glass-sidebar', '--glass-card']) {
      const alpha = rgba(tokens[key])[3];
      assert.ok(alpha > 0 && alpha < 1, key + ' must remain translucent');
    }
    const backdrop = mode === 'dark' ? [255, 255, 255] : [0, 0, 0],
      shell = over(rgba(tokens['--glass-shell']), backdrop),
      card = over(rgba(tokens['--glass-card']), shell);
    for (const key of [
      '--workspace-text',
      '--workspace-muted',
      '--workspace-subtle',
    ])
      assert.ok(
        contrast(tokens[key], card) >= 4.5,
        `${mode} ${key}: ${contrast(tokens[key], card).toFixed(2)}`,
      );
  }
});
test('primary actions retain AA contrast independently of the brighter decorative blue accent', () => {
  for (const mode of ['light', 'dark'])
    for (const key of ['--action-blue', '--action-blue-hover']) {
      const tokens = workspaceThemeTokens(mode),
        hex = tokens[key].slice(1),
        background = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      assert.ok(contrast('#FFFFFF', background) >= 4.5, key);
    }
});
