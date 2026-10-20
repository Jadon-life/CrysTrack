# Issue #41 — local validation and independent-review handoff

## Scope and authority

Development base: `4df6584eb12f9a9fedaa428f43db5b6fdca7630d`, verified against
GitHub immediately before branching; baseline CI 39389753767 had both jobs green.
Feature branch: `feat/piece7b-explicit-ai-consent`. Draft PR #42 targets
`feat/crystrack-premium-sep28`. No post-September main source was used.

All Auth/SQL/browser fixtures are synthetic in the guarded disposable Docker
sandbox. Model HTTP is replaced at the transport boundary, with fake/absent keys,
not forwarded to a real provider. Candidate 0022 was applied only locally. No
hosted database, Vercel settings, deployment, production/main mutation or paid
resource was used. Issue #18 remains a hard release blocker.

## Executed checks

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run check` | 228/228 application tests; typecheck passed; lint zero errors, four existing warnings | `validation/issue41/application-check.log` |
| `npm run test:local:db` | 137/137 real disposable-local integration tests (122 retained + 15 new) | `validation/issue41/local-database.log` |
| `npm run build` | Optimized normal production artifact succeeded locally | `validation/issue41/production-build.log` |
| Credential-free Preview boundary | Passed: 12 routes, 41 writer route files, zero external runtime requests; missing-mode protection retained | `validation/issue41/synthetic-preview.log` |
| Maintenance barrier | 55/55 task/daily/cron method probes denied with 503 before auth; auth remains available | `validation/issue41/maintenance-probes.log` |
| Protected source/migration comparison | No protected source or legacy migration changes; schema original prefix identical; six Wealth write handlers identical | `validation/issue41/source-invariants.json` |

All nine retained signed-in Chromium suites passed: Assignments, Today streak,
Crystal Shards, Week Grid, Monthly Budgets, Recurring Bills, CSV, Money Presentation
and Wealth Overview. Timing inventory and each successful output are in
`validation/issue41/retained-*`. The new privacy workflow and final GitHub CI
verification are recorded below; unit tests do not substitute for browser tests.

## Final signed-in privacy browser evidence

`CRYSTRACK_CHROMIUM_PATH=/usr/bin/chromium node scripts/test-ai-privacy.mjs`
passed at **375, 430, 768, 1280 and 1440px**, each in both physical theme states
against a bright scenic background, reduced motion, and browser timezone New York
versus saved scheduling timezone Lagos.

- **60 scoped axe scans, zero violations**; conservative reading-surface contrast
  minimum **11.37:1**. Enabled buttons/switches met 40px targets. Keyboard disclosure,
  opt-in confirmation, Escape, focus restoration and live status were exercised.
- **29 intercepted model calls, zero real provider calls**. All provider adapters,
  domains, explicit and automatic goal paths, OFF/no-write behavior, no automatic
  navigation generation, scope review, Wealth toggle and retrospective-history
  exclusion were exercised. A separate unconfigured server made no provider call.
- Cross-tab consent withdrawal aborted a deferred request and persisted no late
  messages. Confirmed local clear removed all owner AI stores/embedded analysis,
  preserved another owner's archive, and preserved source records.
- All five owner-pair before/after finance, reward and durable-record hashes match.
  The synthetic exact available balance remained **NGN 33,749.75**; no financial
  source math or write handler was changed. New check-in rewards were confined to
  a separate synthetic action-test owner and verified as legitimate source writes.
- No page overflow or browser errors. 281 non-loopback browser requests (existing
  scenic assets/weather/font attempts) were blocked; none were allowed by the
  harness. Server transport permits loopback and intercepts only the fixed model
  endpoint; other external destinations are rejected.
- **86 actual JPEG captures**: [screenshot index](screenshots/issue41/README.md).
  Sanitized machine evidence: `validation/issue41/ai-privacy-browser.json`.

The nine retained workflows ran before the final copy/disclosure-only Settings
polish. The rebuilt final privacy suite repeated all five widths and both themes,
including the new keyboard disclosure and control prominence assertions. No
retained feature behavior changed after its successful regression run.

## Security cases

The 17 added application tests exercise every provider-bound route, all domain
scopes, automatic goal check-in analysis, OFF/malformed/unavailable permission,
missing authentication, owner filtering, Wealth exclusion, allowlisted context,
actual review payload, old-cache/history non-disclosure, prompt-as-data framing,
size/rate/configuration/error handling and revocation at the provider boundary.

The 15 added database cases test default-off truth, direct grant denial and RLS,
owner/revision/idempotency, opt-in/off/on ABA and retry behavior, concurrent stores
versus revocation, request expiry/rate caps, same-generation chat history, atomic
local clear, foreign-owner isolation, malformed legacy cascades and goal/check-in
provenance. Source finance/reward/durable hashes and private reflections are
preserved. The legacy goal-insight varchar risk label is bounded without losing
the full structured `insufficient_evidence` status.

## Failures investigated and corrected during validation

- An empty new branch initially resolved a stale cached remote-tracking reference.
  This was caught before edits, and the empty branch was recreated from the
  freshly verified remote FETCH_HEAD. The development branch and shared history
  were not reset or rewritten.
- Early candidate SQL tests found an ambiguous goal identifier and a record/alias
  collision. Both were corrected in the new candidate, followed by a fresh
  guarded reset and the full 137-test pass. No legacy SQL was edited.
- Early reset/test processes overlapped. Subsequent resets were explicitly awaited
  before tests; the recorded complete database run is the sequential final pass.
- The first Preview attempt lacked a managed Playwright browser. The installed
  `/usr/bin/chromium` was used; no network browser installation or guard bypass.
- React lint caught render-time ref writes; owner/generation refs now update in
  layout effects. Final lint has only the four pre-existing warnings.
- Retained budget snapshot comparison found the same Crystal award rows in a
  different order. Added explicit stable ordering to the test's SQL aggregates;
  no values are omitted or changed and the rerun passed.
- Mobile screenshot review prompted a copy/layout refinement limited to the new
  privacy controls: concise scope above the switches, full details in a native
  keyboard-accessible disclosure and explicit scope/retention text in the consent
  modal. The normal artifact was rebuilt and privacy browser checks repeated.
- Maintenance probes intentionally refuse an invocation without the explicit
  local-only confirmation. The correct guarded invocation passed all 55 probes.

## Limits and release gate

Real OpenRouter/model availability, provider retention, hosted migration history
and hosted deployment compatibility remain unverified. No external deletion is
claimed. Already transmitted requests cannot be recalled; in-flight abort is best
effort and stale result persistence is blocked transactionally. Scoped axe,
keyboard/focus and contrast checks are not a full manual screen-reader or
cross-browser accessibility certification. The four existing lint warnings are
unrelated to this change. Full account export/deletion and offline sync remain
separate milestones. Independent review and Issue #18 resolution are required
before any live release.
