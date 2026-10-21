# Piece 10A — PWA public offline fallback and safe push navigation

This is a development-only incremental Piece 10 subfeature. Existing Next.js PWA manifest remains installable with PNG icons, now offers optional Today / Plan / Wealth shortcuts. Existing PNG icons are **not** advertised as maskable because their protective padding has not been visually verified.

## Privacy and behavior

CrysTrack has sensitive per-owner tasks and financial records. The new service worker caches **exactly one static, generic, public document**, /offline.html, under crystrack-public-offline-v1, and cleans only obsolete versions of this own cache. It **never caches authenticated HTML, task or finance API responses, offline replay receipts, account data, images requiring credentials or sensitive JSON**. Its network-first handler only intercepts same-origin GET navigation, and serves this generic document on real fetch exceptions. Successful online responses are relayed unchanged, never cached. API, non-GET, cross-origin, SW/Next internal resource and offline-fallback requests are bypassed.

The fallback is public through the auth middleware (no auth cookie required) and contains no embedded user state, JS, external network calls or personal content. It does not claim the authenticated app or offline money editing works without a network. The original signed-in optional Today replay remains separately scoped; its privacy and consent restrictions are unchanged.

Push notification destinations now accept only bounded, same-origin **relative app paths**. Absolute external URLs, protocol-relative links, backslashes, API/internal endpoints and service-worker paths become '/'. This is checked when the notification is created AND when clicked (protecting notifications left behind by older SW versions). Icons and badges are fixed to local same-origin assets, preventing remote icon tracking. Valid deep-links such as '/tasks' and '/plan?tab=goals' continue to work.

## Test evidence and remaining work

The node:test VM suite mocks the entire worker lifecycle, CacheStorage, fetch, notification push and click, asserting that only the generic fallback is cached, owner network pages are never persisted, bypassed requests are untouched, off-origin links never open, Preview still unregisters a worker and the static fallback is public. Actual mobile Safari/Android installability and notification delivery are **not** proven by mocked tests. The sw.js script requires a real network on initial install to cache the public page. If a private authenticated page fails to load, the fallback makes no claims about local account state.

Remaining Piece 10 scope is still substantial: genuinely padded maskable icon asset, iOS/Android testing, offline reload UX with verified privacy and explicit signed-in owner isolation, and separately designed offline-finance idempotency/conflicts before any such feature is advertised. Do not implement broad cache-first service-worker strategies for CrysTrack's authenticated pages.

No hosted Supabase, Vercel, production, Preview activation, financial transactions, migrations or main branch changes are part of this PR. All existing safety blockers under #18 remain OPEN.