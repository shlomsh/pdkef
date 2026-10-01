# Merge tool, Direction A: the document is the centre

Chosen by Shlomi on 2026-09-13 after the critique of the first build (worktree
`merge-tool-epic-adaab1`, critique snapshot at
`/Users/sh/work/pdkef/.impeccable/critique/2026-09-13T08-01-12Z__src-components-pdfmergetool-tsx.md`).
Sketches: canvas https://claude.ai/code/artifact/f3ddd3cb-7415-42b7-932c-e2b09c86e216 (boards "A in
detail · desktop / phone / states"); full-size page https://claude.ai/code/artifact/d7901058-0aad-4cca-83eb-5078b7c5adcb;
artboard sources in `/private/tmp/claude-501/-Users-sh-work-pdkef/cf156355-7975-432f-bfde-f80ef43b6397/scratchpad/merge-sketches/`
(`ADetail.dc.html`, `ADetailPhone.dc.html`, `AStates.dc.html`; plain HTML with inline styles).

## The principle

The output is the centre. The pages that make up the merged document take the workspace and the real
estate says so. Input files are a rail you glance at, never the thing you scroll through. Everything the
critique scored low (status visibility, recognition, hierarchy, consistency) follows from that one move.

## Desktop layout (1024px and up)

Two surfaces only, no card inside a card:

1. **Add bar** (48px, dashed, full width, replaces the 128px identity card and the sort toolbar):
   left "Drop PDFs anywhere on this page, paste them, or [Choose files]"; right, the restored-draft line
   when there is one ("Picked up where you left off · saved 4 min ago · Start fresh"), otherwise nothing.
2. **The document** (white surface, fills the remaining width): heading "Your merged PDF · 18 pages,
   16 rendered" (the render count ticks; this is the status visibility the button no longer has to
   carry). Header right: the **Undo chip** ("Skipped page 7 · Undo", 5 s, same pattern as file removal,
   covers rotate, skip and page moves), "Jump to file" menu, and a shortcuts line ("← → move · R
   rotate · Del skip") shown on pointer devices.
   The grid wraps (no horizontal strip). Each file's run starts with a **caption row**: colour tag,
   file name (bidi plaintext), "pages 6 to 18 · 9.6 MB", a rule, then "rotate all · remove". Captions
   replace the hidden per-page tag; they also act as anchors for "Jump to file" and for the rail.
   When a page crosses a file boundary, captions disappear for the affected run and a visible 10px tag
   dot appears above each page's number instead; the rail shows "Pages rearranged across files · Reset
   order".
3. **The rail** (320px, tinted `--color-primary-tint`, sticky for the whole page height): "Files, in
   order" list at 44px per row (grip at `--color-muted` contrast, tag, name with `unicode-bidi:
   plaintext`, page count, remove at `--color-muted`), click a row to scroll the grid to its caption,
   drag to move the whole run. Below the list: Sort menu and Reverse as small buttons, "Add files ·
   Clear all" as quiet text. Then, pinned to the rail's bottom: Options disclosure (Add page numbers;
   "Saves as <name>.pdf" with an inline edit), the **Download element**, then Share, Compress it, Sign
   it as three equal secondary buttons (not underlined footnote links).

## The Download element: one element, four states, same size and place

- **One file:** not a disabled button. Text "Add one more PDF to merge" with a real "Choose files"
  action.
- **Preparing:** same box, tinted fill, honest label "Preparing 18 pages…" with the render progress
  under it, `aria-busy="true"`, inline ring. A tap queues the download and delivers on ready.
- **Ready:** primary, "Download merged PDF" with "18 pages · 9.6 MB" under it at full white (no 0.85
  opacity; the current 3.88:1 fails AA). The check draws once, on the first ready; re-prepares after
  an edit swap the label without remounting and never replay the animation.
- **Saved:** success tint, "Saved · Invoice March + 2 more.pdf · download again"; the install line
  appears once, here.

## Page cells

- 64 x 84 cell on desktop, 4 columns on a phone; real aspect inside the cell, landscape shown landscape
  at full cell width (never scaled to 75%).
- Hover, focus or "Edit pages" on touch reveals a three-button cluster above the cell: rotate, skip,
  open. Visual size 32px, hit area 44px, focus ring offset 2px.
- Skipped: dimmed, dashed border, number struck, the word "skipped" under it, tap to bring back.
- Locked or unreadable file: its caption row becomes the error ("This file is encrypted. Open Unlock ·
  Remove it and merge the rest"); its pages render as placeholders with a lock glyph.
- Dragging: 2px insertion line; the ghost carries the position it will take. SortableJS commits once on
  drop (gesture rule). Keyboard: arrows move, R rotates, Delete toggles skip, live-region announcement.
- Rendering: lazy, near-viewport, cancellable; unrendered cells are dashed placeholders that keep the
  number, so the count is stable while thumbnails arrive.

## Phone (under 768px)

- Hero condensed from first paint with a phone-length subhead that never clips mid-sentence.
- Add bar as one 44px row ("+ Add PDFs" and the summary). Files as a scrolling chip row: tag, short
  name, page count; tap jumps to the file's caption in the grid, hold reorders; a "⋯" chip opens Sort,
  Reverse and Clear.
- The document fills the middle with sticky per-file captions; "Edit pages" toggle reveals the 44px
  page controls.
- Sticky bottom sheet: the Download element, then one row of Share, Compress it, Sign it, Options.
  Nothing else competes.

## Empty and one-file states

- Desktop empty: a 260px dashed band (not a 611px void): three ghost page outlines at the left,
  "Drop PDFs here, or paste" with "Your pages appear here, in order, before you download. Files never
  leave your device.", and "Choose files" at the right. The how-it-works card stays below.
- One file: its pages in the grid, one row in the rail, the one-file Download state. Sort, Reverse and
  Jump to file do not appear until there are two files.

## Contrast and sizes (from the critique's measurements)

- Drag handle and remove X: `--color-muted` (6.2:1), never `--color-muted-light` (1.72:1).
- Any text on the primary teal: full white.
- Every control 44px hit area on touch; Options checkbox 18px in a 44px row.
- "Draft saved" moves into the add bar's right side at 13px minimum.

## Copy

No em dashes (fix `draftConflict` in `toolMessages.ts`), straight apostrophes, and every new key in
English and Hebrew.
