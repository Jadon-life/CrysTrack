# Theme-matched 3D rocker — approval candidate

This pass responds to three explicit corrections:

1. **No white switch.** The housing, recess, rocker face, edge, light and icon
   materials are derived at runtime from CrysTrack's active background,
   primary and secondary theme colours. It therefore belongs to the current
   morning/day/night glass environment instead of looking pasted on.
2. **No ON/OFF words.** The physical rocker has a raised sun on the Light side
   and a raised crescent on the Dark side. The active side is brighter.
3. **Visible depth.** The rocker face is materially thicker, the recess is
   deeper, and the selected state pivots approximately 14.6 degrees. One side
   visibly rises while the opposite side presses into the housing.

The button remains keyboard accessible and Adaptive remains under
Settings → Appearance. A theme-coloured CSS fallback uses the same sun/moon
icons if WebGL cannot start. Rendering is event-driven, not continuous.

This is an approval candidate only. No further product piece should begin
until the user approves the visual result. No production merge or database
changes.

## Darker visual calibration

The approval candidate has been deliberately darkened without changing its geometry. The rocker face, base and edge now stay much closer to the active CrysTrack background, with lower blue/cyan mixing and softer scene lighting. The sun/moon markings remain legible but less luminous, and the fallback uses the same darker calibration. The goal is for the control to feel embedded in the glass navigation rather than like a bright object placed on top of it.

## Weather-indicator colour match

The rocker no longer uses a custom colour formula. Its 3D surfaces now follow the same visual family as the top-bar weather indicator: quiet glass surface, the normal CrysTrack border, and the theme primary colour reserved for the active sun/moon mark. The non-WebGL fallback uses the weather button's exact `rgba(255,255,255,.055)` surface and `var(--theme-border)` border. Geometry and depth are unchanged.

## Screenshot correction — exact weather-surface recipe

The supplied screenshot showed the issue clearly: the Three.js rocker was still materially darker than the weather button. The renderer now recreates the weather button's actual visible fill recipe — the active theme background blended 5.5% toward white, corresponding to the weather control's `rgba(255,255,255,.055)` overlay — instead of using `surfaceGlass` / `surfaceStrong` as substitutes. The physical depth, border and active primary-colour sun/moon remain.
