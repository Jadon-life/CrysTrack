# CrysTrack Permanent Agent Guidelines (Refractive Glass & Interactive UI)

1. CrysTrack 2.0 uses a near-full-screen floating glass window (94vw, maximum 1800px; approximately 92dvh), a desktop sidebar that toggles between 240px expanded and 76px collapsed with a visible header control and a browser-persisted preference, an interior utility header, and an internal desktop content scroller. Keep the photograph visible on all four sides. Preserve Today, Plan, Tasks, Goals, Assignments, Calendar, Wealth, Insights, AI, Settings and History routes; adapt to a tablet rail and mobile drawer/natural page scrolling.
2. Use an interactive background canvas with ambient mesh/light waves, cursor response, and time-of-day hues. Retain existing background photos.
3. Use the shared CrysTrack 2.0 tokens in src/lib/theme.ts and src/app/workspace.css: layered translucent shell/sidebar/card surfaces, blur(20px) saturate(180%), subtle white reflections and borders. Blue is an interaction accent; avoid opaque blue container fills. Dense reading regions may have stronger translucent interiors. Display exact official light/dark logo assets and wordmarks without redrawing, recoloring or substituting a font-rendered wordmark. If original lockups are unavailable, request them and report branding as pending; the JPEG reference is not a transparent production asset. Add cursor spotlights, subtle tilt/glare, tactile keycap micro-physics (inset highlights, short spring feedback, and a 1px press depression), and gold completion particles.
4. Minimum body text 14px, secondary 12px. Use warm ivory #F6F1E4 and white with WCAG 2.2 contrast. All numbers, metrics, and timers use tabular-nums.
5. Use a centered translucent floating action dock for quick actions, focus timers, and interactive notifications.
6. Money is DECIMAL(12,2) in the database. Convert to integer kobo in src/lib/money.ts for arithmetic and back for display. Never calculate money using raw JS floats.
7. Schema/migration changes must update corresponding TypeScript interfaces in the same turn.
8. Add sequential RLS migrations from 0006 onwards; never edit legacy migrations. Declare secrets in .env.example. Never hardcode secrets.
9. Minimum 40px touch targets, visible focus, accessible labels, prefers-reduced-motion support. Date logic uses the user's saved timezone.
10. Every task concludes with npm run check and npm run build passing cleanly.

Work only on the assigned piece and preserve existing work. Do not apply migrations to live services or deploy without authorization.
