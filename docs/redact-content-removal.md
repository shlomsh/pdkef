# Redact: removing what is under a box (RED-01 record)

*RED-01, 2026-09-27. The spike's code, corpus and full tables live in `spikes/red-01/`
(`results-summary.md`, `pdfium/results.md`). This is the decision and the plan.*

## Where we are

Today every page with a Blur, Blackout or Whiteout box is exported as one JPEG
(`src/editor/adapters/pdf/redact.js`). The secret is gone, but so is every other word's text on that
page: nothing can be selected, searched or read aloud. The goal is to remove only the glyphs, image
pixels and marks under each box and leave the rest of the page as it was.

## What we measured

Two engines against a 21-file corpus built to break them (single-run secrets, kerning arrays, subset
TrueType, Hebrew, rotated pages and text, form XObjects, partly covered images, a FreeText annotation,
three real government forms). A pass means: the secret can't be extracted under the box, the words
beside it on the same line survive, other text survives, and no annotation under the box still holds
the secret (`spikes/red-01/check-extractable.mjs`, `check-images.mjs`).

| | Our own content-stream parser | PDFium (`@embedpdf/pdfium`, WebAssembly) |
| --- | --- | --- |
| Passes | 12 of 21 | 17 of 21 |
| Secret inside one text run | Fails: deletes the whole run, so the words beside it go too | Passes: rebuilds the run around the secret, glyph by glyph |
| Two secrets in one run | Fails (collateral) | Passes, no cross-corruption |
| Real forms (IRS 1040, USCIS I-9, Israeli health declaration) | 2 of 3 | 3 of 3 |
| Hebrew, secret mid-run | Fails (whole line) | **Fails: the surviving words come back reordered and 1-2 letters short** |
| Form XObjects | Fails (never descends) | Fails (inspected, not edited) |
| Annotations | Fails (untouched) | Fails (untouched) |
| Partly covered image | Fails (whole image removed) | Pixels right; an invisible caption leaked a fragment |
| 77 pages, one box each | not measured | 119 ms |

PDFium costs 7.3 MB of WebAssembly (2.8 MB with gzip -9, measured locally; what actually transfers
depends on the host compressing `.wasm`, which RED-06 measures), MIT wrapper around an Apache-2.0 binary,
both on the license allowlist.

## Decision (2026-09-28, later): single-image flattening

A page with a Blur, Blackout or Whiteout box is saved as one picture with the marks painted in, and
nothing else: no invisible text layer. Pages without a mark are copied untouched; Delete removes a
selected element and keeps the page as text; a watermark image goes with Delete "everywhere" (RED-26).

Why: the spike below showed removal in place is possible, but the build it needed (a content-stream
editor, six extra rules, fallbacks and checks) was over-complex for its one gain, editing a covered page
after saving. A picture holds nothing under a box by construction. RED-12's search layer was reverted with
it: it re-added text the page hid by other means and gave search only. Sign's Whiteout covers and says so
(RED-10). What stays: the check of the saved file (RED-17), medium blur (RED-24), and solid boxes always
painted after blurs. The safety gap that remains is Find's estimated boxes (RED-15).

## RED-18 decision (2026-09-28): go (superseded)

The spike met the bar: the real forms and every Hebrew case had their boxed text removed with no page
falling back to a picture, every other glyph stayed exactly in place, and no secret survived in any
output's bytes. It costs a few KB where today's picture costs up to hundreds per page. The build adds six
rules the spike exposed (a cut letter's visible part, curves, shared field values, undeletable objects,
fallback notes, painting the box); they are listed in `backlog/tasks/RED-18.md`'s Result.

## Plan (2026-09-28): true redaction, and a check of the saved file

Planned with Shlomi after RED-12 shipped. It supersedes the revised plan below.

**What he wants.** A box removes what is under it for real, and the saved file behaves like the original
everywhere nobody drew a box. Reopened in Redact, its other text can be searched, deleted and written
over. That rules out both a whole-file picture and today's picture with invisible text: the rest of the
page must stay the original objects, not a copy of their words.

**Why it looks possible now.** Our own content-stream parser passed 12 of 21 in RED-01, because it didn't
know where each glyph sat and deleted whole lines. `pageGlyphs.ts` (RED-12) now gives every glyph's exact
place, the way pdf.js draws it. With it, the covered glyphs can be deleted and the survivors kept with
their original codes and order, which is where PDFium failed on Hebrew. No new engine, download or
"Quick or Keep the text" choice: pdf-lib and pdf.js are already shipped.

