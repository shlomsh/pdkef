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

## Decision: go, with PDFium, gated on one question

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
  (as `migrateFontPacks` does in `public/sw.js`). An update must never quietly drop it, or someone who
  prepared for a flight would find it gone after a deploy.
- **It can be prepared ahead.** The choice line, the control beside Download and the install page all
  offer "Make Keep the text work offline" while online, so nobody has to discover the gap mid-flight.
  Choosing it asks the browser for persistent storage.
- **Offline and not prepared, the person is told before they rely on it.** The choice line says Keep
  the text needs a one-time download and saves Quick for now; when the connection returns, it offers
  the download. It never shows a spinner that can't finish. `navigator.onLine` is not trusted alone:
  a failed or slow fetch falls back to Quick the same way.
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
