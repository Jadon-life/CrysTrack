# Issue #43 P2 — actual synthetic Chromium captures

Captured against the implementation on a guarded local Supabase sandbox. Only synthetic users/routines; no real financial records. Screenshots are full-page browser captures, not generated mockups.

## Existing before reference

The committed [PR #47 server-guard captures](../issue46/README.md) show the approved dev UI before P2. They are reused historical evidence, not newly captured baseline screenshots. The matching source was merged into base `9be18c0c7815d589cb46199bfd87aee430a27cbf`. September scenic background, horizontal glass navbar and physical switch remain unchanged.

## After: pending edits in each viewport and theme

| Width | Dark | Light |
| --- | --- | --- |
| 375 | [Capture](offline-pending-375-dark.jpg) | [Capture](offline-pending-375-light.jpg) |
| 430 | [Capture](offline-pending-430-dark.jpg) | [Capture](offline-pending-430-light.jpg) |
| 768 | [Capture](offline-pending-768-dark.jpg) | [Capture](offline-pending-768-light.jpg) |
| 1280 | [Capture](offline-pending-1280-dark.jpg) | [Capture](offline-pending-1280-light.jpg) |
| 1440 | [Capture](offline-pending-1440-dark.jpg) | [Capture](offline-pending-1440-light.jpg) |

## Recovery and review states

- [Confirmed after server receipt](confirmed-1440.jpg)
- [Conflict requiring manual review](manual-review-1440.jpg)
- [Auth verification required: device labels hidden](verification-required-1440.jpg)
- [Owner switch: previous owner device work cleared](owner-switch-cleared-1440.jpg)

Pending local actions have separate text and leave canonical checkboxes, verified progress and Shards unchanged until server reconciliation. Automated scoped axe scans passed at all ten width/theme combinations; physical-device and full WCAG certification are not claimed. See the [validation report](../../piece8ap2-validation.md) for exact limits.
