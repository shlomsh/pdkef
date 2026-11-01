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

The page fills the screen, fitted to its width and centred. A yellow marker is already in the hand: the
cursor over the page is a small highlighter in the armed color. No panel is open, nothing asks for a
decision.

### Marking

- **The passage is the unit.** Swipe or drag along a line (the SIGN-46 line band: straight, as tall as the
  line, carried onto the next lines by dragging down, ends settling on word gaps, working on scans).
- **Finishing a stroke shows nothing.** A popup after every band asks a question the reader did not have;
  the next stroke is the answer most of the time.
- **Double-click marks a word, a third click its sentence**, the way selection works everywhere, sweeping in
  from the first letter.
- **Rest on a highlight to change it.** A quiet rest opens Highlight or Underline, Comment and Delete; a
  longer rest on Highlight opens the six colors, and "+" there a custom color and opacity. On touch, a tap.
- **Whatever is picked becomes the marker.** Changing one highlight re-arms the pen, so choosing a color
  once is choosing it for the next strokes.
- **Underline is a style of the band, not a tool:** the line reader already knows the baseline.
- **No height control.** PDF24 and Xodo offer one to make up for a band that does not follow the text; ours
  does, and it keeps the text dark (Multiply). Custom color and opacity exist but sit two rests deep, so the
  six colors stay the whole vocabulary for most readers.
- **No strikethrough.** It is the reviewer's "delete this", not a reader's mark.

### Comments

- **A comment belongs to a highlight, nothing else.** This is how reading tools work: Hypothesis and Edge
  make a comment and its highlight one object, Zotero comments on annotations, PDF24's reader adds a comment
  to a highlight. Comment-on-anything is a review pattern (Acrobat, Word, Google Docs) and stays in Sign.
- **Comment over an uncolored line** lays the band in the last color used and opens the note, as Edge does.
  The reader never chooses between highlighting and commenting.
- **Nothing moves the page but the reader.** Opening a comment never shifts or re-fits the page, and a note
  travels with its passage through scroll, pinch and zoom. The sketches tried the SIGN-44 rail beside the
  page and measured both failures (READ-01, R28 and R29). The recommended placement is a marker in the page
  margin that opens a card beside its passage (READ-01, open call 2). There is no annotations sidebar.
- **No free-standing note at first.** Most reading tools have one (Zotero, Chrome, Acrobat's sticky note);
  it can come later without changing anything above.
- **In the file:** the same standard annotations Sign writes and reads back (`docs/sign-comments-model.md`):
  a `/Highlight` in its color, with `/Contents`, `/M` and a closed `/Popup` when it has a comment.

### Fullscreen is the reading room

A floating capsule instead of a bar: file name, page jump, zoom, the armed marker, Undo, Redo, Print,
Download, More and Exit. It never vanishes (controls that vanish get lost), it goes quiet: grey and faded
while the reader reads, awake when reached for, dozing slowly when the reader scrolls or presses the page
again. Zoom offers Fit width (the default), Fit text (the paper's empty margins trimmed away, what a
student reading a paper wants most), Fit page and Actual size, with pinch and Cmd/Ctrl plus or minus around
the pointer, remembered per document. Coarse pointers keep the 44 px targets `editor.md` requires. It is
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

- **Shared, not copied.** The line reader, band geometry, swipe gesture, swatches, comment rail, sheet,
  cards, import and read-back live under `src/tools/sign/` today (`lib/highlight/`, `lib/comments/`,
  `hooks/highlightSwipeGesture.ts`, `hooks/commentGesture.ts`, `components/comments/`,
  `components/HighlightSwatches.tsx`, the highlight and comment nodes). What both tools use moves to
  `src/editor/` or `src/editor-ui/` under `docs/module-boundaries.md` with no behaviour change, before the
  new island exists (READ-02). Sign-only code stays in Sign.
- **The tool is a new island** (its own `highlight` folder beside the other tools, `PdfHighlightTool.tsx`) over the shared shell, with
  its static SEO shell, a registry entry in `src/data/tools.js`, the non-slash redirect pair in
  `vercel.json`, and the tool count updated wherever it is stated.
- **Settings are remembered per document** and become defaults for new documents, like every Sign setting:
  the color, the underline style, the opacity, the zoom.
- **One page layout for every reader.** Highlight bands, field detection and snapping read text rows, word
  gaps and columns from one pure, swappable layout layer with its own corpus and KPIs, and OCR later joins
  it once for all of them (READ-01, R32 to R38). SIGN-46's line reader is a day-old experiment and is
  reshaped into it, not kept beside it.
- **Pure functions, thin components.** The highlight toolbar's decisions (which color a Comment lays, what Delete
  removes) are pure model code with unit tests, called by the UX.

## Open calls (Shlomi)

1. **The name** is decided: Highlight PDF.
2. **Where a comment sits** (READ-01, open call): two sketches decide it, a margin marker that opens a card
   beside its passage, or a popover under the passage itself. *Decided since the first draft:* desktop
   drags with the marker in the hand (the marker model), which scopes the one-shot rule out of this tool.
3. **Long-press and drag on a phone**, the gesture phones already teach for selecting text, instead of
   arming. Clean on a scan (no text layer to select); on a digital PDF it needs a real-iPhone check that it
   does not fight the browser's own selection (READ-07).

## Order of work

1. READ-01: the sketches, done, turned into hard requirements; Shlomi agrees them and the open calls.
2. READ-02: move the shared highlight and comment pieces out of Sign.
3. READ-03 with READ-04: the tool and its page, and Sign handing highlighting over, in one push.
4. READ-05: the fullscreen capsule (shared chrome, both tools).
5. READ-06: printing with notes.
6. Later: READ-07 long-press on a phone, READ-08 hopping between marks, READ-09 the pen.
