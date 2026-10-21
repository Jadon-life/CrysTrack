# September 28, 2026 recovery — preview only

Historical source: `83b83542f27e1ff700248fcdb359891fb461c472`, “Fix React 19 lint and CI runtime alignment”, September 28, 2026.

Recovery branch: `restore/crystrack-september-28-2026`, based directly on that commit. October's branch and PR remain separate. No main reset, force push, production promotion or database migration is authorized by this recovery.

The application code, public assets, styles, dependency manifest/lockfile, configuration and historical tests are unchanged. This recovery report is the only file added to the historical tree. An earlier empty marker commit also changed no files; documentation supplies a detectable file change for the existing preview integration.

## Existing authorized deployment target

Only `crystrackbeta`, project `prj_a77JAvxoEAUYLEjFPsSUWhApxmb7`, linked to `Jadon-life/CrysTrack`, root `crystrack`, is in scope. Vercel's GitHub integration metadata identifies that project and root. GitHub production deployment history corresponds to `main`; Vercel account-level production-branch/environment-variable settings were not directly accessible from this workspace. Do not modify these settings or production aliases.

Historical Vercel deployment `GS116NBtwL1Q91PcjkjaUrraXnDw` has a successful GitHub deployment record matching the exact historical SHA. Its historical URL is `https://crystrackbeta-9q2ne4jws-jadon-lifes-projects.vercel.app`. GitHub also records a historical Preview at `https://crystrackbeta-6d20fcmbj-jadon-lifes-projects.vercel.app` for the same SHA. A successful historical record does not establish present URL accessibility.

## Validation performed

- `npm ci`: passed using historical package-lock.json.
- `npm run check`: 73 tests passed; TypeScript and ESLint passed.
- `npm run build`: optimized production build passed.
- Ignored October `.next`/TypeScript cache was removed before the clean validation; no source fixes were needed.
- External browser harness renders the actual historical AppLayout, ThemeProvider, Today, Plan, Wealth and auth form with explicitly synthetic API/auth/weather fixtures. Both light and dark controls and fixture-backed preference requests work; no React runtime errors were observed. Desktop and mobile screenshots were captured. This is not a real Supabase authentication or transaction test.
- Local built-app smoke: Today, Plan, Wealth and Auth returned 200; unauthenticated Wealth API returned 401.

Screenshots, browser harness, logs and the database reproduction are stored outside the repository at `/workspace/recovery-artifacts/september-28-2026/`, so no test fixture code or screenshot data changes the recovered application.

## Database compatibility — production restoration blocked

No live database was changed or reset. Current Supabase migration history was not available through an administrative connection, so its actual schema is unverified.

A disposable PostgreSQL reproduction applied historical migrations 0000–0003 and the repository's October migration 0009. It demonstrated:

1. The September savings API inserts a money entry then calls `adjust_target`. October 0009 already updates the target in a trigger. A contribution of 100.00 produced a target balance of 200.00.
2. The September transfer flow omits destination-account data required by the newer guard and is rejected.
3. The older hard-delete operation is denied after 0009 revokes authenticated DELETE on money_entries.

Other October changes may also affect compatibility; this targeted reproduction does not certify every route. Do not use this recovery for financial writes against a database with the newer schema. Before production restoration or live write testing, use an isolated historically compatible Supabase project or separately review an explicit compatibility plan. Do not roll back or disable modern production safeguards.

## Verification limitations

Direct requests to the historical preview hosts are blocked by this cloud workspace's egress proxy (`Tunnel connection failed: 403 Forbidden`). Live visual comparison, real authentication, real API integrations and environment-variable correctness remain unverified until suitable network/test access exists. Report a new preview as deployed only after a successful crystrackbeta deployment record for its exact recovery SHA is available. No production deployment, alias, promotion or database rollback is part of this recovery.

The restored interface is the full-view September layout with horizontal glass navigation and its original theme/background behavior. It intentionally excludes October's floating application frame, sidebar, dashboard composition and newer feature code. No redesign or new application feature was introduced.
