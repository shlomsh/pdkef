---
id: "HERO-05"
title: "Sign and Redact on the same first screen"
status: "done"
priority: "P2"
epic: "tool-pages"
depends_on: ["HERO-02", "HERO-03", "HERO-04"]
---

# HERO-05 · Sign and Redact on the same first screen

*Filed 2026-10-14.* From [docs/tool-hero-show-the-verb.md](../../docs/tool-hero-show-the-verb.md).
Sign and Redact carry the airplane line above the card and open into an editor, not a page grid, so
they come after the eight page-grid tools.

## Outcome

- Both pages get the full-height desktop hero and the basics from HERO-02.
- Sign's verb: a field types a name, then a signature writes along its line. Redact's: a frosted
  box blurs two lines, then a footer watermark is whited out. Both follow HERO-03's motion style.
- Drop anywhere, with an answer for a file dropped over an open editor: it goes through the existing
  replace confirmation, never a silent swap.
- Sign's phone first screen stays as it is: phone Sign belongs to the next-generation work in
  `docs/sign-next-gen.md`, not to this lane.

## Progress

*2026-10-15.* Done in `7f24c0bd` (the Sign and Redact verbs on `VerbStage`, drop anywhere on), `bf617824` (a drop on an open editor goes through the replace confirmation; a known unaccepted type skips the question, a file with no type always asks), `825d6e7d` (the hand-off marker covers the editors) and `16e1a61b` (the page-grid desktop first screen, phone Sign and Redact unchanged to the pixel). The stale-restore hero shift of 0.041 is accepted. See `docs/tool-hero-show-the-verb.md`.
