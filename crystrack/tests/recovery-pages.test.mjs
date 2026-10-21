import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync('src/app/' + name, 'utf8');

test('missing routes show a safe path home without exposing internal data', () => {
 const source=read('not-found.tsx');
 assert.match(source,/export default function NotFound/);
 assert.match(source,/href="\/"/);
 assert.match(source,/Back to Today/);
 assert.doesNotMatch(source,/error\.message|error\.stack/);
});

test('route crashes have an actionable retry without showing raw exception details', () => {
 const source=read('error.tsx');
 assert.match(source,/^'use client';/);
 assert.match(source,/onClick=\{reset\}/);
 assert.match(source,/role="alert"/);
 assert.doesNotMatch(source,/error\.message|error\.stack|JSON\.stringify\(error\)/);
});

test('root-level recovery works without providers, assets or external calls', () => {
 const source=read('global-error.tsx');
 assert.match(source,/^'use client';/);
 assert.match(source,/<html lang="en">/);
 assert.match(source,/<body style=/);
 assert.match(source,/onClick=\{reset\}/);
 assert.doesNotMatch(source,/fetch\(|localStorage|console\.error|error\.stack|error\.message|useTheme/);
});

test('loading skeleton respects motion preferences and has readable status', () => {
 const source=read('loading.tsx');
 assert.match(source,/Opening your workspace/);
 assert.match(source,/aria-busy="true"/);
 assert.match(source,/motion-safe:animate-pulse/);
 assert.doesNotMatch(source,/(?:^|\s)animate-pulse(?:\s|\")/);
});
