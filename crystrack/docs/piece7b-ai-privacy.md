# Piece 7B — explicit AI consent and bounded provider data

## Permission contract

AI is disabled for every missing preference row and every malformed/obsolete consent
policy. Existing AI usage is not consent. Enabling AI requires an explicit confirmed
choice; Wealth sharing is a separate opt-in and is reset when AI is disabled. The
server derives the owner from authenticated Supabase claims. UI flags never authorize
provider access. Preferences are not persisted as authority in browser storage.

Settings → Privacy & Data → AI & Privacy keeps a concise explanation and the two
choices prominent. A keyboard-accessible disclosure holds the full provider/data
explanation; the confirmation modal repeats the key scope and retention limits. It displays the
actual bounded automatic context without contacting a provider, and distinguishes
configured, unconfigured, disabled and temporarily unavailable states. A typed chat
message is sent to OpenRouter and its selected model provider; users must not type
sensitive information. Pattern guards are additional safeguards, not an anonymity or
complete sensitive-data detection guarantee.

## Transmission and concurrency

All model adapters use `src/lib/ai/provider.ts`, a fixed OpenRouter endpoint with no
caller-controlled URL, redirects or HTTP Referer. Owner/revision consent is checked
before sensitive context collection, immediately before transmission, after the
response, and under an owner lock when storing results. Revocation, scope changes,
local deletion and off/on cycles invalidate older request revisions. Exact mutation
retries return current permission truth rather than replaying an obsolete opt-in.

A request authorized immediately before sending may already be in flight when a user
withdraws consent. One-second authority polling attempts to abort it; already sent
bytes cannot be recalled. The database refuses stale result commits. The last
pre-fetch authority check is the transmission authorization point; there is no
cross-system atomic transaction with an external provider. Provider routing flags
request restricted retention but are not a provider-wide guarantee.

Requests have a two-minute permit lifetime and a shared 20-attempt/10-minute owner
limit. JSON input is bounded at 32 KiB, automatic context at 48 KiB, provider request
at 64,000 bytes, and response at 65,536 bytes. Errors contain enum-coded generic
messages; prompts, keys, raw database/upstream bodies and URLs are not logged.

## Automatic context allowlist

- Saved scheduling-zone dates; verified task/routine counts and bounded statuses.
  Missing durable evidence stays unknown rather than becoming a false zero.
- Numeric goal progress, relative timing and check-in counts. No titles, descriptions,
  measurement units, raw targets or private check-in reflections. Qualitative goal
  coaching must explain that evidence is limited.
- Assignment status, priority and timing, without titles or course identities.
- Only with separate Wealth approval: exact aggregate NGN totals and approved
  category totals. No ledger rows, merchant/counterparty names, source notes, account
  references, statements, imported CSV cells or private savings/debt labels.
- Explicitly typed chat and bounded conversation turns from the same permission
  generation. Old local archives and pre-scope-change messages are not automatically
  sent back to a provider.

Finite count/coverage and byte limits fail closed rather than silently representing
an incomplete context as a complete financial report. The existing exact Wealth
report reader and all financial write paths are unchanged.

## Local history and deletion

Navigation reads caches; generation requires an explicit action or a previously
configured AI-coached check-in with current server consent. Domain caches are tied
to policy and revision. Existing owner-authorized conversation archives remain
locally readable and are labeled as saved AI history, not newly verified truth.

Confirmed local clearing atomically deletes owner conversations/messages, domain and
goal insights, embedded check-in AI analysis and request-result references. Source
check-ins, reflections, goals, tasks, finances and rewards remain. A malformed legacy
foreign-owner conversation cascade fails atomically rather than deleting another
owner's row. Individual conversation deletion is also confirmed and revision-bound.
Neither action promises deletion from OpenRouter or model-provider systems.

The inert full-account export button is explicitly unavailable. Existing complete
Wealth CSV export remains independently available and unchanged.

## Additive local migration candidate

`0022_ai_privacy_consent.sql` adds owner-readable default-off preferences, private
mutation/request metadata, RLS and restricted authenticated RPCs. Metadata contains
revision/identifiers and mutation flags, not prompts or provider responses. Direct
client writes to AI result tables are revoked; owner history reads retain existing
RLS. Result writes use atomic owner/revision-checked functions. Drizzle tables/types
were appended in the same implementation. Legacy migrations were not edited.

Applied and tested only in the guarded disposable local sandbox. No hosted migration,
Vercel change, deployment, production data access or main import was performed.
Hosted compatibility and release approval remain separate; Issue #18 is a blocker.

## Test-only provider interception

The signed-in browser harness launches a normal local Next artifact with an explicit
Node preload, `scripts/fixtures/ai-provider-stub.mjs`. The preload requires a synthetic
marker, an exact guarded loopback Supabase target and a fake or absent provider key.
It intercepts the fixed model endpoint, rejects other non-loopback server fetches,
and keeps raw synthetic request captures only in ignored private test output. This
is not an application feature flag or deployed provider substitute. No real model
request or hosted credential is required for the validation suite.
