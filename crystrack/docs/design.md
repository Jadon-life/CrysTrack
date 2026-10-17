# CrysTrack 2.0 design system

The floating workspace specification supersedes the earlier full-screen/top-navigation layout. Detailed implementation and validation are in [crystrack-2-workspace.md](crystrack-2-workspace.md). The approved Today and page-overview references are in `docs/references/`.

## Layout and spacing

Desktop: width min(94vw, 1800px), height approximately 92dvh, 30px outer radius, 240px sidebar, 70px utility header and 24–32px content padding. Keep all four photographic exterior margins visible. The desktop page scrolls inside the frame; sidebar and utilities remain stable. Use min-height/min-width zero for grid/flex children. Cards use 20px radii and 16–24px bento gaps. At tablet widths the sidebar becomes a 78px rail. Mobile uses approximately 10px safe-area-aware margins, 16px content padding, stacked cards, accessible drawer navigation and natural document scrolling.

## Surfaces and color

`workspaceThemeTokens()` in `src/lib/theme.ts` is the palette source. `workspace.css` owns the shared layout and surface cascade. Shell, sidebar and cards use actual alpha transparency, a 20px/180% frosted backdrop, soft reflections and white hairline borders. Blue/cyan are action accents, emerald marks verified progress, and gold remains a restrained milestone detail. Dense tables/charts/inputs may use stronger theme-aware reading layers. Avoid opaque blue container fills. Preserve the adaptive photographs and their stability safeguards.

## Typography and accessibility

Use Manrope and tabular numerals. Body/input text is at least 14px, secondary labels at least 12px; mobile editable text is 16px. Headings are 25–34px with compact tracking. Light mode uses dark ink; dark mode uses warm ivory and high-contrast cool supporting text. Palette tests check 4.5:1 text contrast on composed card surfaces and on primary action colors. Account for the actual photo when reviewing screenshots. Controls have visible focus outlines and at least 40px primary targets. Dialogs and utility menus portal outside the shell, trap focus, close with Escape and restore their trigger. Do not rely on a clipped fixed-position child for an overlay.

## Brand and motion

Use the exact supplied first C in light mode and second C in dark mode, selected from the effective theme. Do not redraw or generate an alternate logo. The current approved JPEG is displayed using fixed image viewports; transparent originals are preferred when available.

Use restrained 150–250ms interactions: cursor spotlight, slight hover tilt/glare, inset button highlights and 1px press feedback. The ambient canvas stays decorative, time-aware and cursor-aware. OS and saved reduced-motion preferences suppress decorative animation. Focus timers use their existing persistent sessions and elapsed-time logic; the dock owns automatic completion while the Today ring displays the same session.

## Data integrity

Use actual user data, friendly empty/error states and encouraging copy. Never add fictional financial balances, XP, subscription upsells or activities to fill a mockup. Dates and grouping use the saved timezone. Money stays DECIMAL(12,2) in storage and integer kobo in application arithmetic. Retain revision/concurrency, authentication, RLS and ownership safeguards.
