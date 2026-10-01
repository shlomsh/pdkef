---
id: "SNG-21"
title: "Fill mode's pinch-zoom e2e runs on CI's Linux Chromium too"
status: "done"
priority: "P2"
epic: "sign-fill-mode"
order: 1
depends_on: []
---

# SNG-21 · Fill mode's pinch-zoom e2e runs on CI's Linux Chromium too

*Filed 2026-09-26.* The two pinch tests in `src/tools/sign/e2e/fill-mode-zoom.spec.js` pass on macOS.
On CI's Linux Chromium (PR 27) the synthesized pinch stays at 1x on every retry: the test loosens fill
mode's resting `maximum-scale=1` before pinching, and Linux Chromium never applies the loosened meta.
`toolbar-zoom-physical-size.spec.js` pinches fine on the same runner, without the clamp. The two tests
skip on Linux until this is fixed.

## Acceptance

- [x] Both tests run and pass on CI's Linux Chromium, and the Linux skip is removed.

## Resolution (2026-10-01)

The diagnosis in the filing was wrong. Probing CI's Linux Chromium (workflow_dispatch runs of a throwaway
probe spec) showed `Input.synthesizePinchGesture` with `gestureSourceType: 'touch'` never zooms there in any
config, clamp or no clamp; the app's own touch handler still fired, which is why the meta was rewritten
back. The default source (and `setPageScaleFactor`, and a manual two-finger `dispatchTouchEvent`) zoom on
Linux. The two tests now pinch with the default source; the loosen-and-nudge stand-in stays as it was and
works on both platforms. `toolbar-zoom-physical-size.spec.js` uses the touch source too, so its pinch
cases may be passing on Linux without having zoomed; its assertions are loose enough not to say.
