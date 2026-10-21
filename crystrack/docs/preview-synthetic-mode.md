# Issue #11 — credential-free synthetic Preview

This is code for review, **not authorization to re-enable Preview or deploy**.
Only `crystrackbeta` is in scope. Production, hosted Supabase, domains, project
settings and environment bindings have not been modified.

## Mode contract

| Build/runtime | Result |
|---|---|
| Ordinary development / fresh Production build | Existing application behavior; real clients retain their existing authorization and RLS requirements. A demo flag alone cannot enable demo in a normal build. |
| `VERCEL_ENV=preview`, absent/incorrect `CRYSTRACK_PREVIEW_MODE` | 503, including pages, API, callbacks and static assets. No session refresh or clients. |
| `VERCEL_ENV=preview`, exact server-only `CRYSTRACK_PREVIEW_MODE=synthetic-v1`, matching Preview artifact | Read-only synthetic demo. |
| Preview runtime with an ordinary artifact | 503, even with the flag. Rebuild with the reviewed Preview configuration. |
| Preview-built artifact without runtime deployment metadata | Remains restricted; it cannot silently become a live client. Do not promote a demo artifact to Production. |

`next.config.js` generates `NEXT_PUBLIC_CRYSTRACK_RUNTIME`; operators must not set
it. In **every Preview build**, including blocked builds, it overrides all supplied
`NEXT_PUBLIC_*` values with empty strings before setting this build-owned marker.
This prevents old shared URL/key bindings from entering client bundles. It does
not edit Vercel configuration. A query string, request header, cookie, client flag
or synthetic user's identity cannot bypass the boundary.

## Request and client boundaries

- `src/proxy.ts` checks Preview before `updateSession`, including static assets.
  Normal production keeps the former asset bypass and session behavior.
- The closed demo adapter serves bundled DTOs only. Unknown API routes, every
  mutation verb, Auth callback, cron dispatch, push, Telegram, external AI and live
  exchange-rate reads are denied before their handlers run. HTML/server-action
  POSTs are denied too. No cookie session is exchanged/refreshed in demo.
- Browser/server/admin Supabase factories and normal session middleware also reject
  Preview before credential reads, cookies or SDK construction. This is a second
  boundary, not a mock service-role client.
- AuthProvider supplies a fictional user with no token/session. `/auth` is an entry
  to the demo, never an email/password form. Settings never constructs Storage or
  uploads/removes a file in Preview. New push workers, subscriptions and permission
  prompts are disabled; old root-worker registration is removed on this Preview
  origin and `/sw.js` serves an unregistering replacement.
- Location permission prompts, IP lookup and weather calls are disabled. Existing
  local scenic backgrounds and the approved Three.js switch still work. Theme
  changes stay in React state; PUT requests are denied. Currency display changes
  stay in memory only in Preview (no old cache read, rate request or localStorage
  write); financial arithmetic, real writers and ordinary persistence are unchanged.
- Known server outbound AI/Telegram/rate transports have an additional pre-fetch
  assertion. No service keys or external APIs are used by the adapter.
- Preview responses apply `connect-src 'self'`, same-origin image/font restrictions,
  `worker-src 'none'`, no frames/forms, and disabled geolocation/camera/microphone.
  External link clicks in the demo app are neutralized. Production CSP/permissions
  are unchanged. Same-origin requests still pass through the closed API allowlist.

The demo is deliberately **read-only**, rather than simulating a persistent account.
Existing create/edit buttons return a clear demo-disabled error. Appearance controls
work without persistence. Bundled example dates are explicitly labelled 28 September
2026; they are not real activity or historical database evidence. Wealth is an empty
synthetic DTO, not invented balances or a changed financial calculation. Read responses
keep their normal shapes, including History's separate array/paged contracts.

## Reproduce local safety verification

```sh
npm ci
npm run check
# Install Chromium for this test runner, or use an existing executable:
npx playwright install chromium
npm run test:preview
# In this cloud workspace the existing system Chromium was used instead:
CRYSTRACK_CHROMIUM_PATH=/usr/bin/chromium npm run test:preview
# test:preview builds a Preview artifact; make a fresh ordinary build afterwards:
npm run build
```