**Safety comes from checks, not from trusting the removal.** After every export, each covered page must
pass four checks, each by a different method from the removal: a pixel match against the original with
the boxes painted, pdf.js's own text extraction, a byte scan of the whole saved file, and no annotation
under a box. A page that fails is saved as a picture only, and RED-12's invisible layer retires. RED-09's
read-back only re-read our layer with the reader that wrote it, so it caught writing bugs, not misjudged
positions.

**What stays out of scope.**

- Hidden content nobody boxed stays, like an old fake black bar drawn by someone else. It behaves like
  the original, as he asked.
- OCR is out.
- The check of the saved file never claims a secret is absent. It reports what it found and where, names
  the picture pages to look at by eye, and leaves the decision that the file is safe to share with the
  person.
- A chosen light blur is trusted. The default is medium.

| Ticket | What | Depends on |
| --- | --- | --- |
| RED-17 | Check the saved file: follow each match from the original, search every hidden place, prove boxes solid, never claim absence | - |
| RED-18 | Spike: true redaction on RED-01's corpus, the three real forms, Hebrew and watermark cases. Bar: zero leaks, real forms and Hebrew with no fallback | - |
| RED-19 | Text: delete covered glyphs, keep the rest as they were | RED-18 |
| RED-20 | Images and drawn shapes; a shared watermark image handled once, "Remove it everywhere" | RED-18 |
| RED-21 | Form field values, comments, watermark annotations, shared form content | RED-18 |
| RED-22 | The four checks, picture-only fallback, RED-12's layer retired, copy updated | RED-19, RED-20, RED-21 |
| RED-23 | Sign's Whiteout removes what it covers, with the /sign/ FAQ in English and Hebrew | RED-22 |
| RED-24 | A new blur box starts at medium | - |

RED-17 ships first, since it helps with today's export.

## Revised plan (2026-09-27, superseded): keep the picture, add the text back

The first plan below chose PDFium and built a lot around it: a choice between Quick and Keep the text,
a 7.3 MB engine (2.8 MB to download) kept as an offline pack across deploys, guesses at slow phones, a
live as-saved view with a render budget, a Hebrew gate, and a read-back check to earn back the
guarantee that removal gives up. Shlomi's review of the epic asked whether that was over the top. It
was, for what it fixes.

- **Today's export is already the safest there is.** A covered page is saved as a picture, so nothing
  under a box can survive in it. Editing content in place is where redaction tools actually leak.
- **The one real problem** is that the rest of a covered page loses its text: it can't be selected,
  searched or read aloud.
- **The cheap fix** is what scanned PDFs do: keep the picture and put an invisible text layer over it,
  holding every word except the ones a box touches. We already read every word's position for Find
  (RED-02). No download, no choice, nothing new offline, and a mistake in the invisible layer can only
  affect copy and search, never what anyone reads. The boxed words are never written.
- **What it gives up** against PDFium: crisp vector text and a small file on covered pages. Nobody has
  asked for those. If they do, the measurements below are the starting point.

| Ticket | What | Depends on |
| --- | --- | --- |
| RED-12 | Covered pages keep their text: the picture plus an invisible text layer without the boxed words | - |
| RED-09 | Read-back check after every export, failing closed to a picture alone | RED-12 |
| RED-10 | Sign's Whiteout: decide whether it removes, or says plainly that it only covers | - |

RED-04 to RED-08 are retired. RED-11 (the boxes from one search stay a set) is separate from all of
this.

## What shipped (RED-12, RED-09, 2026-09-28)

The revised plan, with one change the spike forced: **the words come from exact glyph positions, not
from Find's text items.** Measured against PDFium's glyph boxes on the three real forms, splitting a
pdf.js text item by a measurement put a word's edge a median 0.12 em from its real glyphs, 0.35 em at
p90 and 0.77 em at p99. That is too loose to decide what a box covers: a secret in the middle of a long
item could be judged outside its box and written into the layer. So:

- **`pageGlyphs.ts`** replays pdf.js's own text state (the part of `CanvasGraphics.showText` that places
  glyphs) over the page's operator list. pdf.js has already decoded every glyph's Unicode value and
  advance; this gives each one its exact place, form XObjects and TJ kerning included. It skips
  invisible text (render modes 3 and 7): on a scan that is the OCR layer, whose positions nothing on
  the page confirms, so an OCR word misplaced by the scanner's software could sit clear of the box
  drawn over the scanned word it stands for. A covered scan page therefore keeps no text, as before.
  (Found by the zero-context review, with the read-back measuring rotated pages in the wrong frame.)
