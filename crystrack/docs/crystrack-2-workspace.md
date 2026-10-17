# CrysTrack 2.0 — Floating Glass Workspace

Implementation branch: `feat/crystrack-2-floating-workspace`. Based on `bb17e31` so the completed Piece 9 preview work is preserved. Nothing was pushed, merged or deployed for this redesign; no database migration or production flag was changed.

## Reference review

The supplied Today and 12-page overview JPEGs are preserved in `docs/references/`. They guide composition, sidebar hierarchy, blue action accents, refractive surfaces and atmospheric separation. The later sizing instruction takes precedence over the small reference window: the actual desktop application occupies approximately 94vw × 92dvh, up to 1800px wide. Existing application capabilities and real API data remain authoritative. No upgrade cards, crypto portfolios, fictional balances, subscription tiers or placeholder actions were added.

The official brand sheet is preserved unchanged at `public/brand/official-reference.jpg`. ThemeAwareBrandLogo displays the original pixels through two fixed SVG viewports: the first C for light mode and the second, dark icon for dark mode. It does not trace, generate or redraw a logo. SVG here is a viewport around the original JPEG image, not a reconstructed vector mark. Transparent original PNG/SVG assets would remove the JPEG background/edge limitations and can replace the configured paths later.

## Shell architecture

`AppLayout` retains authentication, service-worker registration, profile/location synchronization, the existing EnvironmentBackground component, one interactive GoalAtmosphere canvas, RhythmProvider and GamificationProvider. Auth uses a separate atmospheric glass sign-in surface.

`FloatingAppShell` contains a persistent, collapsible GlassSidebar (240px expanded / 76px collapsed) and a main grid with the interior TopNavigation utility header, one vertical desktop content scroller, and the persistent floating focus island. Grid children use min-height/min-width zero. The shell has a 30px radius, translucent perimeter, 20px backdrop blur, 180% saturation, reflections and restrained shadows. Its desktop frame remains stationary while page content scrolls. Navigation resets only the interior scroll position and focuses the new page heading. Mobile uses natural document scrolling; narrow desktops/tablets use a 78px rail with an accessible drawer.

The header now contains page navigation search (including Ctrl/Cmd+K), saved appearance controls, weather/location refresh, notifications and profile/XP controls. It does not duplicate the sidebar navigation. History is linked from Insights and the sidebar footer. All ten primary routes have independent active states; History highlights Insights.

WorkspaceOverlay uses the existing Radix Dialog dependency to portal outside the clipped shell, trap keyboard focus, hide background content, close on Escape and restore focus. The previous CreateModal and task archive confirmation now use it. Existing GoalDialog slide-overs are already portalled and remain available. Search, mobile navigation, notifications, profile menus and quick capture also use portals.

## Shared design and theme

`workspaceThemeTokens()` in `src/lib/theme.ts` supplies shell/sidebar/card/reading surfaces, light and dark text, accents and dimensions. `effectiveWorkspaceTheme()` respects explicit light/dark selections and chooses light for morning/day, dark for golden/evening/night in adaptive mode. The existing provider still saves preferences and runs the original scene selection/stability engine.

`src/app/workspace.css` owns the new layout and surface treatment. The three obsolete premium physical UI layers are no longer imported, avoiding their competing navigation and card overrides. The final background stability stylesheet is retained for its existing photo safeguards. Previous forced-white text overrides were converted to theme variables; stronger financial/chart/reading surfaces also follow theme tokens. The new workspace stylesheet contains no `!important` patches. Existing domain styles remain for goal/assignment/calendar/finance behaviors.

Cards retain pointer spotlights, restrained tilt/glare and press feedback. The new shell, cards, auth and portal surfaces are genuinely translucent. Dense regions use stronger reading layers. Main text is at least 14px and secondary text at least 12px. Numbers inherit tabular figures. Primary buttons use a slightly deeper blue than decorative accents to keep white labels above 4.5:1; palette tests also check text contrast on composed card surfaces. OS and saved reduced-motion preferences suppress decorative motion. Controls have visible focus outlines; utilities and primary controls have at least 40px targets.

