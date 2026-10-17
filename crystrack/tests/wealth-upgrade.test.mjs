import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd(); const read = (path) => readFileSync(join(root, path), 'utf8');

test('Today uses the CrysTrack 2.0 bento composition and existing data provider', () => {
  const dashboard=read('src/app/page.tsx');
  for(const marker of ['Your day, in focus.','Goals in Motion','Wealth Snapshot','Quick Reflection','Recent Activity','FocusTimer','WorkloadRadar','useRhythm'])assert.ok(dashboard.includes(marker));
  assert.match(dashboard,/occurrences\/\$\{data.day\}\/toggle/);
});

test('branding displays the supplied official marks without the generic diamond', () => {
  const navigation=read('src/components/navigation/top-navigation.tsx');
  const brand=read('src/components/workspace/brand-logo.tsx');
  assert.doesNotMatch(navigation,/Diamond/);assert.match(brand,/brandAssetForTheme/);
  assert.match(brand,/official-reference\.jpg/);assert.match(brand,/<image/);
});

test('adaptive background uses the static eight-scene stability renderer', () => {
  const environment = read('src/lib/environment.ts');
  assert.match(environment, /ENVIRONMENT_BACKGROUND_POOL/);
  assert.match(environment, /slotStartMinute: 1230/);
  const component = read('src/components/layout/environment-background.tsx');
  assert.match(component, /selectEnvironmentBackground\(environment, new Date\(clock\)\)/);
  assert.match(component, /data-background-rotation="8-photo-static-v10"/);
  assert.doesNotMatch(component, /pointermove|environment-background__scene|new Image\(|setInterval/);
});

test('routine schedule area keeps dedicated readability treatment', () => {
  const tasks = read('src/app/tasks/page.tsx');
  const css = read('src/app/globals.css');
  assert.match(tasks, /routine-readable-section/);
  assert.match(css, /\.routine-readable-section/);
});

test('Wealth backend remains real, not hardcoded', () => {
  const dashboard = read('src/app/page.tsx');
  assert.match(dashboard, /useRhythm/);
  assert.match(read('src/lib/rhythm/service.ts'), /summarizeWealth/);
  assert.match(dashboard, /wealthSummary\.availableBalance/);
  assert.doesNotMatch(dashboard, /availableBalance:\s*0/);
});
