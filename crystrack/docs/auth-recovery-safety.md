# Piece 9B — password recovery and confirmation resend (DEV ONLY)

This change completes the previously partial Issue #66 candidate on top of the latest approved Sep28 development tree, including the prior PR #69 profile data-integrity fix, PR #71 public offline-only service worker, genuine Three.js rocker and scenic horizontal navigation.

## Flow

At /auth, the Forgot password action calls Supabase Auth resetPasswordForEmail with the current app origin and the existing /api/auth/callback?next=/auth/reset-password endpoint. The callback already validates next as a same-origin app path and exchanges a PKCE authorization code into a cookie-backed session. When arriving at /auth/reset-password, the client calls auth.getUser; only a verified valid session can submit a new password (minimum eight and matching confirmation). After a successful auth.updateUser, it tries to sign out and sends the user back to the login page. Invalid or expired links show recovery guidance, not a stack trace or account data.

The signup view also exposes an auth.resend(type='signup', email) action for pending email confirmation, using the existing safe app-origin callback URL. Both initiation flows show generic, non-enumerating feedback; the UI does not disclose whether an email address exists. Supabase Auth's own rate limits and email-delivery system still apply. Passwords/tokens are not logged, embedded in URLs, or sent to CrysTrack custom API handlers.

Synthetic Preview renders demo-only screens and never creates a live Auth client, sends confirmation emails, exchanges tokens or invokes password mutations. Signed-in and new-account profile bootstrap behavior remains unchanged from PR #69. No hosted Auth dashboard, production email template, redirect allowlist, or credentials were modified.

## Host readiness requirements

Before hosted testing, the owner must separately verify that the **exact production origin** and the allowed /api/auth/callback recovery redirect (including permitted next parameter) are configured in Supabase Auth URL Configuration. Inspect Supabase email templates for a compatible recovery link, sender/reputation, links expiring promptly and domain/origin restrictions. Test actual recovery/confirm emails with an approved synthetic account only, and ensure anti-enumeration and rate limits (including abuse cases). CI static and synthetic browser tests cannot verify live Auth email delivery, link consumption, multi-device sign-out, redirect allowlists or third-party email behavior.

## Tests and explicit safety

src/app/auth/page.tsx and reset-password/page.tsx have executable source regression guards for owner-only recovery, Preview early gate, sanitized feedback, accessible labels and safe callback routing. scripts/test-preview.mjs expands browser checks to 13 routes including /auth/reset-password with no real network/auth integrations. Exact-head CI must pass tests, typecheck, lint, build and Chromium; this branch is DEV-only and does not authorize hosted services, release SQL, Vercel settings, Preview activation, main or production deployment. Issue #18 stays OPEN/BLOCKED.