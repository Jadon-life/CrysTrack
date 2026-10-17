# CrysTrack Goal workspace design

These rules describe the scoped Piece 4 workspace. Existing scenes and primary navigation stay in place. `src/lib/theme.ts` exports `goalThemeTokens`; visual behavior is defined in the goal section of `src/app/globals.css`.

## Surfaces and grid

Use an 8px spacing rhythm: 8px within controls, 16px between cards and sections, 20–24px card/panel padding. The goal bento grid has one column on phones, two at medium widths, and three on wide screens. A translucent centered dock reserves bottom space; editing opens a glass slide-over with a full-height scroll area. Cards have 20px radii, layered navy/black tints, blur(20px) saturate(180%), and a 1px gold-to-white gradient border. Financial figures use a solid #0A1634 inset panel.

## Type and contrast

Body and input text are at least 14px; secondary labels and supporting copy are at least 12px. Warm ivory #F6F1E4 and cool grey #B7BED1 sit on dark reading surfaces. Brand gold is #D9B65D with #F0D48A hover feedback. On solid navy, both ivory and secondary grey exceed WCAG AA 4.5:1 text contrast; glass backgrounds use layered black shading to preserve readability over photos. All numeric content uses tabular figures. Inputs have visible labels and at least 40px height; icon actions have accessible names and visible focus outlines.

## Motion and interaction

Use 180–200ms transitions for buttons, borders, rings, and slide-over entry. Cursor lighting and restrained card tilt remain decorative. Completion particles run once for 700ms and never block input. The ambient canvas caps resolution and frame rate, pauses when the tab is hidden, and changes hue with the current phase. The focus timer uses elapsed monotonic time rather than decrementing a counter. System and saved reduced-motion preferences suppress card motion and particles and render the canvas statically.

Dialogs trap keyboard focus, close with Escape when idle, restore prior focus, prevent background scrolling, and retain entered values when a save fails. A saved revision conflict asks the user to refresh. All lifecycle prompts and progress copy support reflection without blame.

## Academic workspace (Piece 5)

Assignments reuse the existing refractive card, spotlight/tilt, canvas, and accessible slide-over primitives. Coursework uses a two-column bento list that stacks on phones; the timeboxed calendar uses seven day columns at wide widths and stacks at narrow widths. Metadata and charts use tabular figures. The Workload Radar sits on a solid navy data surface, with ivory text, grey secondary labels, and gold hours bars. Touch labels and action buttons are at least 40px. Completion checkboxes depress by 1px with a restrained 180ms spring; system and saved reduced-motion settings suppress this feedback. The one-tap resolution dock has a visible reschedule destination and Undo for reschedules and drops.

## Shared rhythm shell (Piece 6 audit)

The shared authenticated shell now overrides the older tilt-disabled card styling with the same 20px / 180% refractive treatment used by the newer workspaces. Cursor lighting and tilt respect both OS and saved reduced-motion settings. One canvas sits between the existing photos and main content; the Floating Island persists task focus across routes. Today, Plan, and Calendar share warm typography, tabular figures, and 40px controls. Data charts and tables keep solid reading surfaces inside their glass frames. The month grid has only the required weeks; day/week hour grids scroll inside their container on narrow screens and provide keyboard equivalents for drag-and-drop.
