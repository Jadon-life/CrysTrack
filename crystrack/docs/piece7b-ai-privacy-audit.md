# Issue #41 — provider and privacy audit before implementation

Verified remote development SHA `4df6584eb12f9a9fedaa428f43db5b6fdca7630d` and both
successful jobs in CI 39389753767. A stale cached tracking ref was detected before
edits; the empty feature branch was recreated from the verified FETCH_HEAD.
Branch: `feat/piece7b-explicit-ai-consent`. No AGENTS.md exists. No main source used.

## Existing exposure paths

- `intelligence.ts`: chat and domain OpenRouter calls; optional Referer header,
  arbitrary model response bodies embedded in errors. ZDR request flags are routing
  requests, not a provider retention guarantee.
- `goal-openrouter.ts`: goal title/description, numeric context and private check-in
  reflections; called by explicit goal analysis AND automatic check-in analysis.
- `wealth-openrouter.ts`: legacy aggregate analyst; raw upstream error body.
- Provider routes: AI chat, domain POST, goal analyze POST, goal check-in POST and
  Wealth insight POST. Full source search found no other model adapter/job.
- Domain cards POST on mount and activity changes. Wealth's GET loads cached domain
  history, with explicit refresh POST. Cached goals expose stored AI check-in JSON.
- `context.ts` general overview includes Wealth even without a separate choice;
  free-text redaction is not an identity/sensitive-data allowlist. Old conversation
  history can also re-disclose old Wealth context across permission changes.
- AI tables: 0005 conversations/messages (cascade), domain insights; original goal
  insights and embedded check-in `ai_analysis`. Existing owner RLS must be retained.
- Privacy & Data's full-account Export data button has no action. Wealth CSV is
  independent and must remain untouched.

## Chosen minimal boundary

Add local-only candidate 0022, verified next free index: isolated owner consent
plus private revision/idempotency/request metadata. Missing rows are OFF, not prior
usage or inferred acceptance. Master OFF resets optional Wealth permission. Every
change/clear invalidates prior request revisions, including off/on ABA sequences.
Provider sends check latest authority immediately before fetch; already transmitted
requests cannot be recalled. In-flight abort is best effort; atomic result commits
must still reject a changed revision. No permission or request metadata contains
prompts, credentials or financial data.

Use a strict automatic context allowlist: saved-zone dates, counts, statuses and
numeric progress; optional aggregated exact NGN totals and approved category names.
Exclude free-form titles/descriptions, private reflections, notes, account IDs,
transaction details, debts' counterparties, references, identity and GPS. The
review panel shows the actual bounded automatic payload without sending it.
Free-text goal quality cannot be assessed from excluded private reflections;
analysis must honestly say evidence is limited. Chat sends explicitly typed text
and only same-consent-generation conversation history, never unreviewed old caches.
Do not claim anonymous messages or that regex can identify all private information.

Domain navigation/activity events should read cache only, with explicit generation.
Old local records remain owner-readable/labeled where shown, never silently used as
freshly approved provider history. Confirmed local clear removes conversation
cascades, domain/goal insights and embedded AI analysis only, not source check-ins,
rewards or finance. 0015 explicitly treats goal AI/text updates as non-rewarding.
Disable/label full-account export honestly; keep Wealth CSV unchanged.

Validation: baseline 211 app /122 DB; targeted permission/RLS/races/payload/error/
no-write/no-provider tests; all nine retained signed-in browsers; new five-width,
Light/Dark/bright-scene consent and clear workflows; scoped accessibility; updated
synthetic read/write inventory, 55 maintenance probes and build/exact-head CI.
Only guarded loopback Docker and fictional records. No real provider invocation,
hosted access/migration, Vercel modification, Preview activation or deployment.
Issue #18 remains the production release blocker.
