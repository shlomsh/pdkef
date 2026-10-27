---
id: "ARCH-94"
title: "Guidance and source comments cite only paths that exist"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-94 · Guidance and source comments cite only paths that exist

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Supporting. Criterion: Docs and guidance accuracy. Structure only: no behaviour change.

## Why

- `scripts/check-guidance-budget.js` checks rule globs but never the repo paths the prose cites, so 9 missing paths went unnoticed.
- Source comments cite moved paths too: `src/editor/registry/messages.ts:228,233,238,241`, `src/tools/sign/PdfSignTool.tsx:82`, `src/tools/redact/RedactBox.tsx:45` name `SignTool/...` paths; `src/shell/BasePdfTool.tsx:105-108` still says "nine tools".

## Outcome

- `check:guidance` fails on a cited repo path that does not exist (skipping `docs/archive/`), and the same scan runs over source comments.

## Acceptance

- [x] A planted dead path in a rule file and in a comment each fail the check.

## Done (2026-10-27)

scripts/check-cited-paths.mjs runs inside check:guidance: a repo path cited in CLAUDE.md, .claude/ or docs/ (not docs/archive/), or in a source comment, must exist (planted dead paths in a rule file and a comment failed). About 129 dead paths in 57 files now point where the file lives, or the sentence drops a file that is gone. The named SignTool/... comments cite src/tools/sign/components/.
