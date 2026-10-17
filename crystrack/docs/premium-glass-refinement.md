# Piece 1 — Preview candidate: calibrated September glass

## Preserved

- The original September 28 full-screen scenic design, navigation, card layout and adaptive palette. No gold-only rebrand.
- All finance API, data storage, database schemas and migrations.
- Previously approved eight-page content refinements.

## Implemented in this pass

- New small refinement CSS layer loaded after the existing legacy cascade for easy rollback.
- A more transparent tint, slightly stronger blur and restrained reflective edge for standard glass cards.
- Stronger shielding on substantial and calendar panels to prioritize legible numbers.
- Small hover lift on pointer devices only; system and app reduced-motion preferences disable it.
- Fallback solid navy for reduce-transparency and for browsers without backdrop-filter.
- Two guardrail tests to check stylesheet wiring and presence of fallbacks.

## Remaining before Piece 1 is complete

- Visually compare bright/daytime and night backgrounds, desktop and mobile, and all five time phases.
- Check contrast in the actual browser; stylesheet-source tests are not visual accessibility certification.
- Audit undersized labels below 12px, icon-only controls and exceptions to shared glass surfaces.
- Consider CSS consolidation only after the visual candidate has been accepted.
- Database isolation audit returned UNKNOWN. Do not write financial data against any unverified preview database.

**No production merge, no Supabase changes, no financial writes.**

## Second pass — typography and focus

- Raised explicit text sizes of 9–11px to 12px in all eight polished pages, plus Wealth, AI, Settings, the AI insight card and both navigation components.
- Raised selected legacy-CSS navigation, reminder badge, currency switch and ceremony captions to 12px through the final stylesheet.
- Named profile, weather and mobile-menu icon buttons for assistive technology.
- Added visible keyboard focus for navigation and common glass controls.
- Intentionally retained compact theme-icon widths to avoid breaking the header on narrow mobile screens. A proper mobile touch-target/layout review remains outstanding.
- Source tests check explicit pixel classes and focus wiring. Actual rendered contrast, zoom behaviour, and mobile overflow still need browser verification; this is not a claim of WCAG certification.
