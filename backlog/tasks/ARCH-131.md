---
id: "ARCH-131"
title: "Sign and Redact's card rules leave the shell stylesheet"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-131 · Sign and Redact's card rules leave the shell stylesheet

*Filed 2026-10-29* after 42923db4 (the phone card frame rule for Sign and Redact) ran 110 of 138 specs.

## Why

- `src/shell/PdfTool.module.css` is imported by every tool, so import reachability (ARCH-32) sends an edit there to every tool's e2e. The phone rule that drops the loaded Sign/Redact card's frame (`.tool-card[data-tool-loaded]:has([data-workspace])`) only ever matches those two editors, yet editing it ran Merge, Split, Compress and the rest.

## Outcome

- A CSS edit that only affects the loaded Sign/Redact card runs only Sign, Redact and what really depends on them. No visual change.

## Acceptance

- [x] Every rule in `PdfTool.module.css` that only matches the loaded editor card lives in a sheet only Sign and Redact import.
- [x] Before/after narrowing numbers from `DOCS_ONLY=false node scripts/scope-summary.mjs --base HEAD`, a probe comment in each sheet.
- [x] `check:fast`, `check:push`, and the tool-layout, tool-toolbars and Sign toolbar-labels specs green on a build.

## Notes

**What moved.** One rule: the phone `.tool-card[data-tool-loaded]:has([data-workspace])` block. Nothing else in
`PdfTool.module.css` keys off `data-workspace`, `data-redact-workspace-ready` or another editor-only attribute; the
`:has([data-page-grid], [data-fills-stage])` floor is the page-grid tools' and Scan's. `.status-block--compact` is
rendered only by Sign's `PdfWorkspace.tsx` but is a modifier of the shared `.status-block`, not a card rule, so it stays.

**Where, and how it reaches the card.** Into `src/editor-ui/Workspace.module.css`, not a new sheet: both editors already
put its `.workspace` class on the element that carried `data-workspace`, and import reachability already sends it to
Sign and Redact only, so a new `EditorCard.module.css` would narrow to the same set for one more import in each tool.
The rule is `:global([data-tool-card][data-tool-loaded]):has(.workspace)`. `.tool-card` is hashed inside the shell's
module, so another module cannot name it; `data-tool-card` is the attribute `BasePdfTool.tsx` already sets on the card
(and `e2e/tool-layout.spec.js` already queries). Nothing is imported across layers, so `test:module-boundaries` has no
new edge, and no new class string exists for `check-class-resolution` to resolve. Specificity is 0,3,0 as before, and
no other sheet targets the card under 768px, so cascade order between the two sheets cannot change the result.

**Narrowing**, probe comment appended to the sheet, `--base HEAD`:

| Probe in | Projects | E2E specs | Unit files |
| --- | --- | --- | --- |
| `src/shell/PdfTool.module.css` (where the rule was) | 28 / 40 | 111 / 139 | 2 |
| `src/editor-ui/Workspace.module.css` (where it is) | 19 / 40 | 86 / 139 | 1 |
| for scale: a Sign-only sheet | 17 / 40 | 75 / 139 | |
| for scale: `PdfRedactTool.module.css` | 7 / 40 | 58 / 139 | |

86 is the Sign and Redact union: Sign's own reach (site, site-lib, so e2e/localized and e2e/offline) plus Redact's
e2e, with the site-wide specs every tool edit runs. The 25 specs dropped are Merge's 13, Compress's 5, Scan's and
Unlock/Protect's 2 each, Split's and Edit PDF's 1 each, and `e2e/cross-tool/page-grid-parity.spec.js` (page-grid tools only). The widen rule `shell-tool-css` only adds one unit test
(`shellPageRangeField.test.tsx`) and never widened e2e; the moved rule leaves its file, so it no longer fires for this edit.

## Closed

Closed 2026-10-29. The rule moved to `Workspace.module.css` and compiles to
`[data-tool-card][data-tool-loaded]:has(._workspace_…)` on `/sign/` and `/redact/` only (`/merge/` no longer carries it).
An edit to it now runs 86 specs instead of 111. `check:fast` and `check:push` (`PLAYWRIGHT_PORT=4791`) pass, and
`e2e/tool-layout.spec.js`, `e2e/tool-toolbars/` and `sign-toolbar-labels-fit.spec.js` pass on the build, 52 of 52,
the phone frame guard among them.
