---
id: "MEM-03"
title: "Home page and Replace: no warning when opening a file, Replace always confirms and says the file stays"
status: "done"
priority: "P1"
epic: "one-memory-space"
phase: "near-term"
depends_on: ["MEM-01"]
legacy_state: "Open"
---

# MEM-03 · Home page and Replace: no warning when opening a file, Replace always confirms and says the file stays

*Filed 2026-09-15.* The user-facing half of MEM-01. Two decisions from Shlomi, taken 2026-09-15:

1. **No warning on the home page.** Opening a file (recent tile, picker, drop, sample) overwrites
   nothing once work lives on the entry, so `FileDropzone`'s "Open this instead?" `ConfirmDialog`,
   `pending`, `renderConfirmBody` and the `confirmHandoff*` messages (English and Hebrew) go. The
   hand-off simply sets the pointer and navigates. `openRecent`'s same-file shortcut is no longer a
   special case.
2. **In-tool Replace always confirms**, not only when `hasWork`. This supersedes the 2026-08-08 rule
   ("confirm only when the file has been edited") because the dialog's meaning changed: it no longer
   protects work, it catches an unintended click, and it says so. The ordering stays: ask, then the
   picker; a dropped file asks afterwards because it arrives already chosen. `costsSomething` in
   `BasePdfTool.tsx` drops the `hasWork` term (keep `!multiple`: adding to Merge's list still costs
   nothing).

## Copy (voice: warm, plain, no em dashes)

Replace dialog, replacing `replaceOpening` / `replaceChoosing` / `replaceTail`:

- title: "Open a different file?"
- body, picker path: "This closes {current}. It stays in your recent files with everything you've
  done, so you can come back to it from the home page."
- body, drop path: "Opening {file} closes {current}. It stays in your recent files with everything
  you've done, so you can come back to it from the home page."
- confirm: keep `replaceConfirmFile` / `replaceConfirmChoose`.

Hebrew twins are an AI draft with the LOC-09 caveat, pending Shlomi's read-through.

The `/sign/`, `/redact/`, `/merge/` and home FAQ entries about drafts and crash recovery are re-read:
the promise is the same ("close the tab, come back, it's where you left it") and now also covers
"open another file and come back to the first"; JSON-LD stays in step with on-page text
(`npm run test:seo`).

## Acceptance

- Playwright on the home page: with work on file A in Sign, open recent file B into Sign; no dialog,
  B opens; back on the home page A's tile still opens A with its work.
- `BasePdfTool.test.tsx`: Replace confirms with and without work; a drop confirms after the fact.
- `check:fast`, then the full `ci.yml` chain once before the push.

## Updates

- 2026-09-15: done (05c3b11). Dialog and its messages gone; a recent tile sets the pointer and hands
  off, a Merge tile sets the pointer and navigates. Replace always asks with the copy above;
  `hasWork`/`workNoun` removed from `BasePdfTool` and every tool. Sign FAQ and the home autosave
  blurb updated (JSON-LD in step, `test:seo` green); `he/sign.yaml` and `he.yaml` twins are AI drafts
  with recomputed `sourceHash`, pending Shlomi's read-through. Full `ci.yml` chain green locally
  including Playwright (151 product + 5 perf + 134 font).
