---
id: "QUAL-13"
title: "Mint and paper reach: the closing panel, the tool page stage and the editor toolbar"
status: "in_progress"
priority: "P2"
epic: "site-quality"
phase: "near-term"
depends_on: ["QUAL-11"]
legacy_state: "In progress 2026-09-18"
---

# QUAL-13 · Mint and paper reach

*Filed 2026-09-18, right after QUAL-11 landed on main.*

## Problem

QUAL-11 gave the home hero its ground and its accents: an off-white to mint
gradient, a citron stroke under the H1's lead word, an ink flagship tile with a
white ring. Three surfaces the visitor reaches next still sit on the old flat
white and carry hover and highlight choices from before the retheme:

- The home page's closing "Give it a try." panel is a flat white card.
- Every tool page opens on the flat body colour, so the hero's gradient reads as
  a home-page-only flourish instead of the site's ground.
- In the editor, the toolbar's hover fill uses the sunken mint token, which
  became a ground colour in QUAL-11. A hover now looks stronger than the
  surface it sits on.

## Scope

- Two `:root` tokens, `--color-citron` and `--color-citron-ink`, so the accent
  is available outside the home scope. The home page's `--home-citron` pair
  aliases them.
- Closing panel: the hero gradient inside the card, the citron stroke under
  "try", the sample tile with the flagship's ring and ink shadow. Paper
  dropzone and wave lines unchanged.
- Tool pages: the same gradient on `.tool-stage`, in pixel stops so it fades
  into mint by the tool card and stays mint below, where the document sits.
  The H1's lead phrase, everything before the first colon, gets the stroke.
  Derived at render time, no data change, so localized pages get it when their
  title carries a colon and nothing otherwise.
- Editor toolbar: hover fill moves from `--color-surface-sunken` to
  `--color-primary-soft`. Armed fill, the lime Replace treatment and the ink
  tooltip stay. A citron Replace was tried and rejected as too bold.
- The stroke marks the promise, not the tool name: each tool carries an
  `h1Accent` ("in Your Browser", "Online Free", "Free"), the home page's own
  convention, instead of a colon split.
- Footer: the dock's deep teal band with white text and a citron heart, and
  the language selector folded into the credit line instead of taking a line
  of its own above it. The selector gets an inverse tone for the band; its
  above-the-hero use on guides is unchanged.

## Out of scope

- Any behavioural change. Same markup semantics, same tests, colour and
  gradient only.
- The hero itself and the dock, settled in QUAL-11.

## Acceptance

- `npm run test -- colorContrast` passes with the citron pair in the contract.
- The tool alignment spec (`e2e/tool-layout.spec.js`) and the home specs still
  pass: the hero's box does not move.
- The three surfaces read as one palette with the hero on the dev server.
