---
id: "SEO-57"
title: "Pinned notes: people's own words on the home page and on Redact"
status: "open"
priority: "P2"
epic: "search-and-languages"
horizon: "later"
depends_on: ["SEO-56"]
---

# SEO-57 · Pinned notes on the home page and Redact

Shlomi picked option A of the sketches on 2026-11-06 (https://claude.ai/artifact/1efqy4g2EA4G4zVqtquHV4): handwritten
paper notes pinned to a board, each with the tool and the person's region. Redact gets the same section.

## Constraints

- Only comments a person agreed to show (`share: true`, SEO-56), as they typed them, with region and no name. No
  invented or reworded quotes.
- Comments stay free text, so Shlomi picks which ones go up: a note must not carry anything that identifies someone.
- Baked in at build time as static HTML, no JS on the SEO surface. On the home page it sits after the first screen.
- Notes settle in as they scroll into view through `animation-timeline: view()`, never an IntersectionObserver, and
  stay still under reduced motion.

## Waits on

- Enough real comments to fill a board: about four. Decide then whether the section also waits for a page's 50 votes.
