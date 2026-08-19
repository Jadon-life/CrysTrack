import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

test('profile API returns a signed private avatar URL and keeps display-name sync', () => {
  const route = read('src/app/api/profile/route.ts');

  assert.match(route, /profile-avatars/);
  assert.match(route, /createSignedUrl/);
  assert.match(route, /avatar_signed_url/);
  assert.match(route, /supabase\.auth\.updateUser/);
  assert.match(route, /full_name:\s*displayName/);
});

test('avatar API validates, uploads, replaces and removes profile pictures', () => {
  const route = read('src/app/api/profile/avatar/route.ts');

  assert.match(route, /MAX_AVATAR_BYTES = 5 \* 1024 \* 1024/);
  assert.match(route, /detectImageMime/);
  assert.match(route, /image\/jpeg/);
  assert.match(route, /image\/png/);
  assert.match(route, /image\/webp/);
  assert.match(route, /\.upload\(/);
  assert.match(route, /avatar-\$\{Date\.now\(\)\}/);
  assert.match(route, /\.remove\(/);
  assert.match(route, /avatar_url: null/);
});

test('settings exposes profile-picture upload and removal', () => {
  const settings = read('src/app/settings/page.tsx');

  assert.match(settings, /\/api\/profile\/avatar/);
  assert.match(settings, /Profile picture/);
  assert.match(settings, /Upload photo|Change photo/);
  assert.match(settings, /Remove/);
  assert.match(settings, /image\/jpeg,image\/png,image\/webp/);
});

test('top navigation renders the profile picture with initial fallback', () => {
  const nav = read('src/components/navigation/top-navigation.tsx');

  assert.match(nav, /crystrack-profile-updated/);
  assert.match(nav, /avatar_signed_url/);
  assert.match(nav, /topnav-avatar/);
  assert.match(nav, /avatarUrl \?/);
});
