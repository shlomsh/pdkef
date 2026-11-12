---
id: "SIGN-51"
title: "Sign's and Redact's desktop Download draws its real 1.5px frame in Chromium"
status: "in_progress"
priority: "P3"
epic: "polish"
horizon: "now"
depends_on: ["RED-73"]
---

# SIGN-51 · Sign's and Redact's desktop Download draws its real 1.5px frame in Chromium

*Filed 2026-11-12.* The strip finish (QUAL-27, SIGN-49, RED-73) outlines Download, and the Drive
arrow joined to it, in a 1.5px `--color-border-strong` frame. From 920px up that frame is a
`border: 1.5px`. While building READ-28 we measured that Chromium (the bundled Chrome/156) floors a
border's width to whole CSS pixels at any device scale, so the frame computes and paints as 1px in
Chrome, even at deviceScaleFactor 2. Below 920px the strip draws it as `box-shadow: inset 0 0 0
1.5px`, which is not floored, so phone and tablet are right and desktop is thin.

## Outcome

- From 920px up, Sign's and Redact's Download is a 1px `--color-border-strong` border plus a 0.5px
  inset ring in the same token, so it reads 1.5px in Chromium, as READ-28 does for Highlight's tile.
- With a Drive arrow joined to it, the pair shares that frame: Download keeps the ring on its top,
  bottom and start side, the arrow on its top, bottom and end side, and the 1px divider between them
  stays the quiet `--color-border`. Right to left (`/he/sign/`) mirrors it.
- A disabled Download keeps the same construction in `--color-border`.
- Row widths and the one-line layout are unchanged (the border stays 1px, which is what Chromium
  drew already). Highlight's tile finish is untouched.

## Guard

`e2e/tool-toolbars/toolbar-finish-groups.spec.js`: at 1280px, for Sign and Redact, Download's frame
is a 1px border plus a 0.5px inset ring in the strong token; with the real `DriveSaveMenu.module.css`
arrow class found in the page's sheets (as READ-28's spec does), the arrow shares it on its outer
sides. Seen failing before the CSS change.
