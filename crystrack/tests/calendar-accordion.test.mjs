import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const page = fs.readFileSync('src/app/calendar/page.tsx', 'utf8');
const css = fs.readFileSync('src/app/premium-glass-refinement.css', 'utf8');

test('Calendar cells use small activity dots and desktop hover previews', () => {
  assert.match(page, /groups\.map\(\(group\) =>/);
  assert.match(page, /onMouseEnter=\{\(\) => setHovered\(key\)\}/);
  assert.match(page, /role="tooltip"/);
  assert.match(page, /events\.slice\(0, 4\)/);
  assert.match(page, /md:block/);
  assert.match(page, /setSelected\(key\)/);
  assert.doesNotMatch(page, /summaries\.map/);
});

test('selected calendar day has closed, collapsible activity groups', () => {
  assert.match(page, /groupsForSelected\.map\(\(category\) =>/);
  assert.match(page, /<details key=\{selected \+ '-' \+ category\.type\}/);
  assert.match(page, /<summary /);
  assert.doesNotMatch(page, /<details[^>]+open(?:\s|>|=)/);
  assert.match(css, /\.calendar-day-details\[open\] > summary \.calendar-group-chevron/);
  assert.match(page, /category\.events\.map/);
});

test('calendar still reads existing task, goal and assignment APIs', () => {
  assert.match(page, /fetcher\('\/api\/tasks/);
  assert.match(page, /fetcher\('\/api\/goals'\)/);
  assert.match(page, /fetcher\('\/api\/assignments'\)/);
});
