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
