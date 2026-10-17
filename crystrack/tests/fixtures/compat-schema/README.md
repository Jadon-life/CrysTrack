# Compatibility schema snapshots

SQL files 0006–0010 are unmodified snapshots from commit `3863438552812197aae3b907bb60de914b1e0547`. `manifest.json` records their SHA-256 hashes. They live outside `src/db/migrations` so restoring September does not silently add them to an application migration run.

The disposable integration suite applies historical 0000–0005, these snapshots, then the additive 0012 compatibility functions. It emulates Supabase auth/storage plumbing locally, enables the original RLS, and uses isolated authenticated roles. It does not connect to Supabase or read DATABASE_URL. Preview-coach 0011 is unrelated and is not required.

Do not treat these snapshots as evidence of installed live migration history. Inspect an isolated target before enabling writes. Never apply or roll back production migrations as part of this preview task.
