---
id: "DEBT-53"
title: "A Download tapped before the build lands still downloads on an iPhone"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
depends_on: []
needs: "A check on your iPhone"
---

# DEBT-53 · A Download tapped before the build lands still downloads on an iPhone

*Filed 2026-10-17 from the HERO-07 review.* Five tools prepare their output in the background and let a
person tap Download before it is ready: Split, Compress, PDF to Image and Image to PDF (each keeps a
`pendingTap` ref), and Merge (`src/tools/merge/components/DownloadElement.tsx:123`, where the link
clicks itself). When the build lands, the tool delivers by clicking the download link from code
(`primaryRef.current?.click()`, or PDF to Image's `downloadAll`, which clicks one link per image 200ms
apart).

That click runs from an effect, seconds after the tap, outside the browser's user activation. Safari
on iOS is known to refuse some downloads started without activation, and Chrome may ask before a
second programmatic download. If it refuses, the person sees the ready look (PDF to Image even marks
it saved) and nothing arrives. This is a reviewer's inference, not a measurement: nothing in the
error reports shows it, and no tap-then-wait path has been run on a real iPhone.

## Step 1: measure

On a real iPhone (Safari) and an Android phone (Chrome), for each tool: pick a file large enough that
the build takes a few seconds, tap Download at once, and record whether the file arrives with no
second tap. PDF to Image with several pages also tests the multi-file path. Record the results here.

## Step 2: only if a case fails

Deliver without a programmatic click where activation has lapsed: when the build lands after a tap,
put the ready link under the person's thumb with a short "Ready, tap to save" state and focus,
rather than clicking it. One shared helper for all five tools, not five copies.

## Acceptance

- [ ] The measurement table, per tool and browser.
- [ ] Either every case delivers, or the shared ready-to-tap state ships and the failing cases pass.