`test:preview` owns a loopback-only Next server on a temporary port. It starts no
Supabase service and runs no SQL. It drops inherited credentials, uses fake marker
keys and the known live hostname **as a deny target only**, builds the actual
Preview client, and scans every static artifact for URL/public/private markers.
It probes the complete writer inventory over local HTTP. Chromium denies any
non-local request, records fetch/socket/beacon/geolocation/push attempts, navigates
all 12 pages, exercises the approved switch and an upload attempt, and checks for
runtime errors. It then restarts with the required server flag absent and checks
503 responses. The browser/server are stopped in `finally`.

Synthetic screenshots/results are ignored in `.preview-test/`; never add local
credentials, browser profiles or generated builds to Git. This test intentionally
replaces `.next`, so do not run it beside another local Next server/build. The
normal unit suite also checks every writer, missing/mismatched configuration,
zero SDK constructions, synthetic DTO isolation and Production factory pass-through.
The legacy production-write test uses a synthetic SDK mock, not a hosted account.

## Reversible Vercel cutover — DOCUMENT ONLY, separate owner approval required

Keep **Preview Branch Tracking OFF** throughout steps 1–6. No step below has been
performed by this implementation.

1. Verify existing project **crystrackbeta**, repository `Jadon-life/CrysTrack`,
   root `crystrack`, production branch, and current OFF state using metadata only.
   Do not create/link another project or touch production aliases. Record variable
   *names, targets and branch overrides*, not decrypted values. Record the last
   known-good deployment and securely available configuration recovery history.
2. In Vercel project Settings → Environment Variables, remove **Preview target only**
   from `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL`.
   For a shared Production+Preview entry, deselect Preview and retain Production
   and its value unchanged; never delete the shared entry globally. Review custom
   environments, inherited/team bindings and every branch override for the same
   names. No Preview build/runtime should receive any hosted database credentials.
3. Likewise remove Preview-only real integration targets/bindings: OpenRouter API
   key, exchange-rate API key, Telegram token/username/webhook secret, cron secret,
   VAPID public/private keys/subject, and any added third-party integration secrets.
   Preserve every Production binding/value. Do not retrieve secrets into a report.
4. Add server-only `CRYSTRACK_PREVIEW_MODE=synthetic-v1` to Preview only. Leave the
   generated `NEXT_PUBLIC_CRYSTRACK_RUNTIME` unset. Do not alter `VERCEL_ENV`.
   Review metadata again: no production-backed secret or URL remains in Preview.
5. With **separate deployment approval**, build one reviewed commit as a manual
   Preview on **crystrackbeta** while automatic tracking stays OFF. Do not promote,
   alias to Production, reuse a Production origin, or restore a cached ordinary
   artifact. Public variables require a fresh build, not just runtime editing.
6. Verify actual deployment SHA, synthetic identity/data, read-only banner, every
   API writer/callback/cron/integration denial, no Supabase SDK/session/Storage/push
   usage, no external browser/network traffic and no credential markers in served
   assets/HTML. Run both desktop and mobile checks, theme switch and upload probe.
   Verify missing flag gives 503 with a separately reviewed test Preview if needed.
7. **Only after successful evidence and explicit owner approval**, re-enable
   automatic Preview Branch Tracking. Keep the credential-free target/override
   policy and repeat the safety tests for changes to routes, clients or integrations.

### Recovery

If anything is uncertain, leave/turn automatic Preview tracking OFF first. Stop
using the affected Preview; do not promote it. Remove the Preview-only demo flag
(or deploy the blocked configuration only with approval) to fail closed. Restore
configuration only from secured Vercel history and with separate approval; never
restore production-connected credentials to an active Preview as a shortcut.
Production bindings/deployments and Supabase need no rollback because this cutover
must not change them. Existing production-connected previews remain unverified and
must not be used as staging merely because this new code exists.

## Release limits

Local verification is not a Vercel account audit or proof that old deployments are
safe. Direct Vercel project access is unavailable in this session; GitHub deployment
and Vercel status signals are checked for the pushed SHA. Preview remains disabled
per the owner's confirmation. No migration, real user record, financial operation,
paid service, APP-Dev reuse, deployment or merge is authorized by this PR.
