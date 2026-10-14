---
id: "DEBT-52"
title: "Compress's options grow 88px after a handed-over file loads"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
depends_on: []
---

# DEBT-52 · Compress's options grow 88px after a handed-over file loads

*Filed 2026-10-15 while guarding HERO-02's hand-off path.* On /compress/, about 80ms after a file
arrives by hand-off, the options area grows about 88px (its own async layout, likely the estimate row
in `src/tools/compress/PdfCompressTool.tsx`; confirm the element before fixing). That is a layout shift
of about 0.028 on about half of loads, with no input on the page. The HERO-02 hand-off guard therefore
uses Split, not Compress.

## Outcome

The options reserve their final height before the estimate arrives, and the hand-off guard in
`e2e/tool-hero-first-screen.spec.js` also runs on /compress/ with CLS < 0.01.
