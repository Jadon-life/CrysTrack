# Issue #18 — local preparation, release still blocked

Reviewed source: `feat/crystrack-premium-sep28` at `d1519e59f8b06177b0ba68074a1b7e8621fc7f39` before this PR. The local candidate files are `0013` through `0024`; historical `0000`–`0005` are bootstrap fixtures, **not** a proposed hosted replay. The prior hosted read-only review in Issue #18 covered only `0013`/`0014`. Its PostgreSQL 17.6 observations are historical evidence, not a current catalog check. This PR performs no hosted inspection.

## Migration dependency and change inventory

| File | Required predecessor / principal effect | Release-sensitive check |
|---|---|---|
| 0013 daily records | Legacy tables/auth/storage from 0000–0005; seven owner-scoped daily tables, state/timezone, frozen snapshots, occurrence/direct-write guards and owner RPCs | Existing occurrence and gamification trigger order, legacy rows/timezones, RLS, task maintenance |
| 0014 HTTP conflicts | 0013 exact function signatures; five `CREATE OR REPLACE` definitions convert retry-prone 40001 conflicts to PT409 | Final body/owner/ACL and actual managed PostgREST HTTP 409 |
| 0015 Crystal Shards | 0013 daily facts plus legacy goals/assignments/ledger; awards/events/preferences and source triggers | No old XP import, no duplicated or unearned rewards; owner locks and private award DML |
| 0016 assignments | Existing assignment/reminder tables, 0015 reward trigger; revision, lifecycle, reminder RPCs | Old assignment writers, owner scope, service-only delivery RPCs |
| 0017 Week Grid | 0013 daily snapshots/timezones | Read-only owner pagination, no invented history |
| 0018 monthly budgets | Existing money ledger and timezone state; budget rows/request receipts and exact NGN math | No ledger rewrite; stale writers, decimal values and owner RLS |
| 0019 recurring bills | 0018 budget/ledger context; bill rows, occurrence/payment permit, ledger provenance trigger, service reminder RPCs | Explicit idempotent payment only; old finance writers and outbound reminder isolation |
| 0020 CSV statements | 0015 shard function and 0019 bill provenance; CSV batches/rows, ledger provenance trigger, protected import/export RPCs, **replaces** `crystrack_sep28_crystals.ordinary_source()` | No imported shard award, no bill/CSV identity laundering, exact kobo and duplicate prevention |
| 0021 exact Overview | 0018 timezone, 0019 bill, 0020 CSV sources; read authority with full numeric aggregation | Existing ledger anomalies must fail closed; performance/limits on real data UNKNOWN |
| 0022 AI consent | Existing AI/goals tables; default-off consent, trusted request permit/finish, protected results | Service credential/role claim, no direct client forging, no AI request before consent |
| 0023 offline replay | 0013/0014 owner/revision/receipt machinery; atomic offline-only replay and read-only receipt resolution | Archive/delete races, current owner/day/timezone/definition and no double reward |
| 0024 private export | All included tables; 0022 current trusted AI provenance; owner snapshot and narrow AI helper | Per-owner coverage, exact values, size limits, no secrets, consent/revocation checks |

Each file is a local candidate. File presence and local hash agreement prove neither hosted numbering nor hosted compatibility. Do not run `0000`–`0012` on populated hosting; the known hosted migration ledger was empty at the earlier narrow review. A fresh independent hosted catalog/data preflight must determine the actual state before any separately approved SQL.

## Local proof and remaining gaps

The fixed local sandbox rebuilds the migration sequence in order, records SHA-256 in its **separate local ledger**, and tests synthetic application operations. `scripts/rehearse-release-readiness.mjs` checks every candidate hash, 25 new RLS tables, 23 public RPC access contracts (authenticated versus service-only), eight protected triggers and revoked direct occurrence/AI message writes. Its output contains no user rows or credentials. The separate `task-release-barrier` harness tests legacy SQL/REST and old route adapters, service-role writes, held and stale requests, failure injection during 0013 and 0020 (including the shard function replacement), gate integrity, freeze/unfreeze, and post-unfreeze owner smoke. Evidence and exact outcomes are in `docs/validation/issue18/`.

**The local barrier is only a candidate.** Its preflight rejects unexpected event triggers, while the earlier hosted review observed six managed event triggers. It cannot be pasted onto managed hosting unchanged. It deliberately permits finance writes, so it is **not** a complete app-wide freeze for 0018–0021; independent ingress, old-version and worker isolation is required. Table locks drain database transactions but not every multi-step old HTTP handler; a handler can commit a first step before the gate, then fail its next step. Already-reserved external notifications cannot be recalled. Local PG 15.8 does not establish managed PG 17 behavior or production performance. Current aliases, immutable deployment URLs, cron invokers, old workers, direct REST clients, Preview state and exact production artifact are not independently verified. No live backup or restoration has been performed. These are release blockers, not testing footnotes.

The locally tested finance invariants are exact NGN/kobo storage, unchanged historical records, unique bill payment/import provenance, no automated bill deduction, no CSV-earned shards, stable source accounting and owner-only reads/writes. The local AI checks protect backend-only request completion and current consent; actual provider credentials/retention remain unknown. The local offline tests protect one receipt/requestId and revision under concurrency; physical mobile support and old deployed versions remain unknown. The account JSON export has explicit limits and exclusions and **is not a database backup**.

