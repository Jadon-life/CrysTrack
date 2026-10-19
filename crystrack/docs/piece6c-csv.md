# Piece 6C — decisions before implementation

Issue #31 including both provenance/handoff comments is authoritative. Verified
remote dev `a0637c43be62673962437c40f2ddd1649821e2eb` and post-merge CI
39290869797 SUCCESS before creating `feat/piece6c-wealth-csv` from FETCH_HEAD.
No main fetched/imported. No AGENTS.md present. Reuse the existing guarded free
Docker/local setup; no new service, credential or reusable configuration needed.

## Bounded review and atomic import

UTF-8/BOM CSV only, 1 MiB, at most 500 data rows and 40 columns, 2,000 characters
per field. Comma/semicolon/tab/pipe explicitly detected/selected. Real quoted
multiline parsing, strict structure, indexed column mapping. Signed amount or
separate positive Debit/Credit with one nonzero side. Positive amounts with an
explicit Income/Expense column are supported; transfers/savings are not inferred.
Exact decimal text/integer kobo; no currency conversion. Unsupported currencies,
negative zero, exponents, malformed grouping/precision and future entries fail.
ISO dates or explicit DMY/MDY convention. Date-only means saved-zone midnight
(exact bank payment time unknown); offset timestamps retain their instant.
Nonexistent local dates fail. Balance columns never become transactions.

Browser parsing/correction/exclusion is local. Server review receives only
selected normalized rows, never raw files or file paths, and performs zero
record writes. Review shows every row through bounded paging; selection is opt-in.
A read-only server review token pins exact selected data, saved zone/day and
matching ledger evidence. All money writes share an owner advisory lock with
CSV review/import so a competing legacy finance write invalidates stale review.
Confirm requires explicit user action and one bounded all-or-nothing transaction.
No chunked partial imports. Failed transactions leave no batch, source or award.

## Provenance, dedup and retries

Stable user-supplied lowercase source key identifies a statement account (do not
rename it to bypass duplicate checks). SHA-256 raw-file identity is calculated
locally; it is a dedup key, not a bank-authenticity claim. Source/file/logical-row
identity remains protected across corrections/retries; distinct identical lines
remain distinct. Trimmed ASCII transaction references are case-insensitive and
unique per owner/source, independent of description. Reference-less rows get
fuzzy date/type/amount/description warnings; fuzzy matches are never silently
removed, including matches against bill payments. Keeping a warning requires
explicit per-row acknowledgement. Renamed/reformatted files without references
cannot be proven identical: require review, never claim universal bank dedup.

One client batch UUID + immutable payload hash/receipt handles double clicks,
lost responses and competing tabs. Only the batch UUID and owner identity may be
saved in sessionStorage for refresh recovery; never CSV contents or statement
rows. After refresh recover receipt or explicitly say not confirmed and reselect
file. Exact file-row/reference guards prevent the same rows being written again.
Imported money and source facts are immutable, like bill payments: corrections
must happen before confirmation. No undo, invented reversal or refund; later
correction requires a deliberate separate legitimate ledger record. No change to
old money, targets, debts, expected flows or bill statuses; new actual income/
expense affects existing calculations and exact monthly budgets normally.

0015's spending guard currently knows debt/expected/parent/bill origins only.
0020 will replace that function with the approved identical body plus CSV-origin
exclusions, without editing 0015. A private single-use entry permit and immutable
origin pair prevent forged/cleared CSV provenance and reward backfill. Manual
spending still earns its original 5 shards; imports never do. 0019 is untouched.
Only one generic count-only finance activity per batch; no bank descriptions,
references or accounts in activity, toast, URL, logs or AI context. Unused descriptions are removed from the AI ledger query; references/accounts/notes
never enter that context. Existing aggregate/category-only AI financial metrics
and authorized ledger/export remain complete within their documented scopes.

## Export and privacy

Owner-only, saved-zone inclusive date interval, up to 366 calendar days and
10,000 entries; complete single database snapshot (not /api/wealth's 2,000 cap).
Over-limit or unclassifiable history explicitly fails before CSV bytes are sent.
Exact NUMERIC strings, ISO instants, canonical NGN, flow kind, category/source,
optional notes and provenance identity. UTF-8 BOM, comma/CRLF, RFC quotes and
spreadsheet-formula neutralization in every untrusted text field. Notes omitted
by default; max 4,096 UTF-8 bytes each and 8 MiB DB payload/4 MiB CSV response,
otherwise narrow the interval. Filenames contain only validated dates. Ledger
exports are archival, not new bank statements; identify and reject reimport of
CrysTrack entry IDs/origins to avoid double accounting.

CSV tools live in a deliberate Wealth view; approved September scenes, palette,
horizontal navbar, physical switch and default Overview stay intact. Synthetic
Preview has fictional read-only tools and denies all new writer/export endpoints
before credentials. No actual statements or external upload/AI categorization.

Only new SQL: additive 0020 candidate after 0019, disposable local only. All new
tables RLS-enabled, owner SELECT/strict RPC grants, no raw client DML/private
permits. Hosted numbering/compatibility/recovery remain UNKNOWN, #18 blocks
release. No hosted migrations, Vercel/Preview activation, deployment, main,
merge, paid services or actual finance access. Draft dev PR + complete pushed
source/fixtures/tests/screenshots/evidence, exact SHA and green CI before review.
