# CrysTrack account information — crystrack-account/v1

This is a scoped portability document, not an automatically restorable backup.
Downloading neither deletes records nor erases provider copies. No restore/import
or account-deletion feature is included.

Settings → Privacy & Data → Your data → Export my data offers explicit category
selection, an informational count review and a sensitive-file confirmation. AI
conversations are unchecked by default and cannot be selected without current
consent. Selected user-written notes and chat may be sensitive; files are not
encrypted and must be stored privately. No archive content goes to analytics,
third-party storage, external models, console logs or GitHub evidence.

## UTF-8 JSON document

- `manifest.version`: `crystrack-account/v1`.
- `createdAt`: UTC export-assembly time; `snapshotAt`: PostgreSQL statement time.
- `owner`: verified authenticated UUID; never supplied in an export request.
- `savedTimezone`: authoritative saved scheduling zone, or null if none is stored.
  Each daily header/transition and financial source retains its original zone.
- `currency`: NGN. Monetary and numeric progress/bigint fields are decimal strings,
  never formatted whole-naira summaries, approximate values or JS float sums.
  `"0.01"` naira is exactly one kobo. Original timestamptz instants and microseconds
  are serialized in UTC; original input offset spellings are not stored by PG.
- `categories`, `unselectedCategories`, `categoryRows`: selected scopes and counts.
- `datasets`: each source table has exact row count, UTF-8 byte length and SHA-256
  of `JSON.stringify(data[table])`, without an added newline.
- `provenance`, `projectionSha256`: owner-scoped PostgreSQL source and SHA-256 of
  the exact v1 field registry's JSON serialization. The explicit field lists are
  [catalog.json](../src/lib/account-export/catalog.json); see the
  [coverage matrix](piece8b-export-coverage.md) for exclusions and reasons.
- `completeWithinDeclaredScope: true`: every row of the selected projected sources
  is present at one statement snapshot. It does not assert all account data or
  complete historical evidence. Open/incomplete daily records keep their labels;
  no missing days, deleted records, streaks or levels are fabricated.
- `restorableBackup: false`, `exclusions`: permanent limitations, not an all-data claim.
- `aiRevision`: current consent revision when AI was selected, otherwise null.
- `manifestSha256`: SHA-256 of `JSON.stringify(manifest)` with the emitted key order.
- `data`: named table arrays; archived/inactive and older rows are retained within
  their declared source scope. Empty arrays mean a successful zero-row snapshot.

Checksums detect accidental corruption and incomplete downloads. They are not a
signature proving an edited archive came from CrysTrack. No companion CSV/text
with spreadsheet formulas is emitted; existing Wealth CSV is unchanged.

## Consistency and practical limits

One STABLE, authenticated RLS RPC reads one PostgreSQL MVCC statement snapshot.
It counts/project-measures each source before collecting internal 250-row pages.
Maximum 10,000 rows per dataset, 25,000 total, 8 MiB projected payload and 12 MiB
complete document. Exceeding any limit fails the entire scope, never a truncated
success. Select fewer categories when a combined scope is too large. A single
dataset exceeding a limit cannot currently be exported by date partition; this
is an explicit limitation, not a fallback to recent rows.

The server has a 20-second read deadline and constructs the complete verified
response before attachment headers. The browser has a 25-second deadline, bounded
receipt, owner/consent rechecks and manifest validation before offering the file.
Cancel, offline/401, malformed data, source error, oversized scope or incomplete
stream offers no file. Network compression is not mistaken for uncompressed file
length. Downloads already deliberately saved cannot be retracted; consent/deletion
is checked at the snapshot and again before release/save.

Cross-owner direct links fail closed. Legacy children without a provable parent
owner and unproven/older AI messages are excluded as documented. Legitimate frozen
routine keys survive live-routine deletion. A malformed/dangling financial link
can block its selected category; this PR does not repair or mutate that history.

No IndexedDB/device queue, local preferences, unsynchronized intents, auth/push/
Telegram secret, raw provider prompt, lease or original bank file is included.
All hosted rollout remains blocked by Issue #18. Only local candidate 0024 is added;
no production schema compatibility or hosted application is asserted.

The v1 [column type registry](../src/lib/account-export/column-types.json) documents
native date versus timestamp fields and scalar types. Validation uses these
explicit types, not a field-name guess: for example, bill `end_date` remains a
calendar date, whereas routine schedule bounds retain ISO timestamp offsets.
Unknown/malformed projected types and orphan AI/frozen-daily relationships fail
before a file is offered. This does not rewrite or repair stored values.
