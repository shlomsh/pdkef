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
- Row order from the top of the rail: file list with its own footer, the Sort select or the
  "rearranged" note plus Reset order on one line at a 320px rail (docs/ux-design-guidelines.md,
  section 4); "Draft saved" alone on its row, end-aligned; Add files and Clear all; Add page
  numbers checkbox as the last control above Download; Download; Share, Compress it, Sign it.
  (Corrected 2026-09-13; the first wording had "Draft saved" before the footer.)
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

## Update 2026-09-13 (measured)

Measured against `astro dev` on port 4399, chromium 1280x900 (desktop) and 1024x900 (rail-width
check), webkit iPhone 15 and chromium 375x812 touch (phone). Scripts in
`/private/tmp/claude-501/-Users-sh-work-pdkef/4c6086ae-78f2-4e95-bb71-1a97306192d0/scratchpad/m20/`
(`desktop.mjs`, `desktop2.mjs`, `share.mjs`, `thumbs.mjs`, `edge.mjs`, `edge2.mjs`) plus two reused
scripts one directory up (`tap-verify.mjs`, `popover375.mjs`), rerun fresh against this measurement
pass rather than trusted from an earlier log. Screenshots in the sibling `shots/` directory.

**Rail (desktop 1280).**

- No "Options" text, no "Saves as" text anywhere in the island: PASS (`noOptionsText: true`,
  `noSavesAsText: true` in `desktop.mjs`).
- Row order (not rearranged, sort visible): **MISS**. Measured top offsets: file list 248px, the
  sort-select row ("File order") 432px, "Draft saved" 480px, Add files/Clear all 513px, Add page
  numbers 561px, Download 617px, hand-off row 707px. The ticket's expected order puts "Draft saved"
  *before* the sort/Reset-order row; the built rail puts the sort row first and "Draft saved"
  second. Everything after "Draft saved" (Add/Clear, Add page numbers, Download, hand-off) is in the
  order the ticket lists. Screenshot: `shots/m20-rail-1280.png`. I could not get the grid into a
  genuinely rearranged state via keyboard in the time available (`ArrowRight` on a focused page cell
  did not reorder in my script), so the "note plus Reset order" variant of that row is unverified;
  only the "sort select" variant's position was measured, which already contradicts the expected
  order, so the row-order check fails regardless.
- All three hand-off buttons contain an `<svg>`: PASS (`handoffButtonCount: 2` chromium result was
  from a 2-file state where Share was absent because `canShare` was false in the default context;
  the real count with Share present is 3, all three carry an svg icon; see `share.mjs` below for
  Share specifically. Compress it/Sign it each returned `handoffSvgCounts: [1, 1]` in `desktop.mjs`).
- Rail width at 1024 viewport: PASS, measured 320px exactly (`railWidthAt1024: 320`).

**Rail (phone 375, webkit iPhone 15 and chromium 375 touch).**

- Phone "..." popover order: PASS. With the grid rearranged (moved a page left twice before
  opening the popover), `popover375.mjs` reads the popover's controls, in order, as: Add files,
  Clear all, Sort (label + native select), Reset order, Add page numbers, identical shape on
  `/merge/` and `/he/merge/` (Hebrew labels, same structure). This matches the ticket's expected
  order exactly.
- Popover fully inside the viewport: PASS. Outer rect x=29, right=346 inside a 375px viewport, on
  both `/merge/` and `/he/merge/`, both chromium and webkit.
- Popover end-anchored: PASS, confirmed in source rather than by rect alone (the LTR/RTL rects came
  out numerically identical because the popover is nearly full width with symmetric margins, which
  cannot by itself distinguish "anchored" from "centered"). `MergeDocument.module.css` sets
  `.chip-menu-body { inset-inline-end: 0; }`, a logical property that mirrors correctly for `dir:
  rtl`, which is the correct implementation for "end-anchored." Screenshot:
  `shots/popover375-final.png`.
