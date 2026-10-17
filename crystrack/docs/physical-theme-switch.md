# Three.js physical rocker preview — Option A

The flat CSS mock-up was rejected. It is now replaced with an actual 3D
capsule rocker made from beveled extruded shapes, MeshPhysicalMaterial,
HemisphereLight / DirectionalLight / PointLight and a perspective camera.
The navy recessed housing, cyan sidewall and silver-blue metallic rocker use
CrysTrack's original blue/cyan brand rather than a purple theme.

Three.js 0.167.1 is an exact dependency matching existing @types/three.
The scene module is imported dynamically on the client, never on the server.
A semantic ON=Light/OFF=Dark button receives clicks and keyboard input; the
canvas itself captures no pointer events. Adaptive stays in Settings → Appearance,
and a tiny indication shows when time-of-day Adaptive mode is active.

A WebGL-disabled device receives a regular CSS fallback with the same
accessible theme behavior. The renderer draws only at init, resize and for a
250ms switch animation, never in a continuous loop. Animations respect
CrysTrack reduced-motion settings. GPU geometries/materials and observers
are disposed on unmount.

Rendering quality and responsiveness still need screenshot/browser checking;
successful automated code checks do not prove a high-quality photograph-like
result. Keep this upgrade isolated on draft PR #4. Supabase stage isolation
remains UNKNOWN; no financial writes, database changes or production merges.
