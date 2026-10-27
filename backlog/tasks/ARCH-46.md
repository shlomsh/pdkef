---
id: "ARCH-46"
title: "Single-tool modules leave the editor core, and rule 9 covers src/editor"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-46 · Single-tool modules leave the editor core, and rule 9 covers src/editor

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Architecture. Criterion: Cohesion and organization. Structure only: no behaviour change.

## Why

- Seven modules in the headless editor core are used by one tool: `src/editor/adapters/pdf/sign.js`, `fieldLabels.js`, `applyPageEdits.js`, `src/editor/model/carriedPatch.ts`, `elementDefaults.ts`, `src/editor/workspace/signatureImagePolicy.ts`, `src/editor/text/fieldOrder.ts`.
- Rule 9 (a common-layer module needs two consumers) exempts `src/editor`, so the check does not see them.

## Outcome

- Each moves under its tool, or into an explicit `editor/<tool>-adapters/` folder the rule recognises.
- Rule 9 applies to `src/editor`.

## Acceptance

- [x] Rule 9 reports no single-consumer module in `src/editor`.

## Done (2026-10-27)

Rule 9 covers src/editor (planted single-tool module fails, test first) and reports nothing on the real tree. Applying it found 34 single-consumer modules, not the 7 named: 23 moved under their tool (11 to src/tools/sign/lib/, 12 to src/tools/redact/lib/, tests beside them); none needed an editor/<tool>-adapters/ folder. Seven with no product consumer (font corpora and reports read by scripts and guards, the unused gesture machine) are on the rule 9 allowlist with their reasons, for ARCH-61 to judge; fontLicenses.js stays allowlisted because moving it to site-lib made a project cycle. Test helpers are outside rule 9.
