import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('direct OpenAI calls are server-only, bounded and never use OpenRouter fallback', () => {
  const transport = read('src/lib/ai/provider.ts');
  const privacy = read('src/lib/ai/privacy-server.ts');
  assert.match(transport, /https:\/\/api\.openai\.com\/v1\/chat\/completions/);
  assert.match(transport, /process\.env\.OPENAI_API_KEY/);
  assert.match(transport, /store: false/);
  assert.match(transport, /await checkAiLease\(lease\)/);
  assert.match(transport, /cache: 'no-store'/);
  assert.match(transport, /redirect: 'error'/);
  assert.match(transport, /if \(size > 65536\)/);
  assert.doesNotMatch(transport, /OPENROUTER_API_KEY|openrouter\.ai/);
  assert.doesNotMatch(transport, /NEXT_PUBLIC_OPENAI|dangerouslySetInnerHTML/);
  assert.match(privacy, /process\.env\.OPENAI_API_KEY/);
  assert.match(privacy, /hasTrustedAiCredential\(\)/);
});

test('provider switch requires new, explicit consent rather than reusing old permission', () => {
  const policy = read('src/lib/ai/privacy.ts');
  const migration = read('src/db/migrations/0025_direct_openai_provider_consent.sql');
  const notice = read('src/components/ai/ai-privacy.tsx');
  assert.match(policy, /2026-10-24-openai-direct-v2/);
  assert.match(migration, /2026-10-20-minimal-v1/);
  assert.match(migration, /2026-10-24-openai-direct-v2/);
  for (const name of ['ai_privacy_mutate','ai_privacy_state','ai_request_begin','ai_request_check','ai_request_finish','account_export_ai_v1']) {
    assert.ok(migration.includes(name));
  }
  assert.match(migration, /SET enabled=false,\s*wealth_enabled=false,\s*revision=revision\+1/);
  assert.match(notice, /OpenAI via its API/);
  assert.doesNotMatch(notice, /OpenRouter/);
  assert.doesNotMatch(read('src/app/ai/page.tsx'), /OpenRouter/);
});

test('all AI paths use consistent direct OpenAI models', () => {
  const intelligence = read('src/lib/ai/intelligence.ts');
  const goal = read('src/lib/ai/goal-openrouter.ts');
  const wealth = read('src/lib/ai/wealth-openrouter.ts');
  const checkin = read('src/app/api/goals/[id]/checkins/route.ts');
  const env = read('.env.example');
  for (const src of [intelligence, goal, wealth, checkin]) {
    assert.match(src, /OPENAI_/);
    assert.doesNotMatch(src, /OPENROUTER_/);
  }
  assert.match(intelligence, /gpt-5\.4-mini/);
  assert.match(env, /OPENAI_API_KEY=/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_OPENAI_API_KEY/);
});
