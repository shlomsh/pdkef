---
id: "QUAL-03"
title: "flatten.svg has the palette baked in as 31 hex literals"
status: "open"
priority: "P3"
epic: "site-quality"
phase: "later"
depends_on: []
legacy_state: "Open"
---

# QUAL-03 · `flatten.svg` has the palette baked in as 31 hex literals

## Scope and acceptance

**`public/images/redaction-guide/flatten.svg` carries 31 Sea Glass hex values written into the file.**
It lives in `public/`, so it is copied verbatim and never processed, and an `<img>` cannot read a
CSS custom property from the page that embeds it. CLAUDE.md's theme section promises the palette is
swappable from one place, and this file is the counter-example: it would need a manual redraw.

Right now this costs nothing, because DEMO-06 decided to keep Sea Glass. The reason to write it down
is that the decision could be revisited, and if it is, this file is the piece that will be missed. The
theme section already tells the next person to `grep -rn "rgba(0\|#[0-9a-f]\{6\}"` across `src/` and
`public/` for exactly this reason, so the mechanism to catch it exists and only needs to be run.

Two possible answers, in order of preference:

1. **Inline the SVG** into whichever component renders it, so its fills can reference `var(--color-*)`
   like everything else. Costs a little page weight on the pages that show it, and that weight is
   counted by `check-page-weight.js`, so measure rather than assume.
2. **Leave it and record the dependency**, which is what this ticket does in the meantime.

Check whether any other asset under `public/` has the same property before closing this, so the answer
covers the class rather than the one file that happened to be noticed.

**Acceptance.** Either the file reads its colours from the palette like everything else, or this
ticket is explicitly linked from DEMO-06 as a cost of any future repaint. If the SVG is inlined, the
page-weight budget for every page that renders it is re-measured and reported.
