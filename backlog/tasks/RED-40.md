---
id: "RED-40"
title: "Redact remembers the whiteout colour and blur strength per document, like Sign"
status: "in_progress"
priority: "P2"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-40 · Redact remembers the whiteout colour and blur strength per document, like Sign

Today Redact keeps both in browser-wide preferences (`lastWhiteoutColor`, `lastBlurStrength`), so changing them on one document changes every other one. The brush (RED-32) already uses the document-style mechanism; these two join it.

- The same mechanism as Sign and the brush: a choice is carried in the document's draft (`carried`) and also becomes the app-wide style (`rememberAppStyle`), so a new document starts from it. A document with its own choice keeps it.
- `whiteoutColor` is already a `DocumentStyle` key; `blurStrength` is added beside the brush keys.
- A person's existing browser-wide choice is not lost: it seeds the app-wide style when that has no value yet.

## Acceptance
- Change the colour on document A, open document B (new): B starts with A's colour. Change B's colour, reopen A: A keeps its own.
- Same for blur strength.
- Unit tests for the resolve order: carried, then app-wide, then legacy preference, then default.
