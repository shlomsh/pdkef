---
id: "READ-05"
title: "A one-line fullscreen bar on desktop, shared by Highlight PDF and Sign"
status: "open"
priority: "P2"
epic: "highlight-pdf"
horizon: "next"
order: 4
depends_on: ["READ-01"]
---

# READ-05 · A one-line fullscreen bar on desktop

*Filed 2026-11-01.* Shlomi: in fullscreen the toolbar should be as small as possible, one line, smaller
buttons, focused on the document. Design record: [docs/highlight-pdf.md](../../docs/highlight-pdf.md),
"Fullscreen is the reading room"; the look is READ-01's pick.

## Outcome

In fullscreen with a fine pointer, both tools show one line: 32 to 36 px icon buttons with their names in
tooltips, the file name and "Page X of N" inline, the status row folded away, no card glass or shadow. The
bar never auto-hides. Coarse pointers keep today's 44 px targets. Leaving fullscreen restores today's
toolbar exactly.

## Acceptance

- [ ] One fullscreen style in shared chrome (`src/editor-ui/`), not a container-query tier.
- [ ] An e2e at two desktop widths pins one line, the button size, and that the page starts right under the
  bar.
- [ ] Arming a tool in fullscreen does not move the bar (the SIGN-30 rule).
