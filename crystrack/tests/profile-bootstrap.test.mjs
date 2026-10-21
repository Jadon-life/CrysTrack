import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const source = fs.readFileSync('src/app/api/profile/bootstrap/route.ts', 'utf8');
const build = client => {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const fixtureModule = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(
    name => name === '@/lib/supabase/server' ? { createClient: async () => client } : require(name),
    fixtureModule, fixtureModule.exports,
  );
  return fixtureModule.exports.POST;
};

const request = (timezone, { origin = 'http://localhost', contentType = 'application/json', body } = {}) =>
  new Request('http://localhost/api/profile/bootstrap', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': contentType },
    body: body ?? JSON.stringify({ timezone }),
  });

function fixture({ authorized = true, broken = false } = {}) {
  const events = [];
  const user = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'synthetic@example.invalid',
    user_metadata: { full_name: 'Chosen Display' },
  };
  let stored = null;
  const client = {
    auth: { getUser: async () => ({ data: { user: authorized ? user : null }, error: null }) },
    from: table => {
      assert.equal(table, 'profiles');
      return {
        upsert: async (payload, options) => {
          events.push({ payload, options });
          assert.deepEqual(options, { onConflict: 'user_id', ignoreDuplicates: true });
          if (broken) return { error: { message: 'synthetic privileged failure / private content' } };
          // PostgreSQL ON CONFLICT DO NOTHING, not mutation of existing user settings.
          if (!stored) stored = { ...payload };
          return { error: null };
        },
      };
    },
  };
  return { POST: build(client), events, snapshot: () => stored, user };
}

test('profile bootstrap initialises missing owner profile once with validated browser timezone', async () => {
  const fake = fixture();
  let res = await fake.POST(request('Africa/Lagos'));
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(fake.snapshot(), {
    user_id: fake.user.id,
    display_name: 'Chosen Display',
    timezone: 'Africa/Lagos',
  });
  res = await fake.POST(request('Pacific/Auckland'));
  assert.equal(res.status, 204);
  assert.equal(fake.events.length, 2);
  assert.equal(fake.snapshot().timezone, 'Africa/Lagos', 'saved home timezone must not be overwritten');
  assert.equal(fake.snapshot().display_name, 'Chosen Display', 'saved name must not be overwritten');
});

test('missing identity, forged cross-origin requests and malformed JSON fail before any profile mutation', async () => {
  const denied = fixture({ authorized: false });
  const res = await denied.POST(request('Africa/Lagos'));
  assert.equal(res.status, 401);
  assert.equal(denied.events.length, 0);
  const fake = fixture();
  assert.equal((await fake.POST(request('Africa/Lagos', { origin: 'https://foreign.invalid' }))).status, 403);
  for (const input of [
    request('Not/A_Timezone'),
    request('', { body: '{bad' }),
    request('UTC', { body: '{"timezone":"UTC","user_id":"evil"}' }),
    request('UTC', { body: 'a'.repeat(1000) }),
    request('UTC', { contentType: 'text/plain' }),
    request('UTC', { body: '{"timezone":null}' }),
  ]) assert.equal((await fake.POST(input)).status, 400);
  assert.equal(fake.events.length, 0);
});

test('profile bootstrap returns sanitized failures without leaking database or private fields', async () => {
  const fake = fixture({ broken: true });
  const res = await fake.POST(request('UTC'));
  assert.equal(res.status, 503);
  const body = JSON.stringify(await res.json());
  assert.doesNotMatch(body, /synthetic privileged failure|private content|postgres|SQLSTATE/);
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
});

test('app shell no longer PUTs browser timezone/metadata into saved owner profile on each visit', () => {
  const layout = fs.readFileSync('src/components/layout/app-layout.tsx', 'utf8');
  assert.match(layout, /fetch\('\/api\/profile\/bootstrap'/);
  assert.match(layout, /method: 'POST'/);
  assert.doesNotMatch(layout, /fetch\('\/api\/profile',/);
  assert.doesNotMatch(layout, /JSON\.stringify\(\{\s*displayName,\s*timezone\s*\}\)/);
  assert.match(layout, /isRestrictedPreview\(\) \|\| !user \|\| isAuthPage/);
  const endpoint = fs.readFileSync('src/app/api/profile/bootstrap/route.ts', 'utf8');
  assert.match(endpoint, /ignoreDuplicates: true/);
  assert.doesNotMatch(endpoint, /update\(|\.delete\(|service_role|SUPABASE_SERVICE_ROLE_KEY/);
  const theme = fs.readFileSync('src/components/layout/theme-provider.tsx', 'utf8');
  assert.match(theme, /currentTimezone:\s*environment\.timezone/);
  const profile = fs.readFileSync('src/app/settings/page.tsx', 'utf8');
  assert.match(profile, /Home timezone/);
  assert.match(profile, /timezone:\s*profile\.timezone/);
});
