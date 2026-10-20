---
id: "MOBI-38"
title: "Sign and Redact: the file name scrolls, the toolbar stays"
status: "retired"
priority: "P2"
epic: "polish"
depends_on: []
---

# MOBI-38 · Sign and Redact: the file name scrolls, the toolbar stays

*Filed 2026-10-20, from Shlomi's phone review of Redact. Retired the same day, before any
code: the 42pt it was written to reclaim does not exist on a phone. Kept as the record of why,
so the measurement is not redone.*

## Why this is retired

The band under the file name is not a file-name row. On a phone it is the **status row**, and the
file name is only its tenant while nothing is armed. `ToolShell.module.css`'s `@media (max-width:
559px)` block puts `.editor .text` (the name) and `.editor .status` (the armed-tool hint, the "Stop"
chip, Redact's undo chip) in **one grid cell**, and `data-status-active` swaps which one is visible.
The comment above it says why in as many words: the cell's height is the max of both in every state
*so that arming cannot move the toolbar under it*, which `editor.md` requires for the second click of
a double-click, and `visibility` rather than `display` keeps the hidden name contributing its height.

So scrolling the name away reclaims nothing. The row has to stay for the hint and the Stop chip,
it is already sized to the taller of the two states, and the name costs no height of its own. The
measured 573pt stands, and the 615pt in the plan below was never available.

What the plan got right and is worth keeping: the rejections in "What was considered and rejected"
were each measured, and the band table is accurate. The error was reading a 156pt sticky card as
"identity + toolbar" from its DOM, without reading the phone stylesheet that collapses the first
into the tool's own status line.

**If the working area is worth another look**, the honest targets are the toolbar's two rows (which
Shlomi has chosen to keep for their labels) or the 63pt above the card, not this row.

---

*The original plan follows, unchanged.*

## Problem

Measured on the iPhone 17 Pro simulator in real Safari, 402x874pt, with the document scrolled so the
editor is in its steady state:

| band | points |
| --- | --- |
| above the sticky shell (status bar, page top) | 63 |
| the sticky shell itself | 156 |
| the page, from the shell to Safari's chrome | **573** |
| Safari's collapsed bottom chrome, from | 792 |

The sticky shell is `.shell.editor` in `src/shell/ToolShell.module.css`: one glass card, `position:
sticky; top: 1rem`, holding the identity row (file name, size, the draft-saved chip) **and** the
toolbar. The identity row is a status line. It never changes while a person works, it is not a
control, and it holds about 42pt of the screen for the whole session.

Both editors mount this same shell from their own toolbar component (`SignToolbar.tsx:447`,
`RedactToolbar.tsx:188`), so one change serves both and they cannot drift apart.

## What was considered and rejected

Measured before settling, so the next person does not reopen them:

- **Collapsing the toolbar to one row.** Gains 50pt but costs the labels, and
  `docs/ux-design-guidelines.md` §7 wants a word on a control, not an icon alone. Shlomi's call:
  keep both rows and their text, it is more self-explanatory.
- **Pinning Download and Share to the bottom of the card** (§18.6, the Compress pattern). Costs about
  62pt permanently, which is more than the toolbar row it was paying for: 561pt against today's 573.
  It also fights Safari's own bottom chrome, which collapses and returns on scroll. The pair stays in
  the flow under the document, where scrolling to the end brings it up on its own.
- **Moving Undo, Redo, Peek or Full screen out of the toolbar.** Redistributes rather than gains, and
  `docs/sign-next-gen-guidelines.md` §6 settles that Undo and Redo stay visible. Replace stays in the
  toolbar too: on the file-name row it would scroll out of reach.

## What changes

One structural change, in the shared shell, so Sign and Redact get the same thing.

1. **`ToolShell`'s `editor` branch renders two siblings instead of one card:** the identity block,
   which scrolls, and a sticky block holding the tool's status line and its controls. The pages
   already follow as siblings inside the workspace, so the sticky block's containing block spans the
   whole scroll area. Making `.controls` sticky inside today's short `.shell` card instead would pin
   it only as far as the bottom of that card, which is the trap to avoid.
2. **The glass treatment follows the sticky block.** The identity becomes a plain line above it.
3. **`data-tool-shell` moves to the sticky block**, which keeps `[data-tool-shell] [role="status"]`
   working (`redact-saved-work-restore-acceptance.spec.js:211`). The draft-saved chip then sits
   outside it, so the specs that scope "Draft saved" to `[data-tool-shell]` assert it on the page
   instead: `redact-check-remove-sticks.spec.js:83`, `redact-draft-restore.spec.js:103,158`,
   `redact-saved-work-restore-acceptance.spec.js:162`, `sign-draft-restore.spec.js:121`,
   `sign-saved-work-restore-acceptance.spec.js:154`, `per-document-style.spec.js:291`. The
   non-editor branch keeps `data-tool-shell` exactly where it is, so Compress, Merge and Security are
   untouched.
4. **The full-screen phone rule follows the sticky element.** `.workspace:fullscreen >
   [data-tool-shell] { top: 0 }` in `Workspace.module.css` currently kills a duplicate inset; it has
   to target whatever is sticky after the split.

Expected result: the sticky band drops from 156pt to about 114pt, and the page gets **615pt against
573pt today, +42pt**.

## Acceptance

- A phone e2e for each tool, scrolled into the document: the toolbar is still at the top of the
  viewport and the file name is not. One spec per tool, since a spec under a tool's own `e2e/` may
  only visit that tool's page (`docs/module-boundaries.md` rule 7).
- The same spec measures the page band and fails if it is not at least 40pt larger than the sticky
  band it replaced. Asserted as a band, never a font-dependent pixel count (`.claude/rules/tests.md`).
- `toolbar-phone-row.spec.js` still passes: the editor card stays one row over the grid, and arming a
  tool still moves nothing (`toolbar-arm-no-shift.spec.js`).
- Nothing is re-parented after load, and the first paint already has the split, so there is no CLS.
- `npm run check:push`, then `npm run check:e2e`.

## Still open, not in this ticket

Shlomi, 2026-10-19: the toolbar's Download and Share turn teal the moment a draft restores, so the
"ready" signal arrives with no intent behind it. `.claude/rules/editor.md` settled on 2026-10-19 that
teal means ready, so changing it is a decision about that rule, not a layout fix. Needs its own
ticket.
