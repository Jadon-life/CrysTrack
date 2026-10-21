# PR #42 — independent security review corrections

Review: https://github.com/Jadon-life/CrysTrack/pull/42#issuecomment-6288493686
Reviewed starting head: `262fc042b752ea06b6edd7c3ff9885be14257088`.
Same feature branch and draft PR; no main code or live changes.

## Finding 1: ownership was not trusted result provenance

The review correctly found that ordinary authenticated clients could obtain a
request permit and call the completion RPC themselves. Owner/revision checks
prevented cross-account access, but did not prove that saved output came from the
Next server's validated provider path. The earlier test suite did not establish
this boundary. The correction removes normal-client issuance and completion.

- `ai_request_begin`, `ai_request_check` and `ai_request_finish` now grant EXECUTE
  only to `service_role`, and independently require a verified service-role JWT
  claim in SQL. There is no authenticated overload, security-definer wrapper or
  anon/cookie-client fallback granting these operations.
- A `server-only` module reuses the existing Supabase backend credential through
  the existing admin-client factory. The owner comes from `auth.getUser()` on the
  request's authenticated client, never from JSON/query/model fields. It is held
  only in an internal lease and is verified again before completion.
- Backend SQL binds owner, request UUID, revision and domain and rechecks the
  current policy/Wealth consent. Existing owner advisory/row locks, expiry/rate
  caps, one-result atomicity, off/on ABA protection, revocation and deletion remain.
- Missing backend credentials return truthful unconfigured status and prevent
  permits, provider fetches and result writes. The existing server-only
  `SUPABASE_SECRET_KEY` / legacy `SUPABASE_SERVICE_ROLE_KEY` requirement is clarified
  in `.env.example`; no credential value or new public key is introduced.
- Existing direct DML denial on AI conversations/messages/domain/goal insights
  remains. A new trigger also blocks authenticated INSERT/UPDATE of non-null
  embedded `goal_checkins.ai_analysis`. Null clearing remains available to the
  existing owner-authorized local deletion RPC. Legitimate source check-ins and
  reward semantics are unchanged; AI-only updates still cannot mint rewards.

This trusts the protected backend credential and reviewed Next handler code, not
ordinary clients or unverifiable claims about a model's real-world correctness.
A stolen backend credential is outside that trust boundary and must never be
shipped to a browser. No real model call is used to test this architecture.

## Finding 2: Goal AI claimed evidence that was intentionally excluded

The check-in explanation now says that optional AI can discuss limited numeric
progress, timing and check-in patterns, not evaluate the exact goal or private
written evidence. Qualitative labels describe private reflection. The prompt
explicitly excludes exact goal, raw target values, units and reflections, uses
`goal_domain: other` rather than inferring an unknown subject, and requires
insufficient evidence when the numeric context cannot support a conclusion.
The allowlisted provider payload has not been expanded.

## Local candidate and rollout prerequisite

Per the review's explicit instruction, the unmerged **local-only candidate 0022**
was updated. No legacy migration was edited. A guarded reset of synthetic local
Docker data installs the revised candidate; hosted migration history remains
UNKNOWN and no hosted SQL was run. No table columns changed, so existing Drizzle
row interfaces remain valid; the internal server lease type was updated together
with its trusted request binding.

Before any separately approved hosted rollout, a valid existing server-only
Supabase backend credential must be confirmed through the normal secure deployment
process. Its hosted presence/validity has not been inspected or changed here.
If absent or invalid, AI must remain unavailable; do not restore authenticated
completion grants to make it work. Issue #18 remains a hard release blocker.

## Validation additions

- Application tests: ordinary mock client denies all three operations while the
  real server helper uses a distinct trusted client and verified owner; missing
  backend credential fails closed; focused truthful Goal UI/prompt assertions.
- Real local Auth/PostgREST: a consented owner cannot issue/check/finish any of the
  nine request domains even with a known valid permit, cannot forge direct AI
  rows or embedded Goal analysis, and can still read its preferences/history.
  Trusted backend completion succeeds. A separate test proves owner/domain/
  revision mismatch cannot consume or rebind a permit.
- Existing database race/revocation/history/deletion tests now exercise trusted
  completion, not an authenticated finish that would trivially be denied.
- The signed-in browser suite still exercises all actual Next routes with model
  HTTP intercepted at the boundary. It adds both-theme, five-width Goal scope
  screenshots and a server with a model key but **no backend credential** to
  prove unconfigured fail-closed behavior. No service credential enters the page.

Full rerun results and exact final CI/head proof are recorded in the validation
report and draft PR after completion. No merge/deployment is part of this work.
