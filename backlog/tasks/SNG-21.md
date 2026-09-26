---
id: "SNG-21"
title: "Fill mode's pinch-zoom e2e runs on CI's Linux Chromium too"
status: "open"
priority: "P2"
epic: "sign-next-gen"
phase: "near-term"
depends_on: []
---

# SNG-21 · Fill mode's pinch-zoom e2e runs on CI's Linux Chromium too

*Filed 2026-09-26.* The two pinch tests in `src/tools/sign/e2e/fill-mode-zoom.spec.js` pass on macOS.
On CI's Linux Chromium (PR 27) the synthesized pinch stays at 1x on every retry: the test loosens fill
mode's resting `maximum-scale=1` before pinching, and Linux Chromium never applies the loosened meta.
`toolbar-zoom-physical-size.spec.js` pinches fine on the same runner, without the clamp. The two tests
skip on Linux until this is fixed.

## Acceptance

- [ ] Both tests run and pass on CI's Linux Chromium, and the Linux skip is removed.
