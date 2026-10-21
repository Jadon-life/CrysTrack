import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (file) => fs.readFileSync(file, 'utf8');

test('History renders two levels of accessible native disclosures, initially closed', () => {
  const page = read('src/app/history/page.tsx');
  const css = read('src/app/premium-glass-refinement.css');
  assert.match(page, /months\.map\(\(month\) => \(/);
  assert.match(page, /month\.days\.map\(\(day\) => \(/);
  assert.equal((page.match(/<details /g) || []).length, 2);
  assert.equal((page.match(/<summary /g) || []).length, 2);
  assert.doesNotMatch(page, /<details[^>]+open(?:\s|>|=)/);
  assert.match(css, /\.history-accordion\[open\] > summary \.history-chevron/);
  assert.doesNotMatch(page, /Object\.entries\(grouped\)/);
});

test('History pages older records while preserving existing dashboard API usage', () => {
  const page = read('src/app/history/page.tsx');
  const api = read('src/app/api/history/route.ts');
  assert.match(page, /Load older activity/);
  assert.match(page, /historyUrl\(nextPage, filterType\)/);
  assert.match(page, /versionRef\.current/);
  assert.match(api, /\.range\(offset, offset \+ PAGE_SIZE\)/);
  assert.match(api, /\.eq\('user_id', user\.id\)/);
  assert.match(api, /\.eq\('entity_type', type\)/);
  assert.match(api, /if \(!paged\) return NextResponse\.json\(data \|\| \[\]\)/);
});
