---
id: "QUAL-15"
title: "The citron stroke leaves the tool H1s and marks the subhead's on-device closer"
status: "in_progress"
priority: "P2"
epic: "site-quality"
phase: "near-term"
depends_on: ["QUAL-13"]
legacy_state: "In progress 2026-09-19"
---

# QUAL-15 · The stroke marks the on-device closer

*Filed 2026-09-19, after the QUAL-13 rethink with SEO-36 in flight.*

## Problem

QUAL-13 strokes each tool H1's `h1Accent` in citron: "in Your Browser",
"Online Free" or "Free". SEO-36 removes "in Your Browser" from the three H1s
that had it, because it is the phrase every upload site can also say, and
moves the privacy claim into one closer on every subhead: "Free, open source,
and your file stays on your device." After that lands the stroke would mark
"Online Free" on seven tools and "Free" on three:

- A highlighter on "Free" across ten pages reads as a price sticker. The voice
  guide says free because it should be, never as a funnel.
- "Online Free" is the query phrase, the least human words in each H1. The
  stroke draws the eye to the SEO seam.

The home hero's stroke marks "on your device", the canonical claim in the
SEO-36 vocabulary and the one thing an upload site cannot copy. The tool pages
should mark the same idea where it now lives.

## Scope

- `ToolHero.astro` drops the `h1Accent` prop and the `.tool-hero h1 span`
  rule. The H1 is plain ink again.
- The subhead gets the stroke instead, under one shared phrase per locale
  (English: "on your device", the words the home hero already strokes; the closers vary by noun and number around them), rendered inside the sentence span that
  contains it exactly once. No match, no stroke: a subhead that does not carry
  the closer yet renders unchanged, so the change lands safely before or after
  SEO-36. The band technique stays, since the phrase can wrap.
- The stroke is a band behind the words only; the text keeps the lead colour.
  The contrast contract gains that pair on citron.
- The ten `h1Accent` fields and their comment leave `src/data/tools.js`, and
  `src/data/tools.test.js` goes with them. SEO-36 is told so its rebase drops
  those lines too.
- `.claude/rules/styling.md` says where the stroke sits and why.
- QUAL-14 is rewritten around the subhead phrase.

## Out of scope

- The home hero and the closing panel, whose strokes already mark the right
  words.
- Any H1 or subhead copy. SEO-36 owns the words; this ticket only chooses
  which of them wears the mark.

## Acceptance

- Every tool page H1 renders with no span and no colour change.
- On a page whose subhead contains "on your device" once, that phrase
  carries the citron band; every other subhead is unchanged.
- H1 and subhead `textContent` are byte-identical to `src/data/tools.js`.
- `e2e/tool-layout.spec.js` still passes: the hero's box does not move.
