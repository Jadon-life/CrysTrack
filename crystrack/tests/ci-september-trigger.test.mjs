import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(
  new URL('../../.github/workflows/ci.yml', import.meta.url),
  'utf8',
);

test('September development pushes trigger CI without depending on an old PR', () => {
  const triggers = workflow.split('\njobs:\n')[0];
  assert.match(triggers, /^on:\s*$/m);
  assert.match(triggers, /^  pull_request:\s*$/m);

  const match = triggers.match(/^  push:\n    branches:\n((?:      - [^\n]+\n)+)/m);
  assert.ok(match, 'Expected a direct push branches allowlist');
  const branches = match[1]
    .trim()
    .split('\n')
    .map(line => line.replace(/^\s*-\s*/, '').replace(/^["']|["']$/g, ''));

  for (const required of ['main', 'fix/**', 'feat/crystrack-premium-sep28']) {
    assert.ok(branches.includes(required), `Missing push CI for ${required}`);
  }
  assert.match(workflow, /^permissions:\n  contents: read\s*$/m);
});

test('direct branch checks retain both non-deploying validation jobs', () => {
  assert.match(workflow, /^  validate:\s*$/m);
  assert.match(workflow, /^  preview-safety:\s*$/m);
  assert.match(workflow, /- run: npm run test:preview/);
  assert.match(workflow, /- name: Production build\s*\n\s*run: npm run build/);
  assert.doesNotMatch(workflow, /\bvercel deploy\b|\bsupabase db push\b|\bsupabase migration up\b/i);
});
