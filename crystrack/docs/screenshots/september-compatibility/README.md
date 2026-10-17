# September compatibility screenshots

Actual Chromium captures of the September components and original CSS/theme provider, with explicit synthetic local API/auth/weather fixtures. No real user data is shown or written to Supabase. Backgrounds still follow the historical adaptive clock, so an image may differ from an earlier capture taken in a different time slot.

- Today: `today-dark.jpg`, `today-light.jpg`
- Plan: `plan-dark.jpg`, `plan-light.jpg`
- Wealth: `finance-dark.jpg`, `finance-light.jpg`
- Permitted modal-only deviation: `transfer-controls.jpg`
- Mobile: `today-mobile.jpg`, `auth-mobile.jpg`

The browser regression exercises both themes, native validation for missing account choices, exclusion of the source account from destination options, and exact decimal string submission. Original compact currency notation, navigation, background renderer, typography and page composition are retained. Byte-for-byte historical source assertions supplement visual review.

Run `npm run test:september:browser` with the cloud's Playwright/Chromium tooling. This is fixture validation, not proof of hosted authentication or live database compatibility.
