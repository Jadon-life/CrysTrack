# Issue #10 migration inventory

## Issue #15 rehearsal correction (pending review)

At merged development SHA `c256fd473975cf7d90c2ff7a3eba8683c5f838a7`,
normal-mode HTTP checks reproduced timeouts for stale task/note revisions. A
minimal local PostgREST probe returned HTTP 409 immediately for `PT409`, while
`40001` timed out. The earlier SQL-only conflict tests did not cover that transport.

New additive `0014_daily_http_conflicts.sql` requires 0013 and replaces only eight
business-conflict SQLSTATEs in five function bodies with PostgREST's `PT409`.
Function signatures, ownership, ACLs, owner checks, locking, revisions, evidence,
receipt handling and all table/interface shapes remain unchanged. The local
runner inventories 0000–0005, 0013, then 0014; no legacy migration is edited.

**Release remains BLOCKED pending draft-PR review and renewed owner migration
approval.** Issue #13's 0013-only hosted plan must not be executed unchanged after
this fix. Its compatibility audit covered 0013, not this new patch. A future
authorized install must separately review 0014 and its exact function definitions,
then apply 0013 followed by 0014 under the same task-write barrier before any new
application traffic. Do not replay 0000–0012 against the existing hosted database.
No hosted migration or metadata query was run for this correction.

The inventory below records the original Issue #10 review; its remote-uncertainty
notes are historical, superseded where the owner supplied Issue #13 audit evidence.

Inventoried reachable local/remote branch heads before assigning the new number. Base: `9e7ff2653998517ff0e00b92476ae07c10e29dfa`. No hosted SQL, migration-history query, or private-row read was performed. Git files do not prove installed database state.

| Existing filename | Git blob | Present on upgrade base |
|---|---|---|
| `0000_initial.sql` | `468469ff9178196d721711722d47ad21537aa763` | Yes |
| `0001_product_integrity.sql` | `177aa12d3c0db27b911b60aa9b220ccec6d1bc08` | Yes |
| `0002_adaptive_experience.sql` | `643159e978a1e4c3639e49206c5979c33d8781f2` | Yes |
| `0003_wealth_intelligence.sql` | `f9ddff79c2a7a60e2506cd1675782e2cd45d91dc` | Yes |
| `0004_profile_avatar_storage.sql` | `9d6a53a0514900badeb2925b1fa872512a1745ef` | Yes |
| `0005_intelligence_layer.sql` | `f7b040da55037b528f9bab78132220e16afacab3` | Yes |
| `0006_goal_alignment.sql` | `faeb4015764652c74716b663df4363bfed7576cf` | No |
| `0007_academic_assignments.sql` | `2f70bae43fe1bc8a1371f300aced477998b74d37` | No |
| `0008_daily_rhythm.sql` | `76955144b07a4d652b034a4eff348c9d506f0307` | No |
| `0009_wealth_suite.sql` | `0185b254a210068ad5a843de99759783a881672b` | No |
| `0010_gamification.sql` | `b0701deeb3ba3ae97e70778dc6060d296ffb89dc` | No |
| `0011_preview_coach.sql` | `f3192afbaf49b866fab96835e57213dc73f00fbd` | No |
| `0012_september_compatibility.sql` | `2eb2788cc316acaea9e879086b68f0dbc143beda` | No |

All identical filenames have identical blobs across the inventoried heads. `git log --all --name-only` was also checked for historical SQL filenames. Numbers 0000–0012 are already occupied across branches; **0013_daily_records.sql** is the next unoccupied number in this repository inventory. This is not a claim that it is safe to apply to any hosted database.

## Dependency boundary

0013 depends only on 0000–0005. The local runner explicitly applies those six unchanged historical files plus 0013, recording content hashes in the separate `crystrack_local_control` ledger. It does not manufacture Supabase or Drizzle migration history. No October migration or 0012 finance compatibility migration is imported. The older `crystrack_daily_draft` experiment remains separate and is not authoritative application data.

## Known schema/type drift and remote uncertainty

- SQL 0002 already defines `skipped` and activity `task_skipped`; the TypeScript enums now match.
- SQL 0002 uses `timezone` plus `current_timezone`; both remain intact. New `scheduling_timezone` is a separate stable field, backed by an authoritative tracking state and explicit transition ledger. Automatic device/location updates cannot move a captured scheduling day. Finance keeps its existing timezone behavior.
- The prior Issue #8 audit establishes a live CrysTrack schema and shared Preview/Production binding metadata, but provides no reliable installed migration history or complete reviewed schema export. It does not prove 0013 compatibility. No remote-safe installation sequence can yet be certified.
- Review actual hosted metadata, table/column/function/trigger identities, grants, migration dependencies and modern task/gamification triggers in a separately authorized read-only review before any hosted installation. Resolve RLS-disabled repair backup tables separately.

## Inventoried refs

- `feat/crystrack-2-floating-workspace` — `3863438552812197aae3b907bb60de914b1e0547`
- `feat/piece-9-preview` — `bb17e31c1dc5919066fa1ff83533c0a23c89925c`
- `feat/piece2a-daily-streak-engine` — `dbad605486542f85a456737e2b59182e1c983858`
- `feat/piece2b-free-local-supabase` — `b293d0da369b842c05c3e2241c4aae794274708a`
- `feat/piece2c-durable-daily-records` — `9e7ff2653998517ff0e00b92476ae07c10e29dfa`
- `fix/september-28-database-compatibility` — `9040fc92c1cceb87bc3be9daa398b497cfe2e105`
- `main` — `cccdb56edb14463030a9ce9b2aed8fbcd07579a3`
- `restore/crystrack-september-28-2026` — `28de0d7c55c62c877131376f0cabeffa5c511fde`
- `work` — `7bd5fef8c0f93f03b3671506b86027705b26a80b`
- `origin/feat/crystrack-2-floating-workspace` — `3863438552812197aae3b907bb60de914b1e0547`
- `origin/feat/crystrack-premium-sep28` — `9e7ff2653998517ff0e00b92476ae07c10e29dfa`
- `origin/feat/piece-9-preview` — `bb17e31c1dc5919066fa1ff83533c0a23c89925c`
- `origin/feat/piece2a-daily-streak-engine` — `dbad605486542f85a456737e2b59182e1c983858`
- `origin/feat/piece2b-free-local-supabase` — `b293d0da369b842c05c3e2241c4aae794274708a`
- `origin/feat/september-28-ui-refinement` — `7c4e1d5345bfb9ef9a540e7176d18955b0243d27`
- `origin/feature/crystrack-adaptive-experience` — `ae14769299838ef467e9aa1e9ac311ae6ab777c9`
- `origin/fix/ci-react19-lint-20260928` — `83b83542f27e1ff700248fcdb359891fb461c472`
- `origin/fix/openrouter-ai-20260917` — `d9be5b5f4cb9d5968a060ea9905db0e1040e1d66`
- `origin/fix/overdue-delete-controls-20260824-013040` — `f762d8bf98ace7ad424add02656fbc1dab05574e`
- `origin/fix/september-28-database-compatibility` — `9040fc92c1cceb87bc3be9daa398b497cfe2e105`
- `origin/main` — `cccdb56edb14463030a9ce9b2aed8fbcd07579a3`
- `origin/restore/crystrack-september-28-2026` — `28de0d7c55c62c877131376f0cabeffa5c511fde`