- **`textLayer.ts`** groups glyphs into runs along a baseline, and leaves out whole any word whose
  glyph *core* (just under the baseline to 0.7 em, inset from the sides) a box reaches. A box that only
  grazes an ascender or a side bearing leaves the letter readable in the picture, so writing it hides
  nothing; a full-em box reached the next line at the forms' 1.04 line spacing. Kept words are written
  in the page's own glyph order at their own places, so right-to-left text needs no reordering: an
  extractor reads it back exactly as it reads the original.
- **`invisibleText.js`** writes them with one glyphless Type0 font (render mode 3, a 632-byte one-glyph
  program embedded because PDFKit swaps a program-less font for Courier, and a descent because CoreText
  rejects a font without one). A code is one character at one width, so `/W` gives each glyph its real
  advance; `TJ` closes the gaps. No per-script font, nothing downloaded.
- **Read back after every export (RED-09).** The saved file is read through the same glyph reader; a
  covered page with any glyph under a box, or any word missing or extra, is saved again as the picture
  alone, and the done state names the page.

| Measured on the saved page (`spikes/red-12/`, pdf.js, PDFium = Chrome, PDFKit = Preview) | Result |
| --- | --- |
| Boxed text extractable, any engine, or in the inflated streams | Never |
| Words in the original's order, Latin forms (pdf.js, PDFium) | 100% |
| A Hebrew line with its middle word boxed tightly | Both neighbours whole and in order in pdf.js and PDFium; PDFKit splits that line the same way on the original |
| Selection, PDFium, per character against the original | median 0.5 to 0.8 pt, p99 about 3 pt |
| Size | 6 to 9 KB per page, about 1% of the picture |
| Read-back check on the real forms | Passes on every one; no false fallbacks |

Two findings became their own tickets: Find's boxes are still built from the estimate, so they can miss a
sliver of the match and usually paint into the next word, which then drops out of the layer (RED-15);
and Delete's previews still use a second text decoder (RED-16). The audit of what the picture export
carries over found nothing: a covered page is a new page with only the picture and the layer, and the
new document takes no metadata, outline, attachments or form from the original. The export also now
sizes a covered page from its visible, rotated box, so a rotated page is no longer squeezed into its
unrotated size.

---

*The original plan, kept for the record. Superseded by the section above.*

## Decision (superseded): go, with PDFium, gated on one question

PDFium is the engine: it is the only one that removes a secret from the middle of a line without
taking the line with it, which is the common case in real documents. Our own parser stays out.

The gate is Hebrew. A Hebrew user redacting one word and finding the words beside it scrambled would
break the promise this tool is built on, so nothing ships until RED-05 answers whether we can keep the
surviving glyphs intact (re-emit their original glyph codes instead of re-encoding text) or must fall
back for that run.

## How it behaves

- **Removal first, flattening as the fallback, per page.** Each page is removed-in-place when the
  engine can do it and the check below passes; otherwise that page alone is exported the way it is
  today. A document is never all-or-nothing.
- **Verified, not assumed.** After every export we read the file back: no text, image pixels or
  annotation text left under any box, and all text outside the boxes unchanged from the original.
  Any page that fails is re-exported flattened. Search (RED-02) run on the result is the person's own
  spot-check, not the proof: it only finds what they think to look for.
- **The person is told, plainly.** The done state says which pages kept their text and which were
  saved as an image, and why ("Page 3 was saved as a picture, so its text can't be selected"). No
  security jargon.
- **Sign uses the same engine** for its Whiteout, which today covers content that stays in the file.

## Two ways to save, and the person chooses

Keeping the text costs something that today's export does not: a one-time download, and more work
for the phone every time a page is redrawn to show it as it will be saved (RED-04). On an older
phone or a slow network that cost is real, so it is never spent without the person choosing it.

| | Quick | Keep the text |
| --- | --- | --- |
| What happens | Pages with a box are saved as pictures, as today | Only what is under each box is removed; the rest stays text |
| Text on those pages | Can't be selected or searched | Stays selectable and searchable |
| What you see while editing | Your boxes over the page | The page exactly as it will be saved |
| Cost | Nothing extra | A one-time download (2.8 MB compressed, if served compressed), then offline; 7.3 MB stored and compiled; more work per edit |

