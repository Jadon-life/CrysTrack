# Piece 9 — isolated coach and Telegram preview

This work lives on `feat/piece-9-preview`. It does not change the existing `/ai` or `/api/telegram/webhook` flows, register a live webhook, deploy production, or enable a production flag.

## Isolation and configuration

The page `/preview/coach` and all five `/api/preview/*` handlers return 404 before authentication or data access unless every preview gate passes:

- `PIECE9_PREVIEW_ENABLED=true` and `CRYSTRACK_ENV=preview`.
- `VERCEL_ENV` must never be `production`; production-mode Node builds additionally require `VERCEL_ENV=preview`. Local `next dev` can omit Vercel variables.
- `NEXT_PUBLIC_SUPABASE_URL` points to a dedicated staging Supabase project, with matching staging anon/service credentials. Its HTTPS hostname must differ from the required `PIECE9_PRODUCTION_SUPABASE_URL` reference. Do not supply production credentials to this preview deployment.
- `PIECE9_SIGNING_SECRET` is a separate random key of at least 32 characters.

All keys are declared in `.env.example`, disabled/blank by default. Keep production environment settings unchanged. Configure only a preview-scoped environment or an ignored local configuration. The production URL is an isolation reference, never a data source. A proxy guard rejects disabled preview paths before session refresh or streamed page rendering.

Apply the complete existing migrations 0000–0010 to the **staging database**, followed by `src/db/migrations/0011_preview_coach.sql`. In particular, 0008 creates `daily_rituals`, a prerequisite for 0010. The new migration was tested locally but has not been applied to any live service. Never run 0011 on production for this piece.

## Streaming and proposals

The coach streams OpenRouter text and native JSON function-tool deltas over SSE. It uses the existing verified default model and enforces `zdr: true`, `data_collection: deny`, and parameter support. Stop aborts the provider request; the server also has a 60-second stream deadline. Complete, bounded tool calls must pass strict Zod validation before a proposal card appears. Truncated, unsupported or malformed tools cannot become executable cards.

Supported tools: create a recurring task, reallocate existing budget caps, adjust an existing goal target with revision checking, and review a Telegram expense. AI tools have no direct write execution path. Chat histories remain in the current browser tab; Reset clears them without deleting saved staging data.

Context includes saved-zone task completion counts, integer-kobo seven-day spending velocity, current-month category budget usage, goal pacing and owned goal/budget IDs. Money calculations use bigint helpers. Ledger pagination avoids silently truncated figures; month-boundary windows include all seven spending days. Evidence chips are computed server-side, rather than copied from model output. The prompt requires insights to cite these statistics and admit absent evidence. Model prose still requires user judgment and is not a deterministic factual guarantee. Credentials, account identifiers and transaction notes are not sent to the model.

Each proposal is HMAC signed, user-bound and expires after 15 minutes. Same-origin authenticated POST requests are required for inspection and approval. Approval calls one PostgreSQL transaction: the selected write and immutable receipt commit together, using existing finance/goal validation RPCs. Retrying a committed proposal returns the prior result; a dismissed proposal cannot later execute. Failed writes roll back the receipt and data together. Receipt rows have owner-read RLS; clients cannot insert, update or delete them directly. The RPC operates on the caller’s owned records only.

A missed response can be retried with the same valid confirmation; request a fresh proposal after expiry. Saved receipts prevent duplicates across workers and restarts. Chat/action/webhook requests also have a per-worker abuse brake; add preview edge/WAF limits if exposing staging broadly.

## Staging Telegram

Use an entirely separate bot and set `PIECE9_TELEGRAM_BOT_TOKEN`, `PIECE9_TELEGRAM_BOT_USERNAME`, `PIECE9_TELEGRAM_WEBHOOK_SECRET` and the HTTPS `PIECE9_PREVIEW_APP_URL`. Token, username and webhook secret must differ from the existing Telegram configuration. No real bot credentials were configured during implementation.

