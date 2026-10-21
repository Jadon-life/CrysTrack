import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('sign-in exposes non-enumerating password recovery through the existing safe callback', () => {
  const auth = fs.readFileSync('src/app/auth/page.tsx', 'utf8');
  assert.match(auth, /resetPasswordForEmail\(email\.trim\(\)/);
  assert.match(auth, /target\.searchParams\.set\('next', '\/auth\/reset-password'\)/);
  assert.match(auth, /new URL\('\/api\/auth\/callback', window\.location\.origin\)/);
  assert.match(auth, /If this address has an account/);
  assert.match(auth, /auth\.resend\(/);
  assert.match(auth, /type: 'signup'/);
  assert.match(auth, /If a confirmation is pending/);
  assert.doesNotMatch(auth, /setError\(err\.message|setError\(error\.message/);
  assert.match(auth, /isRestrictedPreview\(\)/);
  assert.ok(auth.indexOf('if (isRestrictedPreview())') < auth.indexOf('return <LiveAuthPage'), 'demo must not create a real Auth client');
});

test('recovery view demands an authenticated owner session before password update', () => {
  const page = fs.readFileSync('src/app/auth/reset-password/page.tsx', 'utf8');
  assert.match(page, /^'use client';/);
  assert.match(page, /if \(isRestrictedPreview\(\)\)/);
  assert.match(page, /return <LiveResetPasswordPage/);
  assert.match(page, /supabase\.auth\.getUser\(\)/);
  assert.match(page, /if \(authError \|\| !user\)/);
  assert.ok(page.indexOf('const { data: { user }, error: authError } = await supabase.auth.getUser()') <
      page.indexOf('supabase.auth.updateUser({ password })'));
  assert.match(page, /password\.length < 8/);
  assert.match(page, /password !== confirm/);
  assert.match(page, /supabase\.auth\.signOut\(\)/);
  assert.match(page, /router\.replace\('\/auth'\)/);
  assert.doesNotMatch(page, /console\.log|console\.error|error\.message|localStorage|service_role|NEXT_PUBLIC_SUPABASE_URL/);
});

test('auth callback and app shell cannot turn password recovery into open redirect or unsolicited profile writes', () => {
  const callback = fs.readFileSync('src/app/api/auth/callback/route.ts', 'utf8');
  assert.match(callback, /safeRedirectPath\(searchParams\.get\('next'\)\)/);
  assert.match(callback, /target\.origin !== base/);
  assert.match(callback, /exchangeCodeForSession\(code\)/);
  const layout = fs.readFileSync('src/components/layout/app-layout.tsx', 'utf8');
  assert.match(layout, /pathname === '\/auth\/reset-password'/);
  assert.match(layout, /fetch\('\/api\/profile\/bootstrap'/);
  assert.doesNotMatch(layout, /fetch\('\/api\/profile',\s*{/);
});

test('recovery controls remain keyboard accessible and Preview cannot send real email', () => {
  const auth = fs.readFileSync('src/app/auth/page.tsx', 'utf8');
  const page = fs.readFileSync('src/app/auth/reset-password/page.tsx', 'utf8');
  assert.match(auth, /htmlFor="crys-auth-email"/);
  assert.match(auth, /aria-label=\{showPassword \?/);
  assert.match(auth, /autoComplete="email"/);
  assert.match(page, /htmlFor="crys-new-password"/);
  assert.match(page, /htmlFor="crys-confirm-password"/);
  assert.match(page, /role="alert"/);
  assert.match(page, /autoComplete="new-password"/);
  const preview = fs.readFileSync('src/lib/preview/request.ts', 'utf8');
  assert.match(preview, /if \(request\.method !== 'GET' && request\.method !== 'HEAD'\)/);
});