- **Asked once, when it first matters.** Not on page load. The first time a box is drawn, one quiet
  line in the status row states the choice and its cost in plain words, and drawing is never blocked
  while it waits. Until it is answered, the document is in Quick.
- **An honest suggestion, never a guess dressed as fact.** Where the browser says so (Save-Data, a
  2G/3G connection, 2 GB of memory or less), Quick is the highlighted option and the line says why.
  Where it says nothing, as on every iPhone, neither is highlighted. Nothing downloads until the
  person picks Keep the text.
- **Remembered, and easy to change.** The choice is remembered per document and becomes the default
  for new ones, like every other setting. A small control beside Download changes it at any time,
  and Quick's done state offers "Save again, keeping the text".
- **The download never blocks.** It shows progress in the status row while editing continues. Export
  before it finishes offers to save Quick now or wait. Offline before it was ever downloaded, Keep
  the text is unavailable and the line says so.
- **A slow phone keeps the text without the live view.** The as-saved page is drawn in the worker,
  after edits settle. If a page takes longer than a budget RED-04 measures (a few hundred
  milliseconds), the live view steps down to a "Show as saved" button for that document and says
  so. The export still keeps the text; only the live drawing is dropped.

## Offline, including a first use in airplane mode

PDkef's promise is that it works with no connection at all. Quick already does, since everything it
needs is precached. Keep the text needs a download, so it can only work offline once that download has
happened, and the design must never let the promise break silently.

- **Quick never depends on the engine.** Its path stays fully precached and untouched, so any document
  can always be saved offline.
- **The engine is an offline pack**, the same mechanism as the font and language packs: fetched once
  through the service worker, kept in the cache, and carried over from one deploy's cache to the next
  (as `migrateFontPacks` does in `public/sw.js`). An update must never quietly drop what someone already
  downloaded.
- **Lazy, always.** Nothing is fetched ahead or offered for download in advance. The engine is fetched
  only at the moment Keep the text is actually needed, and never before.
- **Offline at that moment: say so, and save Quick.** One plain line tells the person Keep the text
  needs a one-time download and they're offline, so this is saved the quick way instead. When the
  connection is back, the next save offers it again. Never a spinner that can't finish.
  `navigator.onLine` is not trusted alone: a failed or slow fetch falls back to Quick the same way.
- **A remembered choice can outlive the engine.** Browsers may evict cached data (Safari clears it
  after about a week without a visit for a site not on the home screen). A document set to Keep the
  text, opened offline after that, saves Quick and says why. Never a broken or silently different
  export.



| Ticket | What | Depends on |
| --- | --- | --- |
| RED-05 | Spike: Hebrew and Arabic survivors of a partial rebuild keep their glyphs and order | - |
| RED-06 | Quick or Keep the text: the person chooses knowing the cost; the engine downloads only on Keep the text | - |
| RED-07 | Remove text, image pixels and paths under each box, with per-page flattening fallback | RED-05, RED-06 |
| RED-04 | What you see is what you save, with a render budget and the step-down to "Show as saved" | RED-07 |
| RED-08 | Annotations, form field values and form XObjects under a box | RED-07 |
| RED-09 | Read-back check after every export, and the done state that tells the person per page | RED-07 |
| RED-10 | Sign's Whiteout removes what it covers, through the same engine | RED-09 |

RED-04 ships with the removal, not after it: removal and the as-saved view are one feature.

## RED-59 (2026-10-08): hidden traces

Every Redact download (Delete, flattened, mixed, and Remove it) carries none of the following. The
copy on `/redact/`, the Delete guide and the CamScanner guide traces to this table. Detail: RED-59.

| # | Trace | After download |
| --- | --- | --- |
| T1 | Title, author, subject, keywords and every other Info entry | Gone |
| T2 | Creator, producer, dates | None, nothing stamped |
| T3 | Catalog XMP | Gone |
| T4 | Files attached anywhere (name tree, /AF, file-attachment comments) | Gone, unless the person chose "Keep it in the download" for that file |
| T5 | Document scripts, open action, page open/close/print scripts | Gone (scripts inside form fields are left as they are) |
| T6 | Page-level and image-level details (/Metadata, /PieceInfo) and page thumbnails | Gone |
| T7 | File ID | A new random one (not mentioned in the copy) |
