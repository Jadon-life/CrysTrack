import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

test('profile picture upload bypasses Vercel function payload limits', () => {
  const settings = read('src/app/settings/page.tsx');

  assert.match(settings, /createSupabaseClient/);
  assert.match(settings, /\.storage\s*\.from\(AVATAR_BUCKET\)\s*\.upload\(/s);
  assert.doesNotMatch(
    settings,
    /fetch\(['"]\/api\/profile\/avatar['"][\s\S]*method:\s*['"]POST['"]/,
  );
  assert.match(settings, /avatarPath:\s*newPath/);
});

test('avatar validation remains at five MB with real image signature checks', () => {
  const helper = read('src/lib/profile-avatar.ts');

  assert.match(helper, /MAX_AVATAR_BYTES = 5 \* 1024 \* 1024/);
  assert.match(helper, /detectAvatarMime/);
  assert.match(helper, /image\/jpeg/);
  assert.match(helper, /image\/png/);
  assert.match(helper, /image\/webp/);
});

test('profile API only accepts avatar paths owned by the signed-in user', () => {
  const route = read('src/app/api/profile/route.ts');

  assert.match(route, /validAvatarPath/);
  assert.match(route, /avatarPath/);
  assert.match(route, /updates\.avatar_url = body\.avatarPath/);
  assert.match(route, /updates\.avatar_url = null/);
  assert.match(route, /createSignedUrl/);
  assert.match(route, /supabase\.auth\.updateUser/);
});

test('replacement switches metadata before best-effort cleanup of the old object', () => {
  const settings = read('src/app/settings/page.tsx');

  const commitIndex = settings.indexOf('avatarPath: newPath');
  const cleanupIndex = settings.indexOf('oldPath && oldPath !== newPath');
  assert.ok(commitIndex >= 0);
  assert.ok(cleanupIndex > commitIndex);
});

test('top navigation still listens for profile updates', () => {
  const nav = read('src/components/navigation/top-navigation.tsx');
  assert.match(nav, /crystrack-profile-updated/);
  assert.match(nav, /avatar_signed_url/);
});
