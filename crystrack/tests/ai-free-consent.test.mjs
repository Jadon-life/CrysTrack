import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(p, 'utf8');

test('free-only model is mandatory and no training collection is routed', () => {
  const provider = read('src/lib/ai/provider.ts');
  assert.match(provider, /OPENROUTER_FREE_MODEL = 'openrouter\/free'/);
  assert.match(provider, /model:\s*OPENROUTER_FREE_MODEL/);
  assert.match(provider, /data_collection:\s*'deny'/);
  assert.doesNotMatch(provider, /\bzdr:\s*true/);
  for (const file of ['intelligence.ts','goal-openrouter.ts','wealth-openrouter.ts'])
    assert.match(read('src/lib/ai/' + file), /OPENROUTER_FREE_MODEL/);
});
test('v2 consent disclosure is explicit and earlier consents are revoked', () => {
  const policy = read('src/lib/ai/privacy.ts');
  const notice = read('src/components/ai/ai-privacy.tsx');
  const migration = read('src/db/migrations/0025_free_ai_no_training_consent.sql');
  assert.match(policy, /2026-11-12-free-no-training-v2/);
  assert.match(notice, /Zero Data Retention \(ZDR\) is NOT required/);
  assert.match(notice, /providers may retain some data/);
  assert.match(migration, /enabled=false, wealth_enabled=false/);
  assert.match(migration, /revision=revision\+1/);
  assert.match(migration, /2026-11-12-free-no-training-v2/);
  assert.doesNotMatch(migration, /DELETE FROM public\.(?:goals|recurring_tasks|money_entries)/);
});
