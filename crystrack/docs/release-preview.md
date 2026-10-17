# CrysTrack 2.0 preview release candidate

Scope: **Preview only**. Keep `feat/crystrack-2-floating-workspace` separate from `main`. Existing GitHub deployment records show that `main` changes publish production deployments for both `crys-track` and `crystrackbeta`; merging this PR would conflict with the user's latest preview-only instruction. Do not merge or promote until separately authorized.

## Validated candidate

Executed on 2026-10-17, from `crystrack/`:

- `npm ci`: passed with the existing lockfile; no dependency/lockfile update.
- `npm run check`: 201 tests passed, TypeScript and ESLint passed.
- `npm run build`: optimized production build passed.
- `npm run test:workspace:browser`: passed. Actual React components with explicit synthetic local API fixtures, all 12 routes at 375, 430, 768, 1280 and 1440px, sidebar expanded/collapsed in both themes, storage persistence/fallback, drawer, portals, keyboard focus, task completion, focus session, reflection, local timezone, reduced motion and all five adaptive scenes.
- `npm run test:coach-preview:db`: 7 tests passed against disposable local PostgreSQL; does not apply migrations to Supabase.
- Local built-app smoke: all 12 page URLs and the official JPEG asset returned 200; unauthenticated `/api/dashboard/today` returned 401; disabled `/preview/coach` and `/api/preview/coach/chat` returned 404. A page-shell 200 is not an authenticated workflow test.
- Changed-file scan found no private-key/token/credential-URL/JWT patterns; no build artifacts or local environment files are included.

Screenshots and their fixture provenance are documented in `docs/screenshots/README.md`. The redesign uses genuine application endpoints in normal operation; fixtures are confined to the browser test harness.

## Database assessment

The CrysTrack 2.0 redesign changes no database model, migration, API route, money helper or RLS policy. It requires no new migration and no live migration was run.

This feature branch inherits Piece 9 commit `bb17e31` that is not yet on `main`, including `0011_preview_coach.sql`. That migration is for the isolated AI/Telegram staging feature only, not the UI redesign. Its live application status is unverified. Keep that feature disabled unless a dedicated staging Supabase project, prerequisites 0000–0010 and 0011, and all preview-only credentials/flags have been verified. Never apply 0011 to production for this preview release. The fail-closed guard and existing environment defaults remain unchanged. See `docs/piece-9-preview.md`.

No production migration history or backup claim is made: this environment has no authorized administrative database connection. No production records were changed, and no migration or rollback is needed for the visual update itself.

## Deployment and remaining verification

Use the existing GitHub-connected Vercel projects; do not create a duplicate project. A feature-branch push requests their normal Preview deployments. Inspect the resulting GitHub checks/deployments for the exact committed SHA and environment before reporting deployment complete. Production project settings and flags must remain unchanged. No Vercel administrator credential is available in this workspace, so root-directory and environment-variable settings cannot be independently audited through the Vercel API.

Direct HTTPS requests to the existing preview hosts failed in the cloud egress proxy with `Tunnel connection failed: 403 Forbidden`. If this persists for the new deployment, GitHub's Vercel deployment status can establish deployment completion, but live HTTP/browser checks remain unverified. Environment network access must allow the preview hosts (`*.vercel.app`) to complete those checks.

The exact official wordmark is also pending: supplied JPEG C-mark pixels are preserved, but the adjacent text is not an original official logo lockup. Original light/dark SVG or transparent PNG lockups were requested; do not describe branding acceptance as complete.

Live authenticated Supabase workflows, real AI delivery, notifications, staging Telegram and production schema readiness are unverified without suitable authorized test access. No destructive tests or production deployment are part of this preview candidate.
