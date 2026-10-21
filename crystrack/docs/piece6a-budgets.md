# Piece 6A monthly budgets — decisions before implementation

Issue #29 is authoritative. Exact remote dev head `2594fb68b039746d7d558a2bc9ae7c1a48482b1b`
and green post-merge CI 39260462483 were verified. The checkout was fast-forwarded
to that exact fetched commit before source edits (the cached remote-tracking ref
was stale). No main source was fetched/imported. No AGENTS.md or original
crystrack-final-prompt.md was found. Existing local setup is reused unchanged.

- Add Overview / Budgets within Wealth, retaining default Overview and existing
  money workflows, scenic glass, horizontal nav and physical switch. No bills or
  import/export, no Issues #30/#31.
- Candidate 0018 adds namespaced monthly category limits and private idempotency
  receipts, not ledger columns/triggers. Owner/month/category is unique; canonical
  NGN NUMERIC(12,2), positive limit, revisions and owner-locked RPC-only mutations.
  Remove marks the limit inactive, preserving a revision tombstone for retry/race
  safety; it never deletes transactions or releases savings. No budget rewards.
- Writes are current saved-zone calendar month only. Read current + 12 previous
  months; no fabricated past/future targets. Retain actual creation/update/removal
  timestamps. A limit covers the full selected month, including earlier expenses;
  its creation timestamp makes clear when it was actually set. Past limits are
  read-only. No automatic carry-over/backfill. Changed saved timezone is applied
  to the complete month on the next read; expected timezone/month prevents a stale
  editor writing against a changed boundary. No daily_context call or task closure.
- Aggregate all persisted owner expense rows on the server, without the existing
  2,000-row cap. Classification: exact flow_kind='expense', legacy type='expense'
  only when flow_kind IS NULL. Savings, releases, income, transfer, debt movement
  and pending expected rows are excluded. A confirmed expected expense counts
  exactly once as its actual ledger row; no joins multiply linked rows. Empty or
  unrecognized legacy category maps to Other, without editing its source. An
  expense categorised Savings remains spending; flow_kind=saving does not.
- The approved schema has hard deletion, no deleted_at/currency column on money
  entries. Only surviving ledger rows count; no synthetic soft-delete semantics
  or currency reassignment is invented. Invalid actual expense amounts/dates
  fail unavailable rather than silently understating spend. Canonical amounts
  and aggregate totals are NUMERIC decimal text; new client arithmetic uses BigInt
  kobo exclusively. USD is indicative display only via the existing provider.
- Budget reads and writes never mutate finance, daily facts, activity or crystal
  ledger. Existing Wealth summaries use legacy Number arithmetic and a capped
  read; leave those unchanged in this scoped PR and never use them as budget
  authority. Snapshot their outputs plus savings/debt/expected/reward/streak state
  around budget mutations in local tests.
- Refresh on writes, tab focus/visibility, activity, explicit refresh and saved-zone
  midnight. Remove stale data on unavailable reads; no optimistic invented zero.
  Lost writes retain exact request UUID, payload and revision for explicit retry;
  conflicts require reread/review. Unmount private view on account change.
- Owner SELECT RLS with no direct authenticated DML; private receipts deny all
  application roles. SECURITY DEFINER RPCs check auth.uid, empty search_path,
  strict fields/categories, request-id reuse and expected revision. Local-only
  tests cover JWT/ACL/RLS and >2,000 rows. No hosted schema queries or migrations.

Issue #18 remains unresolved. Hosted migration history, candidate numbering,
compatibility, backups and coordinated rollout are UNKNOWN; no release is authorized.
