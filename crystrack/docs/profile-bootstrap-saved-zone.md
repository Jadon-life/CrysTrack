# Issue #68 — first-login profile initialization without owner preference loss

## Failure fixed

The previous app shell sent a PUT /api/profile for every signed-in render using the device timezone and possibly stale user metadata. The profile endpoint upserted both values, silently resetting the account's **Home timezone** and chosen **display name**. In CrysTrack's daily-records migration 0013, home and saved scheduling timezones have distinct ownership/transition semantics. Opening the app is not user approval to change either.

## New narrow contract

The app shell now makes a same-origin POST /api/profile/bootstrap with a validated device timezone hint **only** to ensure a missing new user's profile exists. The server authenticates the owner with auth.getUser and **never trusts client user_id or display_name**. It accepts one UTF-8 JSON timezone field, a maximum of 512 bytes, and same-origin requests only. The Supabase call uses upsert({user_id,display_name,timezone},{onConflict:'user_id',ignoreDuplicates:true}), which is INSERT ON CONFLICT DO NOTHING. Once a profile exists, repeated requests / concurrent tabs **cannot change** the saved home timezone or owner display name. Errors are generic and non-cacheable.

The existing Settings profile save remains the owner-editable route. The current-location weather integration still writes the separate currentTimezone field. No changes to the protected daily scheduling timezone transition logic, routes' finance arithmetic, shards, Preview safety, offline, Three.js rocker, or existing SQL migrations. The opt-in release API stop from Issue #53 can still reject POST when explicitly enabled.

## Evidence and limitations

Node tests use a stubbed Auth and PostgREST contract to check missing/existing owner, ignoreDuplicates intent, cross-origin rejection, invalid timezone/body/size, sanitized database errors, and that the shell never PUTs automatic profile values. These are **unit tests**, not proof of managed PostgreSQL RLS or the real first-account race.

The old shell's background initialization request already ran concurrently with other user data reads. This change does not claim the initial daily activation race is solved or that current Supabase hosted data has been inspected. A separate synthetic/local authenticated full-client test and hosted read-only preflight remain required for release. Supabase Auth, RLS, production configuration and current DB have not been altered.

**Only merge to Sep28 development after exact-head CI, self-review; do not touch hosted services, enable Preview, deploy, merge main or close Issue #18.**