## Route work

- `/`: recomposed Today with real greeting/local date, four metrics, actionable task checkboxes, Goals in Motion, exact NGN Wealth Snapshot, connected reflection flow, task-linked focus ring, Workload Radar and real Recent Activity. Removed the duplicated streak panels. Quiet gamification preferences replace the streak metric with recorded focus minutes. Quick capture opens existing task/goal/assignment/finance creation workflows.
- `/plan`: capacity/priority metrics, visible Top 3 empty/filled state, daily and weekly rituals, life-area perspective and module shortcuts.
- `/tasks`: compact Today and recurring-routine bento regions, existing filters, skip/archive/delete/create controls and progress. Date/weekday/toggle requests now resolve from the saved profile timezone, including day changes.
- `/goals`: heading-first goal composition, lifecycle filters, real progress rings and preserved edit/check-in/milestone/linking/trophy flows. Today links can target individual goal headings.
- `/assignments`: academic composition with course metadata, filters, deadline views, workload and preserved late-completion/reschedule/drop/edit flows.
- `/calendar`: retained unified Day/Week/Month grid, task placement/dragging and editing within the shared shell.
- `/finance`: retained actual NGN ledger, accounts, budgets, savings locks, bills, Ajo tools, import/export, forecasts and revision-safe editing. Added a quick-capture deep link to the existing entry form. Financial calculations remain in the existing integer-kobo helpers.
- `/insights`: recorded weekly overview and life-area bars ahead of existing intelligence and achievement modules.
- `/history`: recorded summary metrics and existing filtered timeline; grouping and time labels now use the saved timezone.
- `/ai`: conversation list and readable conversation workspace, retaining saved conversations and existing read-only AI contracts. Piece 9 remains separately guarded in preview.
- `/settings`: profile, preferences, appearance, notifications and privacy remain intact; theme-aligned surfaces and accessible toggle states.
- `/auth`: theme-aware official mark, atmospheric glass form, labeled fields, password visibility control and unchanged Supabase sign-in/sign-up behavior.

## Verification and reproducibility

Run from `crystrack/`:

```sh
npm run check
npm run build
npm run test:workspace:browser
```

The browser test uses Playwright and Chromium available in the cloud tooling plus the existing esbuild/Tailwind tooling. A local machine needs those browser-test tools installed and Chromium available (the harness defaults to `/usr/bin/chromium`). It bundles the actual AppLayout, shell, route components, glass interactions and canvas against an explicitly synthetic, local HTTP fixture. It never connects to Supabase or sends the fixture data to external services. Fixture files are created in a temporary directory and cleaned up. Screenshots are written directly by Chromium to `docs/screenshots/`.

Verified:

- Baseline `npm run check` (197 tests) and `npm run build` passed before implementation.
- Final check has 201 tests, including theme selection, approved asset selection, translucent palette composition and contrast invariants. Existing business/API/database-unit safeguards continue to run. Obsolete source assertions demanding the former diamond, six-item top navigation or old layout were updated to the new specified UI contracts; their functional checks were preserved.
- Final `npm run build`: passed with the optimized production bundle. Built-app smoke check: Auth and official logo asset 200, protected dashboard API 401, disabled preview coach API 404.
- Browser render matrix: all 12 routes at 375, 430, 768, 1280 and 1440px.
- Desktop frame dimensions, meaningful exterior margins, no document/content horizontal overflow, stationary utility header during internal scrolling, mobile drawer and focus restoration.
- Task completion uses the saved day while the browser runs in a different timezone; task-linked focus starts/pauses and remains visible in the dock. The reflection modal saves with the same local day. Extra 1100×768 and 1440×540 checks pass for compact laptops and short desktops.
- Portalled quick capture, search, notifications, profile, task creation and finance entry editing; keyboard focus and Escape recovery.
- Explicit/saved light/dark appearance, distinct original logo viewports, reduced motion, and the expected real background assets in all five adaptive phases.

