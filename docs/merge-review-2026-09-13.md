# Merge tool review, Direction A build, 2026-09-13

For the agent building `claude/merge-tool-epic-adaab1`. Reviewed at commit `97a2a6e` as served by
`npm run preview` on port 4173, desktop 1024 wide and phone 375 x 812, with six files injected
through the real input: five one-page scans (two with Hebrew names), a twelve-page report with one
landscape page, and one file meant to be encrypted (see "Not verified"). Every claim below was seen
on screen or measured with getBoundingClientRect and getComputedStyle. Earlier context: the critique
at `.impeccable/critique/2026-09-13T08-01-12Z__src-components-pdfmergetool-tsx.md`, the direction
in `docs/merge-direction-a-spec.md`, the sketch in `docs/merge-direction-a-sketch.html`.

## Where it stands

The direction is right and most of the critique is closed. Above the first thumbnail there is now
only the heading and the count. The rail is quiet. One Download element carries the real numbers.
Page moves across files work by keyboard, rotate and skip work, each gets an Undo chip, the grid
switches to tag dots when files stop being contiguous and offers Reset order, the preview dialog
opens with showModal, the hand-off to Compress delivers the merged file, and the draft comes back
after leaving the page. The phone sheet is one row. This is a tool I would use.

What is left is one structural miss and a handful of finishes. The structural one matters most,
because it hits the most common merge there is.

## Findings, ranked

### P1. The document still reads as a list when files are short

Five one-page scans produce five rows: label at the left, one thumbnail in the middle, two thirds of
the row empty; each row is about 115 px tall on desktop and about 200 px on a phone. One-page scans
are the most common merge (receipts, forms, signed pages), so this is the main case, not an edge.
The twelve-page run is right: caption row, then a four-column flow.

Fix: one continuous wrapping grid for every page, left to right, in output order. A file's label is a
small tag (colour dot plus name, truncated) sitting above the first page of its run, in the same cell
column; a full-width caption row only for a run of four pages or more. Five one-page files fit in
one row on desktop and two rows of four on a phone, and every thumbnail sits on the same column
grid. Landscape pages take a landscape cell of the same height as the portrait cells (fixed cell
height, width by aspect), so rows stay level; today page 7 is a wider cell that breaks the row and,
after a rotate, the rotated thumbnail shrinks inside a portrait box.

Acceptance: with five one-page files, all five thumbnails are on one row at 1024 wide; no row on
the page has more than one distinct thumbnail x-origin per column; landscape and rotated pages keep
the row height.

### P1. The output name drifted from the decision

Options shows "Saves as merged_Receipt scan.pdf" and the download attribute is
`merged_Receipt scan.pdf`. The decision recorded in the plan and the tickets is
`<first file base name> + N more.pdf` (N = other files), PDF Title the same without the extension,
one localized template in toolMessages so the Hebrew edition can phrase it. With one file, the name
is just the file's own base name.

### P1. The one-file state still ships a dead button and hand-off buttons

With one file loaded the rail shows a grey "Add one more PDF to merge" button (disabled look, the
largest element in the rail, the contrast problem the critique measured at 1.25:1), plus "Compress
it" and "Sign it", which make no sense before there is a merged file, plus Options. The spec's
one-file state is text with a real action: "Add one more PDF to merge" as a sentence and a
"Choose files" button that opens the picker. Hand-off and Options appear only once Download is
possible.

### P2. Hebrew file names are still reordered and truncated at the wrong end

Caption reads "pdf.2025 אישור שנתי למס הכנסה", the rail row shows "...2025 אישור שנתי למס הכנסה"
with the ellipsis on the left. Both need `unicode-bidi: plaintext` (and an ellipsis that lands on
the visual end), the way `ToolShell.module.css` `.name` already does it. The chips on the phone have
the same problem. This is unchanged from the critique's P2.

### P2. The preview dialog and the heading disagree on the page count

