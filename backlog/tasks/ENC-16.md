---
id: "ENC-16"
title: "Locked-file state polish: Merge's calm notice, the panel's sizing, focus ring and file name"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# ENC-16 · Locked-file state polish

Filed 2026-10-26 from an independent visual QA pass on the locked-file panel shipped with SEO-47
(`src/shell/NeedsUnlock.tsx`), asked for by Shlomi after seeing Merge's locked state at 1280.

## What changes

- Merge with a locked file among several: the output is named after the first file that can be merged,
  and the red "That didn't work." banner becomes a calm notice with an Unlock button and a quiet
  "Remove it and merge the rest".
- Merge with one locked file: the rail no longer offers "Add one more file to merge"; the locked row is
  calm (a lock in place of the page count) instead of red; a one-row file list has no blank band under it.
- The panel: the file name keeps its end (shared `FileName`), Replace is the quiet line the loaded page
  tools use, the title sits below the page h1 in size, lines are balanced, the focus ring has a gap, the
  mint matches the rail's, and its floor drops from `min(34rem, 64vh)` to `22rem`.
- The Replace line's styles move to `ReplaceFileLine.module.css`, so Sign, Redact and Compress (no page
  workspace) don't carry `PageWorkspace.module.css` for it.
- Merge holds the heading and the one-file box while the lock probe runs (no flash before the panel), and
  the locked row and chip say "This PDF is protected" to a screen reader.

Not changed: a centred, capped panel on wide single-card tools was tried and dropped. It left 167px of
white at the sides against 16px above and below, so the panel keeps filling the card as the loaded tool does.
Also not changed: Sign at 390 with a mouse pointer keeps its full intro (the QA capture's "below the fold"); on a
touch phone the intro folds and "Unlock it" sits at y=536 of 844, the same as a loaded Sign.

## Acceptance

- [x] Failing tests first for the behaviour changes (output name, no one-file box, calm notice, locked row,
      file chip, Replace line); `check:fast` green
- [x] Screenshots at 390 and 1280: Merge (one locked, locked + plain), Organize, Sign, Hebrew Merge
- [x] Fresh reviewer pass; CI green after landing

## Review (2026-10-30)

A fresh reviewer read 36e2ac51 against the current code (Merge has since split into components and hooks) and
found no defect: the output name skips a locked leader (`PdfMergeTool.tsx`), the calm notice is `role="status"`
(`MergeNotices.tsx`), and `useLockedProbe.ts` drops a stale probe when the file is removed or replaced. CI was
green on the landing push (7764998f, run 40397071709). Two notes, neither a change:

- When the probe cannot classify a single locked file, Merge shows the inline notice with the one-file box. That is
  the fallback `useLockedProbe.ts` documents, and adding a file leads to "Remove it and merge the rest".
- With an unreadable file listed before a locked one, the red unreadable banner shows first and the locked
  file's Unlock notice waits until it is removed (`mergeView.ts` reports the first failed entry). Unchanged
  from before this ticket.
