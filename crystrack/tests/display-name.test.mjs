import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

test('display name save persists profile and synchronizes auth metadata', () => {
  const route = read('src/app/api/profile/route.ts');
  assert.match(route, /profiles/);
  assert.match(route, /supabase\.auth\.updateUser/);
  assert.match(route, /full_name:\s*displayName/);
  assert.match(route, /name:\s*displayName/);
  assert.match(route, /Display name cannot be empty/);
});

test('auth provider can refresh visible signed-in user', () => {
  const auth = read('src/components/layout/auth-provider.tsx');
  assert.match(auth, /refreshUser:\s*\(\) => Promise<User \| null>/);
  assert.match(auth, /const refreshUser = React\.useCallback/);
  assert.match(auth, /value=\{\{ user, loading, signOut, refreshUser \}\}/);
});

test('settings refreshes display name after successful save', () => {
  const settings = read('src/app/settings/page.tsx');
  assert.match(settings, /const \{ user, refreshUser \} = useAuth\(\)/);
  assert.match(settings, /await refreshUser\(\)/);
  assert.match(settings, /setStatus\('Profile saved'\)/);
  assert.match(settings, /Display name cannot be empty/);
});
