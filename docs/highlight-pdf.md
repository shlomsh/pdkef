# Highlight PDF: a tool for reading, forked from Sign

*Design record, 2026-11-01. Decisions are Shlomi's from the session of that day; open calls are marked.*
Epic: the `highlight-pdf` lane, tickets READ-01 to READ-09. The hard requirements, with the numbers the
sketches settled on and what building them taught, are in [READ-01](../backlog/tasks/READ-01.md); this
record says why, the ticket says exactly what.

## The principle

> Someone reading a paper wants to read, and marking should feel like holding a highlighter, not like
> operating software.

Every choice below is checked against it. The temptation in this space is a cockpit (Xodo shows three
layers of navigation, a properties panel with about thirty colors, an upsell bar and a side panel, and the
page gets what is left). Minimal is the design, not a phase.

## Why a tool of its own

Highlights (SIGN-46) and comments (SIGN-44) went into Sign in late October 2026, and the use they serve is
not filling a form: it is a student reading a paper or a textbook chapter. One editor for every job is what
PDF24 does (its annotate and edit pages open the same editor), and it reads as noise for both jobs.

**Decided 2026-11-01:**

- Reading becomes its own tool, **Highlight PDF**, at `/highlight-pdf/` (name confirmed the same day).
  It is built on the shared editor core (`src/editor/`, `src/editor-ui/`), not copied from Sign.
- **Sign keeps comment on everything** (a passage tint, a comment on an element, a pin; see
  `docs/sign-comments-model.md`) and **loses the Highlight tool**. Highlight had been in Sign under twelve
  hours with negligible traffic when this was decided.
- **Sign still shows, keeps, exports and deletes highlights it cannot make.** Every tool shares one memory
  space, so a paper highlighted here and later opened in Sign to sign it keeps its highlights, and Sign's
  read-back of `/Highlight` annotations from other viewers keeps working.
- **Highlight leaves Sign in the same push that launches Highlight PDF**, never before, so highlighting is
  never missing from the product.
- **Printing with notes is built here, never in Sign.**

## Search entry

From the 2026-11-01 term research (Google Trends read through the built-in browser, and fourteen competitor
pages fetched; numbers are relative, not volumes). The full record is in
`docs/seo-competitive-findings.md`.