Once an authorized preview deployment exists, register **the staging bot only** with Telegram `setWebhook`, using the URL `https://YOUR-PREVIEW-HOST/api/preview/telegram/webhook`, its preview secret as `secret_token`, and `allowed_updates: ["message"]`. No automatic setup endpoint changes production webhooks. Registration and real Telegram delivery remain pending preview configuration.

The coach’s “Connect staging Telegram” control generates a 15-minute link. `/start` consumes its one-time token before linking the private chat. Payloads are Zod checked and webhook secrets compared using timing-safe digests. Group/channel messages, bot senders and mismatched private sender/chat IDs are ignored before reading account data.

`/today` and `/agenda` read the existing unified daily data, including deferred tasks, due assignments and focus timeboxes in the saved timezone. `Spent 2500 on lunch` creates a signed review link, not a financial row. The link opens `/preview/coach#confirm=...`; the fragment is cleared after capture, never appears in HTTP request logs, and inspection requires the matching signed-in user. The user must click Approve or Dismiss. Expense capture is NGN only in this preview. Repeated Telegram updates use a stable proposal ID so financial approval cannot duplicate the expense.

## UI audit

Shared interactive GlassCard components already implement cursor spotlights, small 3D tilt/glare and reduced-motion handling. The authenticated shell already mounts one time-of-day/cursor background canvas and inherits tabular numerals. The floating navigation has its existing corrected 20px/180% treatment. No static block replacement was found in the active shared cards.

Two older floating surface rules, `.glass-card-strong` and `.dashboard-bottom-rail`, retained near-opaque tints and 132–135% saturation because the previous shared-card repair did not cover those legacy selectors. They now use the shared translucent navy/black variables and 20px/180% backdrop treatment. Numerical inner data surfaces remain available for contrast. The new coach reuses GlassCard and theme tokens, with 14px body/12px secondary typography, 40px controls, gold focus outlines and tactile button feedback.

## Verification

- `npm run check`: **197 tests passed**, TypeScript and ESLint clean.
- `npm run build`: **passed**, with preview gates off by default.
- `npm run test:coach-preview:db`: **7 tests passed** against isolated temporary PostgreSQL, full migration prerequisites and repeated 0011 application. Covers atomic task/schedule writes, rollback, receipts/RLS, reallocation replay, expense replay and goal revision/ownership checks.
- Browser fixture uses the actual coach, GlassCard, top navigation and background canvas with simulated API data. It checks streaming, stop/reset, approval/dismiss, Telegram review, computed glass/tilt/numeric styles, mobile targets and reduced motion. It passed, including opening a confirmation in an already-loaded tab. It does not claim live OpenRouter or Telegram delivery.
- Built-app smoke check: `/auth` returned 200; `/preview/coach` and every preview API returned 404 with flags disabled.

Pending: configure the isolated preview project and bot, apply staging migrations, register the staging webhook, and perform authenticated end-to-end testing with real staging services. No production publication is part of Piece 9.

## Modified files

- `.env.example`
- `docs/piece-9-preview.md`
- `package.json`
- `src/app/api/preview/coach/actions/route.ts`
- `src/app/api/preview/coach/chat/route.ts`
- `src/app/api/preview/coach/inspect/route.ts`
- `src/app/api/preview/telegram/connect/route.ts`
- `src/app/api/preview/telegram/webhook/route.ts`
- `src/app/globals.css`
- `src/app/preview/coach/page.tsx`
- `src/components/coach-preview/coach-preview.tsx`
- `src/db/migrations/0011_preview_coach.sql`
- `src/db/schema.ts`
- `src/lib/coach-preview/context.ts`
- `src/lib/coach-preview/contracts.ts`
- `src/lib/coach-preview/guard.ts`
- `src/lib/coach-preview/signing.ts`
- `src/lib/coach-preview/sse.ts`
- `src/lib/coach-preview/stream.ts`
- `src/lib/coach-preview/telegram.ts`
- `src/lib/theme.ts`
- `src/proxy.ts`
- `src/types/coach-preview.ts`
- `tests/coach-preview-api.test.mjs`
- `tests/coach-preview-database.integration.mjs`
- `tests/coach-preview.test.mjs`
