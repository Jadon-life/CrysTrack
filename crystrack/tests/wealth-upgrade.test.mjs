import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

test('dashboard is the previous compact dashboard with only Calendar and Wealth additions', () => {
  const dashboard = read('src/app/page.tsx');

  for (const marker of [
    "Today&apos;s plan",
    'Goal check-ins',
    'Wealth Overview',
    'Assignments & reminders',
    'Today note',
    'Recent activity',
    'MiniCalendar',
  ]) {
    assert.match(dashboard, new RegExp(marker));
  }

  assert.doesNotMatch(dashboard, /Focus Timer/);
  assert.doesNotMatch(dashboard, /Quick Capture/);
  assert.doesNotMatch(dashboard, /dashboard-bottom-rail/);
  assert.doesNotMatch(dashboard, /Finance snapshot/);
});

test('previous CrysTrack logo is restored', () => {
  const navigation = read('src/components/navigation/top-navigation.tsx');
  assert.match(navigation, /Diamond/);
  assert.match(navigation, /topnav-brandmark/);
  assert.doesNotMatch(navigation, /function CrysTrackMark/);
});

test('previous adaptive background set is restored', () => {
  const environment = read('src/lib/environment.ts');

  assert.match(environment, /Sunrise Bettmerhorn snowy mountains/);
  assert.match(environment, /Mountain Landscape/);
  assert.match(environment, /Golden city skyline/);
  assert.match(environment, /Sunset Vibes/);
  assert.match(environment, /Dubai skyline unsplash\.jpg/);
  assert.doesNotMatch(environment, /Pudong skyline/);

  const component = read('src/components/layout/environment-background.tsx');
  assert.match(component, /environmentBackgroundAsset\(environment\.phase\)/);
  assert.doesNotMatch(component, /pointermove/);
  assert.doesNotMatch(component, /environment-background__scene/);
});

test('routine schedule area has dedicated readability treatment', () => {
  const tasks = read('src/app/tasks/page.tsx');
  const css = read('src/app/globals.css');

  assert.match(tasks, /routine-readable-section/);
  assert.match(css, /\.routine-readable-section/);
  assert.match(css, /routine-readable-section.*button/s);
});

test('Wealth backend and zero-state calculations remain real, not hardcoded', () => {
  const dashboard = read('src/app/page.tsx');

  assert.match(dashboard, /fetcher\('\/api\/wealth'\)/);
  assert.match(dashboard, /wealthSummary\.availableBalance/);
  assert.match(dashboard, /wealthSummary\.safeToSpend/);
  assert.match(dashboard, /wealthSummary\.netPosition/);
  assert.doesNotMatch(dashboard, /availableBalance:\s*0/);
});
