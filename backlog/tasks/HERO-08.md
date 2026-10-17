---
id: "HERO-08"
title: "Redact on a phone folds its hero once loaded, and the editors' airplane line follows every other tool"
status: "done"
priority: "P2"
epic: "tool-pages"
depends_on: []
---

# HERO-08 · Redact folds its hero on a phone, and the editors' airplane line follows every other tool

*Filed 2026-10-16 from HERO-06.* Every other tool's hero folds to one line once a file is loaded. Doing the
same for Sign and Redact on a phone (a 393 to 440px coarse-pointer viewport) lifted the form field, and
`src/tools/sign/e2e/toolbar-zoom-physical-size.spec.js:292` then saw Sign's full field toolbar jump 149px
sideways at 1.8x pinch zoom (anchor x 389.9 to 240.9), so the fold was left out of HERO-06.

*Re-scoped 2026-10-17.* Sign's phone layout is frozen for patches in favour of the next generation
([docs/sign-next-gen.md](../../docs/sign-next-gen.md)), so Sign's fold moved to SNG-24 and this ticket
covers Redact (its fold and its airplane line). SNG-24 later found the toolbar jump was the spec's
zoom gate, not Sign, and gave Sign the same fold and line the same day.

Measured at 393x852 (2026-10-15, and again 2026-10-17): the empty-state sheet's top ranges from 253px
(Merge) to 472px (Sign); both editors render the "Turn on airplane mode" line above the card (Redact: line
at 410, sheet at 448), every other tool below it, and on Sign it stays above the card once a file is open.

Recorded as intended, not changed:
- Sign's dark icon tile and Redact's light green one are the per-editor tones in ToolHero.astro
  (`data-tone`, 2026-09-12), a deliberate identity for the two editors.
- Sign's taller empty-state hero comes from its longer SEO title (three lines at 393px) and the
  icon-beside-title row the editors keep; moving the airplane line below the card takes about 52px off it.

## Acceptance

- [x] Redact on a 375px phone shows a one-line hero once loaded; Sign's hero is unchanged (SNG-24).
- [x] The airplane line sits below the card on Redact, as on every other tool. On Sign it stays above the
  card: below it, the form moved up and the toolbar-zoom spec saw the same 149px jump as the fold, so Sign's
  line moved to SNG-24 with its fold.
- [x] Sign's toolbar-zoom spec and the tool-layout and first-screen guards stay green.