- Share on webkit iPhone 15: PASS. `share.mjs` forced `navigator.canShare({files})` to `true`/`false`
  via `addInitScript` (plus a third run with the engine's real default, which was also `true`): with
  `true`, the hand-off row read `["Share", "Compress it", "Sign it"]`; with `false`, `["Compress it",
  "Sign it"]`, Share absent, not a disabled/broken button.

**Heading (WYSIWYG), desktop.**

- At rest: 16px, weight 700, border `none`, background transparent, `contenteditable="false"`: PASS.
- Click puts it into `contenteditable="plaintext-only"` with `role="textbox"`: PASS. Typing grew the
  span's width (169px to 181px) with height unchanged (25.59px both times) and no border/background
  appearing, i.e. no box-model jump, only the natural text-flow growth: PASS by the "no layout jump"
  reading of the acceptance line (a contenteditable span's width necessarily changes with its text;
  the check that matters, no added border/background/height change, held).
- Enter commits the value and the Download element's `download` attribute follows it: PASS
  (`renamedDownloadAttr: "merged_R xeceipt scan.pdf"` in `desktop2.mjs` after typing " x" and
  pressing Enter). Note the inserted text landing after "R" rather than at the end is a test
  artifact (`.click()` placed the caret at its default position, not explicitly moved to the end
  with select-all/End); it does not indicate a product bug, only that my script did not force
  cursor placement. The attribute update itself is confirmed live.
- Hebrew name "דוח מס הכנסה 2025.pdf" as the first file: heading reads exactly
  `merged_דוח מס הכנסה 2025`, computed `unicode-bidi: plaintext`, `dir="auto"` on the span, and the
  download attribute is `merged_דוח מס הכנסה 2025.pdf`: PASS. Screenshot:
  `shots/m20-heading-hebrew.png`.

**Naming.**

- Two files: `merged_<first>.pdf`, PASS (`merged_Invoice March.pdf`).
- One file: the Download element is `data-state="one-file"` with no `href`/`download` at all by
  design (MERGE P1 fix already landed: no merge is possible with a single file), so the naming
  check cannot be measured off the `download` attribute. The heading itself still reads
  `merged_Invoice March` in that state, which is the only place the name is visible. Flagging this
  gap in the ticket wording to the lead rather than guessing: is "one file: `merged_<name>.pdf`"
  meant to describe the heading text (PASS, confirmed) or a real download link (does not exist in
  this state)?
- `a+b.pdf` as a source name: **MISS**. Expected "never a `+` in a file name even when a source name
  contains one (the sanitiser rejects it)." Measured result: `merged_a+b.pdf`, "+" intact.
  `sanitizeOutputName` in `src/lib/mergePlan.ts` only strips `\/` and control characters
  (`raw.replace(/[\\/]/g, '').replace(/\p{Cc}/gu, '')`); it has no "+" handling at all. This is a
  genuine miss, not a measurement error.
- Same literal `merged_` prefix on `/he/merge/`: not re-verified as a separate naming case this pass
  (time budget), but the popover-order script above ran unmodified against `/he/merge/` and showed
  the same Hebrew-message structure with no separate download-prefix regression signal.

**Page controls on a phone (both webkit iPhone 15 and chromium 375 touch).**

All PASS, via `tap-verify.mjs`: tapping a page cell's thumbnail selects it
(`selected: [false, true, false, false, false]`) with zero pixel change in any cell's rect
(`reflow: false`), reveals its `.actions` cluster only (`visibleClusters` matches `selected`
exactly), every control in that cluster measures a real 44x44 hit box
(`buttons: [{w:44,h:44,hitsSelf:true} x3]` for rotate/skip/open), no visible action cluster
intersects a neighbouring cell's rect (`overlapWithVisibleNeighbour: false`), tapping a different
cell moves the selection (`moved: [false,false,false,true,false]`), and tapping outside (the h1)
clears it (`clearedAfterOutsideTap: true`). No element with the text "Edit pages" was found (that
mode does not exist in this build). Screenshots: `shots/tap-webkit.png`, `shots/tap-chromium.png`.

**Thumbnails.**

Six files (five 1-page, one 12-page), chromium 1280: first thumbnail at 268ms, all 17 at 535ms
(both PASS against 400ms/1000ms budgets, and close to the builder's own claimed
254ms/550ms). Draft restore at 375 after reload: first row visible at 357ms (PASS against 800ms).
All three in `thumbs.mjs`.

**Still never exercised, now exercised.**

- Encrypted file row: PASS. Injected a real `doc.encrypt({ userPassword: 'secret' })` fixture
  alongside two normal files; the row reads "'encrypted.pdf' is password-protected. Remove the
  password first, on your device, then add it again." with an "Unlock" link and "Remove it and
  merge the rest," i.e. the real encrypted-file error path, not a silent pass-through. Screenshot:
  `shots/m20-encrypted-row.png`.
- Pointer drag on the grid (1280, mouse down/move x3/up): PASS, order changed
  (`["a","b","c"] -> ["b","a","c"]` by source file per page's aria-label). The drag from cell 1 to
  cell 3's position produced a swap of cells 1 and 2 rather than a full move-to-end; recorded as-is,
  not investigated further given the time budget, flagging in case the lead wants the exact
  SortableJS drop-index behaviour double-checked.
- Paste: PASS. Dispatched a real `ClipboardEvent('paste')` on `document` with a `DataTransfer`
  holding a PDF `File`; the grid went from 2 to 3 pages.
- Folder drop: not attempted, Playwright's `setInputFiles`/DataTransfer APIs do not model a real
  OS folder drop and reproducing the browser's own folder-expansion behavior was out of scope for
  the time available. Marking unfinished per the ticket's own allowance to skip this one.
- Duplicate nudge: PASS. Message reads `"dupe.pdf" is already in the list.` with an "Add anyway"
  link, matching `toolMessages.ts`'s `alreadyAdded`.
- Size-cap error: **inconclusive, not a clean PASS or MISS**. No size-cap constant exists anywhere
  in `src/lib/merge.js` or `PdfMergeTool.tsx` (grepped for `MAX_`, `_CAP`, `SIZE`, `LIMIT` and
  variants; nothing matched). `errorTooLarge` in `toolMessages.ts` exists but is wired to a generic
  `prepared.status === 'error'` catch-all, not to any measurable byte threshold. I built a
  3000-page/1.2MB synthetic "large" file (pdf-lib compresses blank pages far too well to produce a
  real large file quickly) and it merged successfully with no error, which does not prove there is
  no cap, only that I could not reach it in the time available. Flagging to the lead: either there
  is no implemented size cap yet (worth its own ticket) or it lives somewhere I didn't grep.
- Install line after first download: PASS. Clicked the ready Download link, then measured
  `[data-install-line]`'s text: "This page is saved in your browser now, so merging works even
  without a connection. To keep it on your home screen, look for Install or Add to Home Screen in
  your browser menu." matching `installLine` + `installOther` in `toolMessages.ts`; `data-state`
  moved to `"saved"`.
- Hebrew tag-name floor, desktop WebKit: PASS. `.cell-tag-name` measured 87.2px wide at an 11px
  font-size; a same-font `0` probe measured 7.41px per character, so the floor holds at roughly
  11.8ch, well above the 6ch minimum. Screenshot: `shots/m20-hebrew-tag-webkit.png`.

**Not measured this pass, listed rather than silently skipped:** PDF Title metadata inside the
downloaded bytes (would need parsing the merged PDF itself, not just the `download` attribute); the
rearranged-note variant of the rail row order (see MISS above); a second naming pass on
`/he/merge/` beyond what the popover script incidentally covered.

## Open decisions for Shlomi, not for the agent

- Keep a count in the name or not: `merged_X.pdf` (chosen) versus `merged_X and 5 more.pdf`.
- Download and Share side by side in the phone sheet, or Download full width with Share first
  below (current).

## Done means

Each check above has a measured number or a screenshot in an update line here, every miss is
either fixed on the branch or filed as its own ticket, and only then is the branch merged into
`main` (regenerate `BACKLOG.md` and `TODO.md` with `npm run generate:backlog` on conflict, never a
hand merge).

## Update 2026-09-13 (lead's reconciliation of the two misses)

- Row order: not a miss; the reviewer confirmed the check's wording was wrong and it is corrected
  above. The decision as relayed from Shlomi puts the file list, then the Sort select or the "rearranged" note with Reset
  order on one line, then "Draft saved" alone and end-aligned, then Add files and Clear all. The
  rail measured above (list 248, File order 432, Draft saved 480, Add files 513, Add page numbers
  561, Download 617, hand-offs 707) is that order. The check's wording is corrected here rather
  than the rail.
- "+" in a source name: fixed on `claude/merge-tool-polish-m20`. `sanitizeOutputName` now drops
  "+" (and collapses the spaces around it) and `mergedTitle` routes the derived name through it,
  so `a+b.pdf` gives `merged_ab.pdf` and `Q1 + Q2 report.pdf` gives `merged_Q1 Q2 report.pdf`;
  a name that sanitises to nothing falls back to `merged_merged.pdf` instead of `merged_.pdf.pdf`.
  Unit test in `merge.test.js`.
- Size cap: the reviewer clarified it is the draft path, `MERGE_DRAFT_MAX_BYTES` (200 MB) in
  `src/editor/workspace/draftStore.js`, not the merge path. The chain is covered end to end:
  `draftStore.test.js` proves a set over the cap resolves false without writing, `useMergeDraft.test.tsx`
  proves the hook turns that into `draftSaveState: 'error'`, and a new island test in
  `PdfMergeTool.test.tsx` proves the rail's status row then reads "Draft not saved" (Hebrew
  "הטיוטה לא נשמרה") in place of "Draft saved". Not silent. PASS.
- One-file naming: the heading already reads `merged_<name>` with one file; the download itself
  needs two files, so the download attribute cannot be read there. PASS on the heading.
- Preview dialog, same branch (Shlomi, 2026-09-13, "open the preview so it takes more of the
  desktop screen"): now 92vw by 92vh with the stage filling the dialog, render width = stage width
  times devicePixelRatio capped at 2400. Measured 1440x900 on /he/merge/: dialog 1325x828, stage
  1325x763, portrait page 517x731 rendered at 2400x3396; stepping keeps the dialog rect; closed
  dialog computes to display none and the grid takes the click underneath. Phone 375: dialog
  345x747, chevrons at x 43 and 332.
