# CrysTrack Permanent Agent Guidelines (Refractive Glass & Interactive UI)

1. Retain the floating top bar and primary routes: Today, Plan, Wealth, Insights, AI, Calendar.
2. Use an interactive background canvas with ambient mesh/light waves, cursor response, and time-of-day hues. Retain existing background photos.
3. Floating cards use layered refractive glass: blur(20px) saturate(180%), navy/black tints rgba(10,22,52,.55) to rgba(3,5,11,.70), and hairline gold/white gradient borders. Add cursor spotlights, subtle tilt/glare, tactile keycap micro-physics (inset highlights, short spring feedback, and a 1px press depression), and gold completion particles.
4. Minimum body text 14px, secondary 12px. Use warm ivory #F6F1E4 and white with WCAG 2.2 contrast. All numbers, metrics, and timers use tabular-nums.
5. Use a centered translucent floating action dock for quick actions, focus timers, and interactive notifications.
6. Money is DECIMAL(12,2) in the database. Convert to integer kobo in src/lib/money.ts for arithmetic and back for display. Never calculate money using raw JS floats.
7. Schema/migration changes must update corresponding TypeScript interfaces in the same turn.
8. Add sequential RLS migrations from 0006 onwards; never edit legacy migrations. Declare secrets in .env.example. Never hardcode secrets.
9. Minimum 40px touch targets, visible focus, accessible labels, prefers-reduced-motion support. Date logic uses the user's saved timezone.
10. Every task concludes with npm run check and npm run build passing cleanly.

Work only on the assigned piece and preserve existing work. Do not apply migrations to live services or deploy without authorization.
