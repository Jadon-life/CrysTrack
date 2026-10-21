# History accordion — September upgrade

User requirement: Month, then day, then activities. Do not show an endless list.

- The History page uses native keyboard-accessible nested disclosures. Both months and days are closed initially.
- Opening a month shows date rows. Opening a day shows the stored events and Completed/Missed/Skipped states.
- Existing September glass, original adaptive colors, main navigation, icons and status distinctions remain.
- Category selection filters at the read-only server query; records load in batches of 50 using a Load older activity button.
- The original /api/history array response is preserved for Today and other existing consumers.
- Task outcomes use their scheduled date; other items group by saved profile timezone, with device fallback. Invalid timestamps remain under an unknown date rather than disappearing.
- Errors are displayed instead of silently showing empty history.
- Source-level tests and pure date-grouping tests are included.
- Advanced date-range filters can be a later improvement. The hosted Supabase staging environment is unverified: no authenticated database mutation tests.
- No production merge, financial writes, migrations, or schema updates.
