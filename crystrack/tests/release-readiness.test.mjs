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

import {rehearseSyntheticRestore} from '../scripts/issue18-synthetic-backup-restore.mjs';
test('synthetic restore refuses arbitrary callers before touching Docker',()=>{
  assert.throws(()=>rehearseSyntheticRestore(''),/Explicit local-only synthetic restore confirmation/);
  assert.throws(()=>rehearseSyntheticRestore('--remote-target=example.invalid'),/Explicit local-only synthetic restore confirmation/);
});
