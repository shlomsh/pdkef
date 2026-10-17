---
id: "SNG-24"
title: "Sign on a phone: a one-line hero once a file is open, without moving the field toolbar"
status: "open"
priority: "P3"
epic: "sign-fill-mode"
horizon: "later"
depends_on: []
---

# SNG-24 · Sign on a phone: a one-line hero once a file is open

*Filed 2026-10-17 from HERO-08.* Every other tool's hero, Redact's included, folds to one line on a phone
once a file is loaded. Folding Sign's the same way lifted the form field and made
`src/tools/sign/e2e/toolbar-zoom-physical-size.spec.js:292` see the full field toolbar jump 149px sideways
at 1.8x pinch zoom (anchor x 389.9 to 240.9). Sign's phone layout is frozen for patches in favour of the
next generation ([docs/sign-next-gen.md](../../docs/sign-next-gen.md)), so the fold is part of that layout
rather than a patch on today's. The fold CSS Redact uses is in ToolHero.astro behind
`data-hero-editor-fold`; Sign joins by getting that attribute once its toolbar holds still under it.

## Acceptance

- [ ] Sign on a 375px phone shows a one-line hero once a file is open.
- [ ] The toolbar-zoom spec stays green with the fold in place.