With one page skipped the heading says "16 pages · 1 page skipped" and the dialog says
"Page 3 of 17". Pick one meaning: the dialog should count output pages and show a skipped page as
"skipped" in its title, or count all pages and say so ("3 of 17, 1 skipped"). Also, at the first and
last page, Previous and Next look identical whether or not they are disabled (same fill, same text
colour, opacity 1); give `.secondary:disabled` a real state.

### P2. Phone details

- Page controls in Edit pages mode measure 32 x 32 with a 4 px gap; the rest of the tool holds 44 px.
  Keep the 32 px glyph and give each a 44 x 44 hit area.
- The file chip row scrolls sideways with no affordance that it scrolls (the third chip is cut at the
  edge) and there is no "more" chip; Sort, Clear all and Add files were not reachable on the phone in
  my pass. Either an overflow chip or put Sort and Clear inside Options on phones.
- The per-file row layout (label above, thumbnail left, 60 percent of the width empty) is the same
  structural miss as the desktop one and is fixed by the same flow grid.
- After coming back to the page, thumbnails show as dashed placeholders for several seconds ("0
  rendered"); on the phone this is the whole first screen. Render the first visible row before the
  rest and, if cheap, keep the first page's preview in the draft meta so the return is not blank.

### P3. Finishes

- The desktop empty state is still the 611 px dashed void. The spec asks for a 260 px band with three
  ghost page outlines, "Drop PDFs here, or paste", the privacy line, and Choose files.
- Hover controls (rotate, skip, open) have aria-labels but no tooltip; add `title` or a visible label
  on focus.
- Hand-off buttons: "Compress it" and "Sign it" are the right verbs, but they read as peers of
  Download. Make them clearly secondary (same row as Share on desktop, quieter fill).
- After a hand-off and return, "Picked up where you left off · Start fresh" sits under the rail's
  links; that is fine, but on first restore it should also appear once near the heading, since the
  rail is below the fold on a phone.

## The flow, step by step

1. **Arrive.** Desktop: H1, one subhead, then the box. Good. Phone: Choose files inside the first
   screen. Good.
2. **Add.** Six files landed, thumbnails rendered progressively, count ticked. Good. Duplicate and
   non-PDF paths not exercised this pass.
3. **Arrange.** Keyboard: arrows move across files, R rotates, Delete skips, every action announces
   and gets an Undo chip. The grid's switch to tag dots is honest and Reset order brings captions
   back. Good. Pointer drag was not exercised this pass.
4. **Download.** Ready with real numbers; the name is wrong (P1 above). The preparing state was too
   fast to catch on a 17-page set, which is the point; check it once with a 200-page set.
5. **Continue.** Compress it opened Compress with the merged file loaded. Good. Sign it not
   exercised.
6. **Return.** The set, order, skip and rotation came back; the restore line appeared. Good, apart
   from the blank first seconds on the phone.

## Not verified, needs the builder's own check

- The encrypted-file path (MERGE-04): my fixture rendered in pdf.js without a password, so it was not
  actually encrypted, and I could not see the error row. Test with the repo's encrypted fixture.
- Pointer drag on the grid, paste, folder drop, duplicate nudge, the size-cap error.
- The install line after a first download (downloads are blocked in the review browser).

## Acceptance for the next pass

- Five one-page files: one row of five thumbnails on desktop, two rows on a phone, one column grid.
- Download name "Receipt scan + 5 more.pdf", Title to match, localized template.
- One file: sentence plus Choose files; no hand-off, no Options until two files.
- Hebrew names correct in caption, rail and chips; ellipsis on the visual end.
- Dialog count agrees with the heading; disabled Previous/Next look disabled.
- Phone page controls 44 px hit area; Sort and Clear reachable on the phone.
- Empty state per the spec.
- Screenshots at 1024 and 375 for: five one-page files; the twelve-page set with one page moved,
  one rotated, one skipped; one file; empty.
