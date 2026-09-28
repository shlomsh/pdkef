---
id: "RED-24"
title: "Blur defaults to medium, and medium is the blur PDkef had before the levels"
status: "done"
priority: "P2"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-24 · Blur defaults to medium, and medium is the blur PDkef had before the levels

*Shlomi, 2026-09-28: blur is medium by default, medium is the strength we had before the levels
(SITE-41), and the other levels follow from it. A person who picks light proactively knows what they're
doing, so nothing warns them or suggests Blackout.*

Before SITE-41 every blur was a fixed 24px at the 2.5x export raster (`blur(24px)` in `redact.js`, 8px on
screen), which is 9.6pt of page. SITE-41 replaced it with a fraction of the box height (0.3 / 0.4 / 0.5),
because a fixed radius left a 28pt headline's word shapes guessable. For ordinary text that made every
level lighter than the old blur.

One rule keeps both findings: **radius = factor × max(box height, 24pt)**.

| Level | Factor | Floor (small text) | Large text |
| --- | --- | --- | --- |
| light | 0.3 | 7.2pt | 0.3 × height |
| medium | 0.4 | 9.6pt, the old blur exactly | 0.4 × height |
| strong | 0.5 | 12pt | 0.5 × height |

- Medium on ordinary text is the old blur; on large text it scales with the box, so the headline leak
  stays fixed. No level gets lighter than today on any box, so no new readability check is needed
  (blurStrength.ts: raising a floor is fine).
- A new box starts at medium, then at the person's last choice (light included).
- A box saved without a strength predates the levels, so it drew the old blur. It restores as medium,
  which now looks the same. One default serves both.
- Screen and export use the same pure function from `blurStrength.ts`, so they can't disagree.

## Acceptance

- With no remembered choice, a new blur box is medium.
- Medium's export radius on a 14pt-high box is 24px at 2.5x (9.6pt); on a 40pt box it is 16pt.
- The on-screen blur is the same fraction of the box as the export at any zoom.
- After picking light, the next new box is light, with no warning anywhere.

## Result (2026-09-28)

`blurFraction(strength, boxHeightPt)` in `blurStrength.ts` is the one rule: `redact.js` applies it at the
2.5x export scale, and the on-screen box applies the same fraction in `cqh`, from the page's height in
points (`usePageHeightsPt.ts` through `RedactBox`'s `pageHeightPoints`). `DEFAULT_BLUR_STRENGTH` is
medium for new boxes and for boxes saved before the levels. The drag-draw preview, whose size lives only
in the DOM during the gesture, draws the plain fraction until the box is committed.
