# Owner-held CrysTrack Free-plan backup & restore checkpoint

**Status: NOT PERFORMED.** This is a private, owner-operated process. It is NOT a release green light. Supabase project: `CrysTrack` / `yfzglhwjtpirbwhqatdx` / PostgreSQL 17.6 in eu-west-1. **Never replace, reset, delete or restore into this live source.** Existing CrysLearn must remain untouched.

Supabase documents [Free plan logical backups](https://supabase.com/docs/guides/platform/backups) and [manual backup/restore via CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). On Free, automatic daily backups and dashboard downloads aren't available. The connected ChatGPT Supabase tool can run read-only SQL but **cannot** produce a private logical dump or independently restore it. Only the owner can handle their DB password and encrypted backup.

## A. Owner capture on a private Windows laptop

1. Install the supported **Supabase CLI** and **Docker Desktop** from official sources and check `supabase --version`, `supabase db dump --help`. A successful CLI dump uses Docker images; ensure Docker is actually running. Use the exact project **CrysTrack**; never CrysLearn.
2. In [Supabase Dashboard](https://supabase.com/dashboard/project/yfzglhwjtpirbwhqatdx), choose **Connect** and copy the **Session pooler** database URL (preferred); the URL must contain the `postgres.yfzglhwjtpirbwhqatdx` account on the Supabase session pooler, port 5432, database `postgres`. If you have working IPv6, direct host `db.yfzglhwjtpirbwhqatdx.supabase.co` can be used instead. You will need the database password; do not place it in chat, terminal history, .env, screenshots or source files.
3. Ensure your Windows backup destination has BitLocker or equivalent encryption and is **outside OneDrive/Google Drive/Dropbox/Git repositories**. Start PowerShell **locally**, not GitHub Actions, and execute (from the `crystrack` application directory):

   ```powershell
   .\scripts\owner-private-backup.ps1 -ProjectRef yfzglhwjtpirbwhqatdx
   ```

   Respond to the exact confirmation phrase and paste the connection string only into the masked local prompt. The script refuses URLs that do not identify the CrysTrack project, uses Supabase's official CLI `db dump` role/schema/data sequence and writes files into a private time-stamped local directory. It never writes to the DB. If CLI/Docker/permissions fail, STOP. Do not circumvent its target identity checks.
4. Verify **all three files** `roles.sql`, `schema.sql`, `data.sql` and `capture-manifest.json` exist with nonzero sizes. The manifest contains SHA-256 digests, byte counts, capture time and flags `restoreVerified=false`; compute new SHA-256 on demand and compare before any restoration. Keep two owner-controlled encrypted copies in separate locations; do not upload dumps or their raw contents to GitHub, chats, CI artifacts or shared support systems.
5. As of the latest read-only inventory on 2026-10-21, **2 Storage file objects** are present; protect their actual object bytes separately. The SQL dump excludes actual Supabase Storage object bytes, Auth provider settings, project secrets, Vercel envs, email/Telegram/push provider states and other external credentials. Independently inventory and privately back up important Storage bucket objects (avatars/attachments), migrations/custom Auth/Storage schema modifications, and environment/configuration as applicable. Do not put credentials inside the backup manifest.

## B. Privately RESTORE before any live September SQL

A backup file that merely exists (even with a matching hash) is **not** a verified restore.

1. Build a genuinely **isolated disposable PostgreSQL 17/Supabase-compatible** destination under your exclusive control (for example, a separate no-production-traffic local Supabase stack with the necessary managed extensions, roles, schema and version). Ensure the destination has **no live Auth/API keys, no public ports, no webhooks/cron, no real email or push sends**. A generic empty PostgreSQL instance may fail to restore Supabase-specific extensions/objects; don't mark such failures successful. Do not restore into the source project.
2. Confirm **source vs destination identity twice**. The target must NOT be `yfzglhwjtpirbwhqatdx`, any `*.supabase.co` production host or a shared developer database. Use Supabase's [official restore sequence](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), with strict `ON_ERROR_STOP=1` and a single transaction where compatible, into that local destination **only**. Manual resolution of roles/managed extensions may be necessary and must be documented; never bypass errors by removing production RLS/security objects.
3. Recheck the restored schema, functions, triggers, policies, grants, owner references and nonidentifying counts against a **fresh read-only snapshot from the live source captured close to backup time**. Initial reference counts on 2026-10-21 (may have changed): 3 Auth users, 3 profiles, 16 recurring tasks, 81 task schedules, 408 task occurrences, 3 assignments, 3 goal check-ins, 2 XP events, zero money entries. Count mismatches are STOP conditions; never invent/fix missing rows.
4. Test a safely isolated, synthetic signed-in owner and a foreign owner: authorize a read only for their own data; deny cross-owner access. If clone Auth can't authenticate without the live encryption key, report **UNVERIFIED** rather than faking a passed auth test.
5. Measure a benign local-only restore, record the exact PostgreSQL/CLI versions, source/target DB identities, timestamps, count reconciliations, failed objects (if any), elapsed time and local encrypted SHA-256 manifests. Store that attestation **privately**. Tell ChatGPT only `capture PASS/FAIL`, `isolated restore PASS/FAIL`, `Storage backup PASS/FAIL`, and sanitized nonidentifying counts; do not disclose credentials, dump files or secret SQL content.

## C. Only when A and B pass

The managed PG17 six event hooks are **incompatible** with the current Issue #55 **local-only** maintenance SQL. Before installing 0013–0024, we still need a managed-host-compatible writer/cron/legacy-client isolation design, fresh catalog/finance checks, explicit approval for **each exact migration hash**, and bounded rollback/cutover plan. The database already contains task and history data. In-place source reset/overwriting is forbidden; do not run the old `0000`–`0012` bootstrap files on hosting.

Owner acceptance checklist:

- [ ] SQL role, schema and data captures successful; SHA-256 manifest saved privately and hashes verified
- [ ] Important Storage **object bytes** exported separately or explicitly verified absent
- [ ] Completely isolated owner-controlled compatible PG17/Supabase restoration succeeded **without** ignored errors
- [ ] Source/restored rows, roles, RLS, function/trigger signatures and owner isolation agree
- [ ] No public data, hosted Auth settings, webhook/cron delivery, email or money mutated
- [ ] Owner privately approves next **separate** managed-host safety procedure for 0013–0024

**Until checked, do not approve PR #73 into main or enable production traffic.** The Vercel Preview link is a **synthetic read-only demo**, not a real connected application.