Screenshots contain clearly synthetic test-account content to exercise the actual UI. No demo balances, dates, task titles or activity were inserted into application source or a real database. See the screenshot files for Today at all five widths, the flagship golden-hour scene, light mode, and each route at 1440px.

## Known limitations and safe next step

Authenticated end-to-end operation against a real Supabase account, real notification delivery, live AI responses and live exchange-rate availability were not exercised by the local browser fixture. Existing API tests and unit checks validate their unchanged contracts; this does not establish live-service readiness. Review the local branch, then test with a real authorized account before deciding whether to push or deploy. No migration is needed for this frontend redesign.

The supplied brand JPEG is faithful but not a transparent/vector original. Replace it with the original transparent variants when available. The mockups depict some features not present in the real app; those have intentionally not been invented.

## Screenshot review

- [Flagship golden-hour desktop](screenshots/today-1440-golden.jpg)
- [Light theme and first official mark](screenshots/today-1440-light.jpg)
- [1280px laptop](screenshots/today-1280-dark.jpg)
- [768px tablet rail](screenshots/today-768-dark.jpg)
- [430px mobile](screenshots/today-430-dark.jpg)
- [375px mobile](screenshots/today-375-dark.jpg)
- [Wealth](screenshots/finance-1440-dark.jpg), [Goals](screenshots/goals-1440-dark.jpg), [Calendar](screenshots/calendar-1440-dark.jpg), [Auth](screenshots/auth-1440-dark.jpg)

Compared against the supplied Today/overview sheets: the integrated sidebar, interior utility header, balanced top metrics, left Plan/Goals/Wealth/Reflection and right Focus/Workload/Activity follow the reference hierarchy. The application deliberately uses the later, larger 94vw × 92dvh proportions and readable 14px body text, so longer content scrolls instead of being reduced to fit the mockup.

## Final sidebar refinement

The desktop sidebar header has a visible Collapse/Expand button with `aria-expanded` and `aria-controls`. Its state is stored under `crystrack-sidebar-collapsed-v1`, synchronized across mounted consumers/browser tabs, and retained across route changes and refreshes. Blocked browser storage falls back to memory. The CSS grid changes only its sidebar column; the approximately 94vw × 92dvh outer frame stays fixed. Focus remains on the toggle when changing states. Collapsed links retain explicit accessible names, illuminated active states, and body-portalled hover/focus tooltips that Escape dismisses. Existing saved/OS reduced-motion rules apply. Tablet uses a compact 76px rail plus drawer access; mobile always uses the full-label, focus-trapped drawer, regardless of the saved desktop preference.

Chromium verifies both states in light/dark mode, 240/76px widths, the unchanged outer bounding rectangle, 164px workspace expansion, dashboard overflow, keyboard tooltips, route/reload persistence, blocked-storage fallback and mobile drawer focus restoration. New captures: `sidebar-expanded-dark.jpg`, `sidebar-collapsed-dark.jpg`, `sidebar-expanded-light.jpg`, `sidebar-collapsed-light.jpg`, and `mobile-navigation.jpg`. They use the same explicit synthetic API fixture as the other screenshots. All five were visually reviewed.

**Branding remains pending original assets.** Only the unchanged official JPEG reference sheet is available. The current C marks display its original pixels, but the adjacent CrysTrack text is a font-rendered label, not the exact official wordmark. This does not satisfy final brand acceptance. Original SVG or transparent PNG light/dark lockups, including their wordmarks, have been requested. No replacement mark or fabricated wordmark was introduced in this refinement, and screenshots must not be treated as proof of exact lockup fidelity.

After this refinement, `npm run check` passed (201 tests, typecheck and lint), `npm run build` passed, and the complete workspace browser suite passed, including all existing 12-route/responsive workflow checks. No backend contract, migration, production setting or deployment changed. Work remains local on the existing feature branch.