- **Primary: "highlight pdf" / "highlight in pdf".** The biggest reading term: about 8% of "sign pdf" and
  about three quarters of "add text to pdf" over the last twelve months. Most of it is a question ("how to
  highlight in pdf"), so the page teaches and does in one place.
- **Secondary: "annotate pdf"** (about a third of highlight, crowded with dedicated pages at Smallpdf, Xodo,
  Lumin, PDFgear and PdfMeta) and **"add comments to pdf"** (small). "PDF highlighter" runs at about a fifth
  of "highlight pdf", so it is a body phrase, not the name.
- **Ignore:** "comment on pdf" (mostly French, "comment" is "how") and "pdf annotation" (iPad app shopping).
- **The gap:** only PDFgear has a dedicated highlight tool page; Adobe's and Smallpdf's return 404 and the
  rest bury highlighting inside "edit PDF". No vendor has a tool page aimed at studying.
- **Students are the audience, not the keyword.** US searches for "annotate pdf" roughly double from the
  May to June low to the August to September and January peaks; nobody types "for students". Ship before a
  peak.
- **Devices:** Mac and iPad carry the device searches ("annotate pdf ipad" is the largest); phones and
  Chromebooks are near zero, so the page does not lead with phones.
- **What only we say:** highlighting on a scanned page, a band that stays straight along the line, comments
  that open in any viewer, right-to-left text and twenty languages. "Free", "no signup" and "in your
  browser" are table stakes here.

## The experience

### Opening a file

The page fills the screen, fitted to its width and centred. On a desktop a yellow marker is already in the
hand: the cursor over the page is a small highlighter in the armed color. No panel is open, nothing asks for
a decision. A phone or iPad opens armed too, with "Swipe to highlight" beside the file name. A click or tap on
Marker puts it down and another picks it up again; it stays in the hand between marks (R1, R50). The contract is [READ-01](../backlog/tasks/READ-01.md); this section is the story.

### Marking

- **The passage is the unit.** Swipe or drag along a line (the line band: straight, as tall as the line,
  carried onto the next lines by dragging down, ends settling on word gaps, working on scans).
- **Finishing a stroke shows nothing.** A popup after every band asks a question the reader did not have;
  the next stroke is the answer most of the time (R1, R52).
- **On touch, one finger marks only sideways along a line of text.** The first few pixels decide: sideways
  on a line lays a mark, anything else scrolls, and a finger that starts off the text moves the page in any
  direction. Two fingers always zoom and move the page and never mark. Reading with a finger never paints
  by accident. Outside full screen the pinch is the browser's own, and zoomed in a finger on a line still
  marks while one anywhere else moves the page. While the marker is armed the toolbar says "Swipe to highlight"
  with the pen's look beside it (R51, R52, R62).
- **Double-click marks a word, a third click its sentence**, the way selection works everywhere, sweeping in
  from the first letter.
- **Underline is a style of the band, not a tool:** the line reader already knows the baseline, and the
  underline follows the page's turn on screen, in the file and in print (R55).
- **First marks are half strength** (50%), so the text stays readable on every screen (R53).
- **No height control, no strikethrough.** Our band follows the text, and strikethrough is the reviewer's
  "delete this", not a reader's mark.

### Changing a highlight

- **There is one panel, and only a click on a highlight opens it.** On a desktop, a rest draws the faint pencil
  outline and opens nothing; a click opens the panel where you clicked, above the line clicked, with the full
  outline on while it is open (R2, R47). This came from READ-24.
- **Menus open upward from the floating row** so they never cover the mark. Right under the stuck bar, where the row
  and its tallest menu have no room above the line, the row opens just below the line and its menus open downward. On
  touch they open below the row and the page glides down so the mark stays in view.
- **Delete shows "Highlight removed" with Undo for five seconds,** where the row was on a desktop, at the foot
  of the screen on touch.
- **On touch, tap a highlight to pick it.** The mark gets a ring and the panel opens under the top toolbar
  (in full screen, under the capsule's Marker) with that mark's look, Comment and Delete. Nothing floats on
  the page. A tap elsewhere or on Marker lets it go (R7).
- **The panel is one quiet row:** Comment first, then yellow, pink and green, the "more" button for orange, red,
  blue and the color wheel, one Look button, Delete. Look holds the kind (Highlight or Underline), the stroke
  (Clean, Sketch, Pencil) and the strength (opacity, or thickness for an underline). The least common controls
  are one click away, never in the way (R4, R47, R48).
- **Each color is a small highlighter.** Every color cell draws a marker in its own plastic, and the picked one
  uncaps while a band of its ink swipes in behind it, so the row shows the ink you get. More wears that band
  when the pen is one of its colors, and the wheel is a blank marker under a rainbow cap until a custom ink
  fills it. The ink swipe was chosen 2026-11-02.
- **A stroke can look drawn by hand.** Beside clean, Look offers a sketch: a chisel-nib band with
  uneven edges and ends that overshoot the line, seeded from the mark so screen, print and the PDF draw the same
  wobble, and drawn as a vector path in the export (READ-11).
- **Whatever is picked becomes the marker.** Changing one highlight re-arms the pen, so choosing a color
  once is choosing it for the next strokes. It is the only way to change the pen (R5).

### Comments

- **A comment belongs to a highlight, nothing else.** This is how reading tools work: Hypothesis and Edge
  make a comment and its highlight one object, Zotero comments on annotations, PDF24's reader adds a comment
  to a highlight. Comment-on-anything is a review pattern (Acrobat, Word, Google Docs) and stays in Sign.
- **Comment over an uncolored line** lays the band in the last color used and opens the note, as Edge does.
  The reader never chooses between highlighting and commenting.
- **Nothing moves the page but the reader.** A note travels with its passage through scroll, pinch and
  zoom. Notes sit beside the page, as in Google Docs: fitting fits the page and its notes together, and the
  first note makes room at once with its passage held still (READ-01, R28 and R29). There is no
  annotations sidebar.
- **No free-standing note at first.** Most reading tools have one (Zotero, Chrome, Acrobat's sticky note);
  it can come later without changing anything above.
- **In the file:** the same standard annotations Sign writes and reads back (`docs/sign-comments-model.md`):
  a `/Highlight` in its color, with `/Contents`, `/M` and a closed `/Popup` when it has a comment.

### Fullscreen is the reading lamp

The mode is called **Reading lamp** (Shlomi, 2026-11-01; the shortlist is in READ-05).

A floating capsule instead of a bar: file name, page jump, zoom, the armed marker, Undo, Redo, Print,
Download, More and Exit. It never vanishes (controls that vanish get lost), it goes quiet: grey and faded
while the reader reads, awake when reached for, dozing slowly when the reader scrolls or presses the page
again. Zoom offers Fit width (the default), Fit text (the paper's empty margins trimmed away, what a
student reading a paper wants most), Fit page and Actual size, with pinch and Cmd/Ctrl plus or minus around
the pointer; no zoom is remembered. Sideways movement stops at the edge of the pages and their notes, and
zooming out stops at the whole page (R56, R57). Coarse pointers keep the 44 px targets `editor.md` requires
(R49), and on a phone the Marker is armed and put down with a tap, with no hint of its own in this mode (R51).
Download says "Saved as {name}." in the strip under the toolbar (R59). It is
one fullscreen style, not a container-query tier (those drifted twice), built once in shared chrome so
Sign's fullscreen gets the same capsule (READ-05).

### Printing with notes

A Print action separate from Download, because the exported file carries comments as popups and Chrome,
Preview and most printers do not print popups.

- **Print with my notes:** each page a little smaller, its comments in the right margin beside their
  passages. What you see is what you carry into an exam.
- **Print:** the pages with their highlights.
- Neither is saved into the PDF. Download stays clean, standard annotations only.

A list at the end makes a reader flip pages; a note beside its line is the one layout that works on paper,
which is why Word prints markup in the margin.

### Moving through your marks (later)

In a long paper, ∧ ∨ hop between your highlights in reading order, the same control fill mode uses to hop
between fields.

### Pen (later, iPad first)

Circles, arrows and margin scribbles with a pencil. An armed tool, since a pen fights scrolling on touch.
Demand sits on iPad; with a mouse almost nobody draws.

## Engineering

- **Shared, not copied.** READ-02 moved what both tools use out of `src/tools/sign/`, with no behaviour
  change, before the new island exists: the raster and line reader (`rasterInk.js`, `textRows.ts`,
  `bands.ts`, `swipe.ts`, `swipeReader.ts`) to `src/lib/pageLayout/`; band flip, reading direction and
  the comment model (`src/editor/highlight/`, `src/editor/comments/`, with `pdfLibGeometry.ts` in
  `src/editor/adapters/pdf/`); the swipe gesture, swatches and highlight node to `src/editor-ui/highlight/`;
  the comment rail, sheet, cards, node, marker, gesture and actions to `src/editor-ui/comments/`, beside
  `nodeProps.ts` and `elementActions.ts` in `src/editor-ui/`. Until READ-03's island imports them, each
  carries a rule 9 allowlist entry that goes stale the day it does. Sign-only code stays in Sign.
- **The tool is a new island** (its own `highlight` folder beside the other tools, `PdfHighlightTool.tsx`) over the shared shell, with
  its static SEO shell, a registry entry in `src/data/tools.js`, the non-slash redirect pair in
  `vercel.json`, and the tool count updated wherever it is stated.
- **Settings are remembered per document** and become defaults for new documents, like every Sign setting:
  the color, the underline style, the opacity. Zoom is not remembered.
- **One page layout for every reader.** Highlight bands, field detection and snapping read text rows, word
  gaps and columns from one pure, swappable layout layer with its own corpus and KPIs, and OCR later joins
  it once for all of them (READ-01, R32 to R38). SIGN-46's line reader is a day-old experiment and is
  reshaped into it, not kept beside it.
- **Pure functions, thin components.** The highlight toolbar's decisions (which color a Comment lays, what Delete
  removes) are pure model code with unit tests, called by the UX.

## Open calls (Shlomi)

Decided: the name is Highlight PDF; a comment sits beside the page (R28); every device opens armed, Marker
toggles it and it stays armed between marks; one panel, only for a picked highlight; the pen changes only
through a picked highlight (R1, R47, R50, R5).

1. **Long-press and drag on a phone**, the gesture phones already teach for selecting text, instead of
   arming. Clean on a scan (no text layer to select); on a digital PDF it needs a real-iPhone check that it
   does not fight the browser's own selection (READ-07).
2. **iOS Safari download.** It may open the PDF in the tab instead of saving it; check on a real iPhone.
3. **Landscape on a phone.** The capsule touches the page header; look at it and decide.
4. **The Replace dialog's red "Choose a file".** It is cross-tool, so the fix belongs to every tool.

## Order of work

1. READ-01: the sketches, done, turned into hard requirements; Shlomi agrees them and the open calls.
2. READ-02: move the shared highlight and comment pieces out of Sign.
3. READ-03 with READ-04: the tool and its page, and Sign handing highlighting over, in one push.
4. READ-05: the fullscreen capsule (shared chrome, both tools).
5. READ-06: printing with notes.
6. Later: READ-07 long-press on a phone, READ-08 hopping between marks, READ-09 the pen.
