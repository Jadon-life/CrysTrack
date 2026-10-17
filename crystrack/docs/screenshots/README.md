# Workspace browser screenshots

Generated directly by Chromium using `npm run test:workspace:browser`. These show the actual React routes and shared shell with explicit synthetic test-account API fixtures; no fixture data is used in the production application or written to Supabase.

`today-1440-golden.jpg` is the flagship comparison against the provided Today reference. `today-1440-light.jpg` verifies the light palette and first official C mark. Today is also captured at 375, 430, 768 and 1280px. The remaining route images show the 1440px desktop workspace. The original user-supplied comparison sheets are in `../references/`.

The final sidebar acceptance captures are:

- [Expanded / dark](sidebar-expanded-dark.jpg)
- [Collapsed / dark](sidebar-collapsed-dark.jpg)
- [Expanded / light](sidebar-expanded-light.jpg)
- [Collapsed / light](sidebar-collapsed-light.jpg)
- [Mobile navigation](mobile-navigation.jpg)

The 240px and 76px desktop states preserve the exact same outer frame. Browser assertions cover keyboard tooltips, navigation/refresh persistence, unavailable storage, active routes, dashboard reflow and mobile drawer focus restoration. These screenshots were visually compared.

Brand limitation: the C marks use the supplied JPEG sheet's original pixels, but the adjacent text is not the exact official wordmark. Original light/dark SVG or transparent PNG lockups are still required; exact branding acceptance is pending.
