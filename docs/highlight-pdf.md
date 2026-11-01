# Highlight PDF: a tool for reading, forked from Sign

*Design record, 2026-11-01. Decisions are Shlomi's from the session of that day; open calls are marked.*
Epic: the `highlight-pdf` lane, tickets READ-01 to READ-09.

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

- Reading becomes its own tool, **Highlight PDF**, at `/highlight-pdf/` (name to confirm, see Open calls).
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

The page fills the screen. One slim line carries the file name, "Page 3 of 18", Undo, Redo and Download.
No tool is armed, no panel is open, nothing asks for a decision.

### Marking

- **The passage is the unit.** Swipe or drag along a line (the SIGN-46 line band: straight, as tall as the
  line, carried onto the next lines by dragging down, ends settling on word gaps, working on scans).
- **A small popup at the band's end** holds the whole vocabulary: the six colors, the underline style, and
  Comment. Delete appears on a selected mark.
- **Underline is a style of the band, not a tool:** the line reader already knows the baseline. One toggle
  in the popup.
- **No opacity, no height, no color picker.** PDF24 and Xodo offer those to make up for a band that does not
  follow the text; ours does, and it keeps the text dark (Multiply). Acrobat's new color picker is the most
  complained-about part of its highlighting.
- **No strikethrough.** It is the reviewer's "delete this", not a reader's mark.

### Comments

- **A comment belongs to a highlight, nothing else.** This is how reading tools work: Hypothesis and Edge
  make a comment and its highlight one object, Zotero comments on annotations, PDF24's reader adds a comment
  to a highlight. Comment-on-anything is a review pattern (Acrobat, Word, Google Docs) and stays in Sign.
- **Comment over an uncolored line** lays the band in the last color used and opens the note, as Edge does.
  The reader never chooses between highlighting and commenting.
- **The card opens in the margin rail beside its passage**, typing at once (the SIGN-44 rail, cards and
  sheet). The rail is the list of notes; there is no annotations sidebar.
- **No free-standing note at first.** Most reading tools have one (Zotero, Chrome, Acrobat's sticky note);
  it can come later without changing anything above.
- **In the file:** the same standard annotations Sign writes and reads back (`docs/sign-comments-model.md`):
  a `/Highlight` in its color, with `/Contents`, `/M` and a closed `/Popup` when it has a comment.

### Fullscreen is the reading room

On a fine pointer: one line of 32 to 36 px icon buttons with names in tooltips, the file name and page
count inline, the status row folded away, no card glass or shadow. Coarse pointers keep the 44 px targets
`editor.md` requires. It does not auto-hide: controls that vanish get lost, and only Xodo hides its bar. It
is one fullscreen style, not a container-query tier (those drifted twice). Built once in shared chrome, so
Sign's fullscreen gets the same bar.

### Printing with notes

A Print action separate from Download, because the exported file carries comments as popups and Chrome,
Preview and most printers do not print popups.

- **Print with my notes:** each page a little smaller, its comments in the right margin beside their
  passages, laid out as the rail shows them. What you see is what you carry into an exam.
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
  the color, the underline style.
- **Pure functions, thin components.** The popup's decisions (which color a Comment lays, what Delete
  removes) are pure model code with unit tests, called by the UX.

## Open calls (Shlomi)

1. **The name.** "Highlight PDF" (recommended: the primary term and our verb naming) against "PDF
   Highlighter" (a fifth of the searches).
2. **Drag to highlight with nothing armed, on desktop.** The most direct form of the principle, and it bends
   the one-shot tool rule in CLAUDE.md, only in this tool. Recommended once the tool has had some use
   (READ-07).
3. **Long-press and drag on a phone**, the gesture phones already teach for selecting text, instead of
   arming. Clean on a scan (no text layer to select); on a digital PDF it needs a real-iPhone check that it
   does not fight the browser's own selection (READ-07).

## Order of work

1. READ-01: clickable sketches of the mark popup and the fullscreen bar; Shlomi picks.
2. READ-02: move the shared highlight and comment pieces out of Sign.
3. READ-03 with READ-04: the tool and its page, and Sign handing highlighting over, in one push.
4. READ-05: the fullscreen bar (shared chrome, both tools).
5. READ-06: printing with notes.
6. Later: READ-07 direct highlighting, READ-08 hopping between marks, READ-09 the pen.
