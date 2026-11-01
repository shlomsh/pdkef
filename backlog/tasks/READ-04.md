---
id: "READ-04"
title: "Sign hands highlighting to Highlight PDF: no Highlight tool, existing highlights kept"
status: "open"
priority: "P2"
epic: "highlight-pdf"
horizon: "later"
order: 3
depends_on: ["READ-03"]
---

# READ-04 · Sign hands highlighting to Highlight PDF

*Filed 2026-11-01.* Decided with Shlomi: Sign keeps comment on everything and loses the Highlight tool
(under twelve hours live, negligible traffic). Design record:
[docs/highlight-pdf.md](../../docs/highlight-pdf.md).

*2026-11-01, on hold:* Shlomi chose to release Highlight PDF first and keep Sign backwards compatible, with
its Highlight tool, for now. The removal was reverted on `read-launch` (2025a28b) and comes back from here
once Highlight PDF has run in production.

## Outcome

Sign's toolbar has no Highlight button. A highlight already in a document (from Highlight PDF through the
shared memory space, from a saved Sign draft, or read back from another viewer's `/Highlight`) still shows,
can be selected, commented on, moved and deleted, and exports unchanged. Sign's comments (passage, element,
pin) are untouched.

## Acceptance

- [ ] The highlight toolbar button and its arming path are gone from Sign; `editor.md`'s toolbar counts and
  container-query thresholds are recomputed and `toolbar-desktop-one-line.spec.js` passes.
- [ ] A Sign draft holding highlights restores with them intact (unit test on a fixture of today's draft).
- [ ] A PDF highlighted in Highlight PDF opens in Sign with its highlights and exports them unchanged.
- [ ] Sign's done state offers Highlight PDF as a quiet hand-off only if it fits the cross-tool row.
