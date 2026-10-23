# Merge loaded state: target design (MERGE-24)

The one target for Merge once files are in, at every width. Every line is measurable; the MERGE-24
path matrix checks each one on a production build at 1280x900, 1440x900, 1280x700 with 15 files,
820x1180 and 375x812, in English and on `/he/merge/`. The reasons live in
[ux-design-guidelines.md](./ux-design-guidelines.md) sections 1 to 4, 8, 15 and 18.

## Desktop, 1024px and up

1. **The page.** The app bar (56px) stays at the top. The hero is one line. The card holds the first
   screen: its min-height is `clamp(600px, 100svh - 56px, 900px) - 88px`, so on a 900px screen its
   bottom sits at the screen's bottom edge.
2. **Two columns.** The document takes the rest of the width; the rail is 320px, 12px apart.
3. **The heading.** The output name, cut in the middle so its end stays ("…itc1040 (final) (3)"),
   ".pdf" muted, then " · N pages" with a real space. Editing shows the full name.
4. **The pages fill the card.** A page is the widest size from 104 to 240px that fills the document's
   width at some number of columns while every row, with its run names and captions, ends above the
   card's floor. When no size fits, pages are 104px and the page scrolls, as before. Thumbnails are
   drawn at the page's size times the screen's density (150px at 104), so they stay sharp.
5. **Each page** carries its file's colour as a 4px band on its top edge (teal, olive, clay, then the
   same at 55%), the file's name above the first page of a run, and its number below.
6. **The rail** sticks 12px below the app bar and is never taller than the screen below it. Top to
   bottom: the file list, the sort or "Pages moved across files" row, "Draft saved" at the end, Add
   files and Clear all, Add page numbers, Download, then Compress and Sign (and Share where the
   browser can share files). When the files outgrow the space, only the file list scrolls, inside
   itself, with at least two rows showing; Download never leaves the screen while the card is on it.
   Nothing in the rail ever scrolls sideways.
7. **Linked files.** Pointing at a file row or keyboard focus on it lifts that file's pages and steps
   the others back; pointing at a page lights its row. Nothing on touch, nothing while dragging.
8. **Download.** On a click the bands sweep to teal, left to right, as the check draws, then the
   button reads Saved. Reduced motion skips the sweep.
9. **Below the card.** The airplane line sits 16px under the card. "Combine as many files…" stays in
   the HTML and is hidden. Then How it works, the FAQ and More PDF tools, as today.

## Tablet (768 to 1023px) and phone (below 768px)

1. **The page.** The card is as tall as its content (no first-screen floor), as today.
2. **A sticky bar** sits under the app bar: the file chips, scrolling sideways inside the bar, and at
   its end a quiet Download (the plain button, never filled).
3. **In the flow above the pages:** Add files, Clear all, Sort, and the "Pages moved across files" note.
4. **The heading** wraps on a phone instead of cutting; pages keep today's sizes (104px on a tablet,
   72px on a phone) and carry the band.
5. **The completion row** follows the last page: Add page numbers, the filled Download, then the next
   steps.
6. **Nothing is pinned to the bottom**, and the page never scrolls sideways at 375px.
7. **Below the card**, the airplane line sits 16px under it.
