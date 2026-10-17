# Piece 8 — gentle progress and streak protection

## Verified rewards

Migration `0010_gamification.sql` adds a protected, owner-readable reward ledger. Authenticated clients cannot insert, update or delete reward rows and cannot call its private trigger function. Triggers observe authoritative task occurrences, goal check-ins, money entries, ritual rows and assignments. The ledger does not trust `activity_events`, posted XP, client clocks, claimed freezes or badge IDs.

Rewards begin with verified actions after migration installation. Existing completed assignments and current savings allocations can satisfy cabinet milestones; historical records are not assigned invented XP. Task catch-up completions can earn XP today; future task occurrences cannot. Every earning date comes from the database clock and the user's saved timezone. Existing earning dates remain fixed when a timezone setting changes.

| Verified action | XP | Daily XP limit |
| --- | ---: | ---: |
| Routine completion | 10 | 20 completions |
| Goal check-in | 15 | 10 check-ins |
| Expense log | 5 | 5 logs |
| Morning Plan | 20 | 1 |
| Evening Wrap-up | 20 | 1 |
| Weekly Review | 30 | 1 |
| Assignment completion, including late work | 25 | 10 |

Expense amounts do not affect XP. Automatic Spend & Save children, transfers, failed writes and future-dated task occurrences earn none. Stable action keys prevent duplicate rewards. Undo/removal revokes the source's XP; restoring or recreating the same occurrence keeps the original reward identity and earning date. Pure edits to already completed sources do not mint XP. Daily caps constrain repeated creation of new actions. These rewards recognize recorded actions; they do not claim that a manual expense was verified by a bank.

Level N begins at `50 × (N − 1) × N` XP. Level 1 starts at 0, level 2 at 100, level 3 at 300. Progress is the integer percentage through the current level.

## Forgiving streaks

A rhythm counts actual active days since its last unprotected gap. Today remains open until local midnight. A single absent day receives automatic Never Miss Twice grace: return the following day and the rhythm continues. Further absent days each consume one banked freeze. If protection runs out, only the current rhythm restarts; total XP and historical records remain.

Seven actual consecutive active days earn one freeze, with at most three banked. Grace and frozen days do not count as active days or toward new freezes. A gap interrupts the consecutive-active earning counter. The replay is deterministic from private verified reward dates, so refreshes and repeat requests cannot spend a freeze twice or claim another freeze. Undoing the only verified action for a day can change its streak eligibility; replay reflects that correction.

## Cabinet, avatar and quiet mode

Insights contains 26 translucent badge cards across Life Areas, Wealth Milestones and Academic Consistency. Locked icons remain glass silhouettes while their descriptions stay readable. Unlocked cards gain gold/iridescent outlines, pointer spotlights and shared 3D tilt. Savings criteria use integer kobo; late assignments count toward academic completion badges. Removing the supporting evidence can relock a badge. Notifications only announce newly observed unlocks, not the initial shelf, and do not repeat for a badge already seen in the current session.

The floating navigation avatar has a gold XP ring and accessible level/XP text. Today has an empathetic streak panel. Settings → Appearance → **Hide Gamification Elements** suppresses the ring, level text, streak panel, cabinet and badge notifications immediately, persists the preference server-side, and rolls back a failed preference save. Normal task reminders remain available. Progress records continue privately; the setting changes presentation. The UI waits for verified server data before showing rewards.

The Today request supplies shared progress state; no XP endpoint accepts client awards. Existing cached dashboard data is refreshed after actions and preference saves. Existing assignments, targets and ledger data are reused for badge calculations. If migration 0010 is not yet installed, progress extras stay hidden and the core dashboard remains usable.

## Mandatory glass audit

Shared cards already had blur(20px)/saturate(180%), pointer spotlights, tilt/glare, tabular numerals, reduced motion and a single cursor-responsive time-of-day canvas above the retained photos. Legacy navigation CSS still used blur(25px)/saturate(154%) and an overly strong tint. Piece 8 restores the required translucent navy/black glass in the navigation and popovers. Small-screen theme controls move into the existing mobile menu to preserve 40px targets and space for the avatar ring. Primary routes and floating navigation remain intact.

## Database and verification

Apply only the new sequential `0010_gamification.sql` after confirmed migrations 0000–0009. No earlier migration changes and no new secrets are required. No live migration or deployment is performed by the development tests.

Run `npm run check`, `npm run build` and `npm run test:gamification:db`. The database suite uses a fresh, network-isolated PostgreSQL container, applies baseline migrations and migration 0010 twice, and checks replay protection, ownership, revoked writes, quiet preferences, expenses, check-ins, rituals and late assignments. Unit tests cover XP formulas, caps, level boundaries, grace, bank limits, freeze consumption, DST/year transitions and badge thresholds.
