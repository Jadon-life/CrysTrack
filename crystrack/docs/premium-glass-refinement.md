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
