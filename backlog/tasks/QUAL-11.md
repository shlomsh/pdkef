---
id: "QUAL-11"
title: "Mint and paper: retheme the palette so green is the ground and warmth is the paper"
status: "in_progress"
priority: "P2"
epic: "site-quality"
phase: "near-term"
depends_on: []
legacy_state: "In progress 2026-09-18"
---

# QUAL-11 · Mint and paper

*Filed 2026-09-18 from a palette review against the mission statement and voice.*

## Problem

Sea Glass is a pale grey-teal wash with teal chrome on top. It reads calm, but
it is cool everywhere while the copy is warm, and the only warm pixel on the
home page is the citron behind "sign" in the demo. Green is the brand's colour
and it is never the ground; the header, the hero and the dock are three tints
of the same wash, and the header is white.

The chosen direction, sketched at
https://claude.ai/artifact/3in5MeJ4aYfiREvUxGYPyy, keeps the greens dominant
and moves the warmth into the paper.

## Direction

- Ground: pale mint `#d4f4ec`, deepening toward the dock (`#a5e9dd`).
- Ink: deep teal `#007979` for primary, links, the hand-drawn annotation and
  the headline accent; text `#0b4c4c`, muted `#2c6f6a`.
- Paper: cream `#fff0e4` on the dropzone and on the three link chips in the
  header. The On-device chip is the one solid teal chip.
- Citron: the current lime `#efffa6`, in three places only: a highlighter
  stroke under "on your device" in the H1, the mark behind "sign" in the demo,
  and the Redact tile in the dock.
- Header: solid pale mint at rest and when stuck, hairline under it. The hero
  gradient starts from the header's value so the first screen has no edge.

## Scope

- Root tokens in `src/styles/global.css`, plus `--color-paper` and
  `--color-paper-edge`. `theme-color` meta and the manifest colours follow.
- `src/layouts/HomePageLayout.astro`: hero overrides, dock (replace the literal
  `#c4e1e6` with a token), tile fills, headline stroke.
- Header chips and sticky background.
- Dropzone paper, home and tool pages alike.
- `.claude/rules/styling.md` palette paragraph.

## Acceptance

- `src/styles/colorContrast.test.js` passes with the new pairs; muted text on
  the pale mint ground is AA.
- `npm run test:css`, `test:weight` and the CSS ratchets do not move up.
- Home, Sign, Redact and one plain tool page reviewed on the dev server
  before landing.
