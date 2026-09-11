---
id: "FONT-07"
title: "Emoji"
status: "retired"
priority: "P3"
epic: "fonts-and-script-support"
phase: "unspecified"
depends_on: []
legacy_state: "Open, not started"
---

# FONT-07 · Emoji

## Scope and acceptance

**Emoji.** A different problem from CJK subsetting: colour emoji (`COLR`/`CBDT`/layered-glyph formats) has no path through pdf-lib's outline-glyph embedder. Likely solution is image-embedding (the app already knows how to embed signature images), not font-embedding. Needs its own evaluation from scratch.

## Retired 2026-09-11: won't do

Decided by Shlomi on the board cleanup. Colour emoji has no path through pdf-lib's outline embedder
and would need an image-embedding design of its own; the audience asking for it is not one this tool
is for. The refuse-while-typing path already tells a user emoji cannot be drawn, which is the honest
answer. Reopen only with evidence people are trying to type emoji into signed documents.