| Gate | Local evidence | Missing hosted evidence / required action |
|---|---|---|
| Schema and migration numbering | Fixed 0013–0024 files applied in local PG15; hashes in `validation/issue18/local-catalog.json` | Fresh authorized PG17 catalog, ledger, object/overload, extension and event-trigger review; stop on collision |
| RLS, grants and owner scope | Local catalog and signed JWT integration probes; service-only AI/reminder grants | Managed role membership, BYPASSRLS, function owners/search paths and PostgREST behavior on the real project |
| Financial/reward provenance | Local bill/CSV/overview/crystal suites and failed-0020 rollback | Read-only checks of historical data and anomalies; isolate every old finance writer before migration |
| Offline and AI | Local replay/consent/security suites | Exact deployed clients, backend credential validity and real provider behavior; no user exposure before dependencies |
| Maintenance and stale clients | Synthetic old routes, direct REST, held transactions, cron/API 503 and 0013/0020 fault injection | Managed event-trigger compatible gate plus all immutable URLs, old workers, direct REST and outbound queue isolation |
| Backup and recovery | Synthetic rollback tests only | Owner-held real backup, privately verified restore, known-good artifact and tested recovery duration |
| Cutover | Normal local build and synthetic Preview safety | Owner-authorized actual artifact/alias, smoke isolation, explicit approvals and observation plan |

## Owner-held backup and restoration gate (not performed)

The owner must authorize and privately perform a full logical backup covering roles, schema, data, extensions, policies, triggers, functions and storage metadata as appropriate for the actual managed service. Record privately: target project/database identity, UTC capture time, PostgreSQL/tool versions, backup scope, encrypted storage location, key custody, SHA-256, size, retention and exact prior deployment identifier. Keep dumps, keys and private records out of issues, chat, PRs and repository.

Before cutover, restore that backup into a **separately isolated, owner-controlled environment**. Confirm tool compatibility, full schema/roles/grants/RLS, counts and non-identifying aggregate checks, trigger/function ownership, application Auth/REST behavior and a test of the actual recovery procedure. Verify storage and external integrations independently; a database dump alone may not contain stored avatar objects or provider state. Record private restore evidence and restore duration; disclose only a sanitized pass/fail attestation and artifact/checksum references to reviewers. If a usable backup or verified restoration is absent, **STOP**. The Issue #44 account export cannot satisfy this gate.

- [ ] Owner confirms exact source database identity, scope and capture time privately.
- [ ] Owner verifies encrypted backup integrity, checksum, key custody and retention.
- [ ] Owner restores to an isolated destination with no production traffic or shared credentials.
- [ ] Restored roles, extensions, RLS, grants, triggers, functions and migration history are compared to the source metadata.
- [ ] Counts and non-identifying finance/reward/daily aggregates reconcile; no private rows are published.
- [ ] Auth/REST and a bounded recovery operation work on the isolated restore; recovery duration is recorded.
- [ ] Owner records a sanitized restore attestation and separately approves any later live use of that backup.

## Proposed future sequence — every live phase requires separate approval

1. Owner identifies the exact hosted project, current alias/deployment SHA, all legacy immutable URLs, cron/worker/service-role/direct REST writers, Supabase migration/catalog state, managed PG 17 privileges and six event triggers. Recheck legacy-data aggregates including finance provenance and current API/role ACLs. Stop on collision, unexpected trigger, privilege or invalid legacy data; do not massage real rows to pass.
2. Owner authorizes a private backup **and verifies a restore**; independently record known-good artifact and SQL hashes. Stop if either fails.
3. Separately approve a reviewed, managed-PG17-compatible maintenance mechanism and **all-artifact ingress/worker/outbound isolation**. Pause scheduled dispatch, drain in-flight work and verify stale tabs, old URLs, service-role/direct REST routes and cross-boundary writes cannot proceed. The existing local barrier is not a deployable hosted script. Stop if isolation cannot be demonstrated.
4. With the gate active, repeat authorized read-only preflight immediately before DDL. Obtain a separate approval for the **exact** 0013→0024 file set and hashes. Apply one numbered migration at a time with a durable progress record; stop after any failure or mismatch. No automatic retry, blanket rollback, reset, grant weakening or overwrite of unknown objects.
5. Verify each step before the next: objects, RLS, policies, grants, owners, trigger states, rewards, ledger/provenance constraints and read contracts. In particular check 0014 HTTP conflicts, 0020 shard-function replacement, 0022 backend-only permits, 0023 atomic receipts and 0024 owner/AI consent. Keep old application ingress isolated while migrations are only partly installed.
6. Separately approve the exact normal-mode artifact and operational cutover. Mutating owner smoke is possible **only after** DB gate removal and while independently proved ingress isolation still excludes ordinary and old clients. Test one bounded synthetic owner for Auth, task/reward/receipt, finance, AI consent, offline replay and export; do not create misleading historical data. If that isolation cannot be proved, STOP rather than add a privileged smoke bypass.
7. Only after explicit acceptance, admit ordinary traffic, restart cron/notification workers and observe errors/queues/financial and reward invariants. Keep Preview disabled unless separately authorized.

## Failure and recovery conditions

For DDL error, wrong object identity, ACL/RLS drift, data anomaly, lock timeout, missing backup, unknown writer, stale app exposure, failed owner smoke or provider/credential mismatch: keep ingress and task writes isolated, record the exact last successful step and sanitize evidence. A partially installed sequence is **not** rolled back by deploying old code; later migrations may have modified data contracts. Prefer an independently reviewed, data-preserving forward repair. Restoration from the owner-held backup would revert post-backup user writes and is a separate destructive decision requiring its own approval and impact review. Never drop tables, reset hosted data, revive old occurrence grants or disable RLS as a shortcut. If the old artifact is incompatible with installed SQL, retain isolation until a reviewed compatibility path exists.

**Decision: BLOCKED.** Local synthetic rehearsal is preparation, not release authorization. Separate owner approvals are required for hosted read-only preflight, private backup/restore, maintenance/worker isolation, exact migrations, artifact deployment, bounded production smoke, and reopening traffic. No production smoke or live action is part of this PR.
