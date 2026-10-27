---
id: "ARCH-117"
title: "Shell CSS comments name current files and tool counts"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
depends_on: []
---

# ARCH-117 · Shell CSS comments name current files and tool counts

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding R4.
Area: Code. Criterion: Readability and naming. Structure only: no behaviour change.

## Why

- `src/shell/PdfTool.module.css:12` says "all nine tools" and cites `BasePdfTool.jsx`; CSS comments in `Dialog` and `Dropzone` modules cite `.jsx` names.

## Outcome

- Comments trimmed to one line plus the ticket id; `check:guidance` extended to bare file names.

## Acceptance

- [ ] No CSS comment cites a `.jsx` name that no longer exists.
- [ ] `check:guidance` fails on a bare file name that does not exist.
