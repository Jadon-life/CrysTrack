import test from 'node:test';
import assert from 'node:assert/strict';
import { candidates, expectedLedger } from '../scripts/rehearse-release-readiness.mjs';

test('release inventory is an exact, sequential 0013–0024 extension of the six unchanged legacy files', () => {
  const ledger = expectedLedger();
  assert.equal(ledger.length, 18);
  assert.deepEqual(candidates.map(name => Number(name.slice(0, 4))), Array.from({ length: 12 }, (_, i) => i + 13));
  assert.deepEqual(ledger.slice(6).map(item => item.name), candidates);
  for (const item of ledger) assert.match(item.hash, /^[a-f0-9]{64}$/);
});
