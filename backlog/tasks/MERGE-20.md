---
id: "MERGE-20"
title: "Measure the Direction A closing wave against its acceptance lists before the branch merges"
status: "open"
priority: "P1"
epic: "merge-tool"
phase: "near-term"
depends_on: ["MERGE-03", "MERGE-09", "MERGE-11", "MERGE-13", "MERGE-14"]
legacy_state: "Open"
---

# MERGE-20 · Measure the Direction A closing wave against its acceptance lists before the branch merges

*Filed 2026-09-13* at wrap-up. The builder session on `claude/merge-tool-epic-adaab1` was still
landing its last wave (rail reorder, Options dissolved, WYSIWYG heading, `merged_` naming, phone
popover, tap-to-reveal page controls, shared pdf.js worker for thumbnails) when the day ended. Its
reports are claims until measured. Method: `docs/ux-design-guidelines.md` "How we review"
(real browser, getBoundingClientRect and getComputedStyle, 1280 and 375, fixtures injected through
the real file input; the injector is described in `docs/merge-review-2026-09-13.md`). Run against
`astro dev` on port 4399 in that worktree, not the 4173 preview.

## Checks

**Rail (desktop 1280, phone 375).**

- No element whose text is "Options" and no "Saves as" text anywhere in the island.
- Row order from the top of the rail: file list; "Draft saved" alone on its row, end-aligned; note
  plus Reset order on one line at a 320px rail; Add files and Clear all; Add page numbers checkbox
  as the last control above Download; Download; Share, Compress it, Sign it.
- All three hand-off buttons contain an `<svg>`; their border is the subject of MERGE-19.
- Phone "..." popover lists exactly Add files, Clear all, Sort, Reset order (only when rearranged),
  Add page numbers, in that order; popover is end-anchored and fully inside the viewport.
- Share renders on a phone where `navigator.canShare({ files })` is true and is absent, not
  broken, where it is false.

**Heading (WYSIWYG).**

- The document heading reads `merged_<first file base name>` and is the designated file name; at
  rest it has the heading's own font-size and weight, no border, no background, no pencil in the
  text; clicking it edits in place (`contenteditable="plaintext-only"` or equivalent) with no
  change to its bounding rect while typing; it wraps at 375; a Hebrew name is not split from its
  Latin prefix (FSI/PDI or `<bdi>` isolation, `unicode-bidi: plaintext`).
- Download's `download` attribute and the PDF Title follow the edited name; ".pdf" is not part of
  what the person edits.

**Naming.**

- Two files: `merged_<first>.pdf`. One file: `merged_<name>.pdf`. No count, no "+", never a "+" in
  a file name even when a source name contains one (the sanitiser rejects it). Same literal prefix
  on `/he/merge/` (settled: Sign's `signed_` is unlocalised too).

**Page controls on a phone.**

- A tap on a page cell reveals its controls without reflowing the grid; no control overlaps a
  neighbouring cell (the previous build put the actions row 27px into the next cell); each control
  has a 44px hit area; no "Edit pages" mode exists.

**Thumbnails.**

- Six files (five one-page, one twelve-page): first thumbnail under 400 ms after the input change,
  all 17 under 1 s; draft restore at 375 shows the first row under 800 ms. The builder measured
  254 ms / 550 ms / 485 ms with one shared `PDFWorker`; `e2e/merge/merge-thumbnail-throughput.spec.js`
  holds 2.5 s.

**Still never exercised by a reviewer** (from `docs/merge-review-2026-09-13.md`): the encrypted-file
row with the repo's encrypted fixture, pointer drag on the grid, paste, folder drop, the duplicate
nudge, the size-cap error, the install line after a first download, the Hebrew tag-name floor on
desktop WebKit (Safari, not Chromium).

## Open decisions for Shlomi, not for the agent

- Keep a count in the name or not: `merged_X.pdf` (chosen) versus `merged_X and 5 more.pdf`.
- Download and Share side by side in the phone sheet, or Download full width with Share first
  below (current).

## Done means

Each check above has a measured number or a screenshot in an update line here, every miss is
either fixed on the branch or filed as its own ticket, and only then is the branch merged into
`main` (regenerate `BACKLOG.md` and `TODO.md` with `npm run generate:backlog` on conflict, never a
hand merge).
