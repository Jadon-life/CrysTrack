# Vercel Preview write-risk audit (Issue #8)

## Evidence and scope

Issue #8 records the authorized management audit: `CrysLearn` is on Free with two
projects; CrysLearn(APP-Dev) must not be reused. CrysTrack project
`yfzglhwjtpirbwhqatdx` has real records and no migration-history results were returned.
Treat it as potentially production; an absent history result does not mean an empty
schema. No CrysTrack database branch was found. No hosted project was created here.

The issue also records `crystrackbeta` variable metadata with shared Production +
Preview targets for URL, anonymous key and both server-secret bindings, without a
branch override. Thus Preview has **no verified isolation** and must be treated as
potentially live. These findings are supplied by the issue's prior audit, not fresh
credential retrieval in this PR. No secret values, live SQL or private rows were read.
Local Supabase cannot be reached by Vercel and is not hosted staging.

Only `crystrackbeta` is authorized. If management access is available in a later
approved task, query that project by name/ID without team scope (the issue records
that team-scoped requests incorrectly fail). Re-check metadata, not decrypted values.

## Complete current writer inventory

`preview-write-inventory.json` enumerates every current API mutation export plus
the auth callback GET. `npm run audit:preview-writes` reproduces it; tests fail on
inventory drift. This scanner is a review aid, not a proof of absence of side effects.

| Surface | Current write paths / implications |
|---|---|
| Tasks | POST `/api/tasks`, DELETE `/api/tasks/[taskId]`, POST archive, occurrence toggle/skip; atomic local-first daily outcome RPCs, future schedule versions, reminders and activity. Hosted compatibility is not yet verified. |
| Goals | POST goals, DELETE goal, POST checkins/analyze; progress, checkins, AI analysis and activity. |
| Assignments | POST assignments, DELETE assignment, PATCH complete; completion and related activity/reminder cleanup. |
| Finance | POST finance, entries, targets, debts; PATCH debt repayment/expected confirmation/state, POST expected; legacy target-adjustment RPCs and ledger writes. Double-credit risk against newer triggers remains separate. |
| AI | POST chat, domain analysis and conversations; DELETE conversation; messages, insights and conversation updates. May also spend external API credit. Wealth insight calls an external model but does not persist an insight itself. |
| Reminders/cron | POST dispatch uses service role to create/update deliveries, close missed tasks, record activity, cancel invalid push subscriptions and send real push/Telegram messages. GET reminder listing is not authorization to dispatch. |
| Push | POST/DELETE subscribe writes subscriptions; browser subscription creates device-side state. |
| Telegram | POST connect/setup/webhook and DELETE status; link tokens, connections, token consumption, privileged `link_telegram_connection`, external webhook registration/replies. |
| Auth | Browser signUp/signInWithPassword/signOut; callback **GET** exchanges code for session; middleware can refresh sessions. Auth writes occur outside app API guards. |
| Profile | PUT profile and POST/DELETE avatar; profile upsert, Auth metadata changes and storage operations. **AppLayout automatically PUTs profile on authenticated page load.** |
| Preferences/location | PUT preferences/profile from theme provider; switching appearance and location updates can persist. Approved Three.js switch remains unchanged. |
| Browser storage writes | Settings directly uploads/removes avatars through Supabase Storage; blocking Next API POSTs cannot stop this. |
| Daily notes | Owner GET/PUT backend with revisions; no UI. Notes are private, excluded from AI/activity. New daily context/read GETs can materialize capture records; do not treat GET as read-only. |
| RPC/direct clients | Finance RPCs: `increment_target`, `adjust_target`, `create_wealth_debt`, `repay_wealth_debt`, `confirm_expected_flow`; privileged Telegram RPC. Public client bindings can reach Supabase directly according to grants/RLS. Owner RLS permits writes to that owner's real records; it is not preview isolation. |

The executable profile test proves a synthetic authenticated request still invokes
the existing writer with `VERCEL_ENV=preview`. No application guard was added.
Likewise hiding buttons, blocking only finance, disallowing API mutation verbs, or
adding a cosmetic "read only" label cannot protect all these paths.

Issue #10 adds daily outcome/note/timezone/create/retire RPCs. These are writers even if invoked through an authenticated read/materialization path; their existence does not make shared Preview safe. Preview Branch Tracking must remain OFF. No Vercel settings are changed by this PR.

The issue reports RLS disabled on two empty repair-backup tables. That is a separate
production security remediation requiring authorization; no DDL was attempted.

## Proposed no-cost strategy — requires separate approval

Use a **credential-free synthetic demo Preview**, not a read-only connection to
production. Keep real authenticated development on local Docker.

1. In a separately approved PR, introduce a server-enforced demo mode with a default
   deny policy for every Preview that lacks an explicitly reviewed safe mode. Check
   before any Supabase/Auth/storage/external integration client is constructed.
2. In demo mode, serve bundled synthetic DTOs through a demo adapter; no real login,
   signup, callback exchange, session refresh, uploads, webhooks, cron, push, Telegram
   or billable AI. Changes can be session-local mock interactions, clearly labelled
   non-persistent. Preserve the approved scenic layout and switch geometry.
3. Prevent browser Supabase client creation and ensure the demo bundle contains no
   hosted URL/key bindings. Server-side mutation denial alone is insufficient.
4. Only with separate authorization, remove hosted credentials from Preview scope
   in `crystrackbeta`, including server secrets/integrations, leaving Production
   unchanged. Rebuild a reviewed Preview because public bindings are build-time.
5. Verify with a browser network denylist: zero production Supabase/Auth/Storage or
   external integration requests, including on load, theme changes, uploads, auth
   callbacks and old service-worker behavior. Direct mutation probes must fail closed.

No additional project, plan, hosted backend or billing is needed. This PR only
proposes this policy; it does not activate a guard, block current access, alter
Vercel config/variables, or deploy. Existing previews remain potentially unsafe.

## Release / PR safety

GitHub pushes/PRs can automatically trigger Vercel independently of a CLI deploy.
Do not assume a commit marker prevents deployment: prior PR metadata reported
DEPLOYED despite a `[skip vercel]` marker. Confirm automatic deployment is disabled
for this implementation branch before pushing it. A draft PR is not an isolation
boundary. No merge, promotion or production migration is authorized.

## Issue #11 implementation draft

See [credential-free synthetic Preview](preview-synthetic-mode.md). The new
Preview-only boundary denies all API mutation paths and auth callbacks before
handlers/session refresh, rejects real client construction, strips public build
bindings and serves a closed synthetic read adapter. Normal Production behavior
is retained. This changes the earlier statement that no application guard exists
**for this new branch only**; it does not protect old deployed artifacts. Preview
Branch Tracking stays OFF; the reversible Vercel cutover is documentation only.
