---
id: "DEBT-56"
title: "Compress Image's in-flight preview jumps when the photo decodes after first paint"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
depends_on: []
---

# DEBT-56 · Compress Image's in-flight preview jumps when the photo decodes after first paint

*Filed 2026-10-18.* `e2e/tool-hero-first-screen.spec.js` "the home launcher to compress-image lands
loaded with one hero height and no layout shift" failed on CI Linux with CLS `0.0127010038399402`
(`< 0.01` expected), in run 38812242018 (main, push) and run 39141112058 (workflow_dispatch). Both
runs report the same value to 16 digits, which rules out measurement noise: it is one specific
shift that happens on some runs and not others.

## What was measured (2026-10-18, local chromium, production build)

- Reproduced with CDP `Emulation.setCPUThrottlingRate`: 0 of 15 runs shift at rate 1, 11 of 15
  shift at rate 6, every one by exactly 0.0127.
- The layout-shift entry has one source, removed from the DOM before the observer reads it: a
  451px-wide box at x=301 going from y=336, 54px tall, to y=194, 337px tall, at about 380ms after
  navigation.
- A mutation log of the failing runs places it: the tool loads at 326ms with the run in flight, so
  the result column shows the "Compressing…" compare panel (label row plus the original photo as an
  `<img>`); at 389ms the run finishes and that panel is replaced by the stats. The shift falls in
  between.
- Cause: for an image, `loadOriginalPreview` set `originalPreview` to the photo's object URL at once.
  If the panel paints before the browser has decoded the photo, the `<img>` has no intrinsic size,
  so the panel is only its 54px label row, centred in the result column (`min-height: 420px;
  justify-content: center`). When the decode lands, the panel grows to 337px and its top jumps
  142px up. On a fast machine the run finishes before that paint, so nothing shifts; under CPU load
  (CI's shared runners, a slow phone) the jump is visible. The PDF path has the same gap: its
  rendered page also went into an `<img>` before decoding.
- The first fix (decode, then show) exposed a second way to fail: Preact reused the skeleton's
  `<div>` as the panel (same slot, only the class changed), so the browser saw the skeleton move and
  shrink, 0.116 in 27 of 30 throttled runs. Keying the branches apart makes it remove-and-insert,
  which is not a shift. Keys must also differ between the in-flight branch and the done branch: a
  shared key made Preact carry the in-flight element down into the done layout (0.0557, and 0.0546
  on the PDF hand-off, every run).
- An already-small file can finish before its original decodes; the photo then arriving under the
  centred stats moved them up 70px (0.0052, 1 of 30). The done state holds that place with the
  skeleton while the original is pending.
- Probing every frame for the box (forced layout on each mutation) hid the bug, 0 of 20: the extra
  layout let the decode finish first. Only the passive mutation log caught it.

## Outcome

- The original preview is only shown once the browser has decoded it, for a photo and for a PDF's
  first page; until then the result column keeps the skeleton, as it already did while a PDF page
  rendered. A decode failure still shows the image.
- Two unit tests hold the decode open (`PdfCompressTool.test.tsx`): the in-flight skeleton stays
  until the photo decodes, and a result landing first holds the photo's place with the skeleton.
  Both were seen red before the fix.
- Measured after the fix: 0 shifts in 120 throttled hand-offs (Compress Image and Compress, 30
  each at 6x and 1x CPU).
- The e2e check passes repeatedly on CI Linux (`--repeat-each`), and passes 15 of 15 locally at 6x
  CPU throttling.
