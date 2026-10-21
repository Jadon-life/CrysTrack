# Issue #46 — synthetic server-guard Chromium evidence

Actual signed-in Chromium captures from `scripts/test-offline-guard.mjs`, using the
guarded disposable local Supabase database, synthetic accounts and no real financial
records. The existing Today interface is unchanged. Verified checklist state comes
from acknowledged server mutations; no offline indicators, queue or cache exists.
These are **not** disconnected/reconnected or offline-reload screenshots.

| Width | Dark physical theme | Light physical theme |
| --- | --- | --- |
| 375 | [Dark](server-guard-375-dark.jpg) | [Light](server-guard-375-light.jpg) |
| 430 | [Dark](server-guard-430-dark.jpg) | [Light](server-guard-430-light.jpg) |
| 768 | [Dark](server-guard-768-dark.jpg) | [Light](server-guard-768-light.jpg) |
| 1280 | [Dark](server-guard-1280-dark.jpg) | [Light](server-guard-1280-light.jpg) |
| 1440 | [Dark](server-guard-1440-dark.jpg) | [Light](server-guard-1440-light.jpg) |

The desktop dark and 375px light captures were visually inspected. The scenic
background, horizontal navigation, physical switch, Today layout and honest
unverified historical streak remain present. The harness asserts no page overflow
and uses keyboard Space to operate the physical theme switch in both states.

See [validation](../../piece8ap1-validation.md) and
[machine results](../../validation/issue46/server-guard-browser.json).
