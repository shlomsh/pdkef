---
id: "RED-59"
title: "Metadata removal is a claim Redact has to show and explain, not just do"
status: "in_progress"
horizon: "now"
priority: "P2"
epic: "redact"
depends_on: []
---

# RED-59 · Metadata removal is a claim Redact has to show and explain, not just do

Filed 2026-10-08 by Shlomi. Takes over SEO-43, retired into this ticket.

## Why

Saying "Redact removes metadata" is a strong claim. A person who redacted a contract needs to see that
the author, the app and device that made it, and the dates are gone, and the docs need to say exactly
what goes and what stays, per export path. Today the removal mostly happens without anyone seeing it.

## What is already true (from SEO-43, read in the code 2026-10-08)

- The saved-file check shows and removes title, author, subject, keywords, the XMP stream, attachments
  and parts of the file no page shows (`src/tools/redact/check/types.ts` `PlaceKind`,
  `placeLocator.ts`, `removePlace.ts`).
- The Delete export clears every Info entry, creator, producer and both dates included, and the XMP
  stream (`clearDocumentDetails`, `src/editor/adapters/pdf/deleteObjects.js`, RED-27).
- The flattened (Blur, Blackout, Whiteout) export starts from a new document, per the same comment.
- Gap: the check does not list Creator, Producer, CreationDate or ModDate, which are the details RED-27
  found on a CamScanner scan (app name, device, exact scan time).

## Step 1: the deeper look, before any change

A table, per export path (flattened pages, Delete, a mix, "Remove it" from the check): which document
details leave, which stay, and which the check shows. Measured on real files saved through the tool and
read back with pdf-lib, not read off the code. Fixtures: a CamScanner scan, a Word export, a file with
XMP history, a file with an attachment. Include the export's own Producer: does pdf-lib stamp one?

## Step 2: show it and explain it

- In the tool: where the person sees the details the file carried and that they are gone, in plain words
  ("Made with CamScanner on an iPhone, 7 Oct 09:14"), not field names. Design call to make here, against
  `docs/ux-design-guidelines.md`.
- In the docs: the Redact page FAQ and the redaction guides say what goes and what stays, matching the
  step 1 table exactly. No claim beyond what the table shows.
- The check lists Creator, Producer and the dates, with a unit test per key seen failing first.

## Acceptance

- The step 1 table recorded here, from saved files.
- Every metadata claim in the tool and docs traces to a row of that table.
- An e2e test that saves a fixture with known details and asserts the saved file has none of them.

## 2026-10-08 step 1 measured

Fixture: `thai-lor-yor-01-2562.pdf` (a real Word 2016 export with XMP and widgets), plus a title,
subject, keywords, an attachment, a catalog JavaScript name tree, an OpenAction script, and page-level
`/Metadata` and `/PieceInfo`. `deleteObjectsFromPdf` and `removePlace` were run for real. The flattened
row replicates `assemble()` in `redact.js` (`create()` + `copyPages` + `save()`), because `redactPdf` needs a
canvas. Script: scratchpad `red59/measure.mjs`; the lead re-ran it with the same result.

| Detail | Delete | Flattened or mixed | Remove it (one place) |
| --- | --- | --- | --- |
| Title, author, subject, keywords | gone | gone | only the one removed |
| Creator, producer, dates | gone | replaced: "pdf-lib (https://github.com/Hopding/pdf-lib)" and the export time | original kept |
| Catalog XMP | gone | gone | gone only when that place is removed |
| Attached files | **kept** | gone | only the one removed |
| Document JavaScript, OpenAction | **kept** | gone | kept |
| Page-level `/Metadata`, `/PieceInfo` | **kept** | **kept on pages copied untouched** | kept |
| Trailer `/ID` | kept (original's) | none | kept |

Mixed runs Delete first and then the flattened path, so its result is the flattened column.

**What the check shows:** a document detail is listed only when a searched term matches its text
(`checkSavedFile.ts`). Nothing lists the details unprompted. Creator, producer and dates are never read
(`readSavedFile.ts`, `placeLocator.ts`).

**What the docs claim:**
- `permanently-delete-text-from-pdf.yaml` (body and FAQ): the download "leaves out the original file's
  details: its title, author, the app that made it and when". True for Delete, which is the path that guide
  covers.
- `remove-camscanner-watermark-from-pdf.yaml`: "keeps no title, author or scan time". True on every path.
- No claim covers attachments, scripts or page-level metadata, and the Redact FAQ makes no metadata claim.

**Existing tests** cover Info and catalog XMP after Delete only (`deleteObjects.test.js`, RED-27). Nothing
covers the flattened export's details, attachments, scripts, page-level metadata or `/ID`.

**Calls for step 2** (the lead proposes, Shlomi decides):
1. Should Delete drop attached files, document scripts and page-level metadata the way the flattened path
   does? An attachment can carry the unredacted original.
2. Should the export stamp no producer instead of "pdf-lib"?
3. Should the check show the document details unprompted, in plain words, so the person sees what goes?

## 2026-10-08 Shlomi's calls

- **File stamps:** every Redact download says nothing about who made it or when (no producer, creator or
  dates) and gets a fresh file ID.
- **Show the details:** the check shows a file's document details without being asked, in plain words.
- **Hidden parts (attached files, scripts, page-level metadata):** not decided in chat. Shlomi wants the
  UX planned carefully by a dedicated planning agent first ("even I didn't think about those traces").
  The plan comes back here before any build.

## UX plan

Planned 2026-10-08 for Shlomi's review. Nothing is built. Each open question has options and one
recommendation; the decisions to make are collected at the end.

### What the tool does today (walked on the dev server, 390 and 1280 wide)

Fixture: the Thai Word form with a title, author "Dana Levi", creator "CamScanner", producer "iPhone 15 Pro",
dates 7 Oct 09:14, an attached `original-unredacted.pdf`, a document script, an open action and page-level
XMP naming Dana Levi. Screens and read-backs: scratchpad `red59-walk/`.

- **Nothing before Download** says what the file carries. Find searches page text only ("Dana": no matches).
- **The check appears only after Download**, in the finish area under the page: "Saved redacted_traces.pdf ·
  1 page", the pages line, Compress it / Sign it, then the check (lead, one row per term, notes, a search
  box). No headings, nothing collapsed.
- **After Delete** the check says only "This file has an attached file. I didn't look inside it." Scripts and the
  page XMP are never mentioned, and a typed "Dana" says "No match" while the page XMP still holds it. The
  saved file keeps the attachment, both scripts, the page XMP and the original file ID.
- **After Blackout** the check mentions nothing; the file carries pdf-lib's name as creator and producer and
  the export time.
- **On a phone** the sticky toolbar takes about 350 of 844px and covers the top of the check when scrolled to.
- **"Remove it" does not last** (RED-60, folded into this plan below): it downloads a clean copy, but the
  next Download re-exports from the draft and the attachment is back. Dropping every trace on every export
  makes Remove it unnecessary for document details; fields, comments, links and bookmarks still need it
  to last.
- Redact has no Hebrew edition yet: `/he/redact/` is a 404 and its strings have no catalogue
  (`LOCALIZED_TOOL_ISLANDS` holds merge, compress, sign).

### The shape in one paragraph

Every Redact download drops every trace, on every path, through one function called just before the export's
only two saves (`assemble()` in `redact.js` and the end of `deleteObjectsFromPdf`). The saved-file check gains one block at its top, **"What your original file
carried"**, listing in plain words what the original said about itself and what it held hidden, closed by
one line that comes from reading the saved file back: **"None of these are in your download. I read it back
to make sure."** No new control, no change to the editing stage, no choice to make on the simple path.

### 1. Attached files, scripts and page-level metadata: drop, or let the person choose

| | A. Drop on every download, name what went (recommended) | B. Drop by default, "Keep it" per attached file | C. Ask before Download when the file has any |
| --- | --- | --- | --- |
| What happens | All three go on every path, like the flattened path already does for two of them | Scripts and page notes always go; each attached file has a "Keep it in the download" button in the check that downloads again with it | A confirm dialog lists them and asks keep or drop |
| Person who attached on purpose | Sees the file named in the check right after Download; the original still has it | Can put it back in one tap | Decides before the download |
| Cost | Nothing new to remember or test beyond the drop | A per-document setting in the draft, an export option, and a download that ships a file nobody checked | A dialog on the simple path; breaks "undo over confirm" and "the simple case is the minimum" |

**Recommendation: A.** The check never looks inside an attached file, so keeping one means shipping
something unredacted by construction, and the person sharing a redacted copy rarely wants that. The person
who attached an exhibit on purpose loses nothing: Download never touches the original, and the check names
the file ("A file attached inside it: exhibit-a.pdf") before they share. Scripts and page-level notes are not
something a person adds on purpose, so they are never a choice. If real use asks for a way back, B adds on
later without changing anything in A.

For the build, not for any copy: document scripts sometimes hold the helpers a fillable form's calculations call. A
redacted copy of a calculating form may stop calculating. Field-level scripts are left as they are and the
copy never claims they go; only document scripts and the open action are dropped and described.

### 2. Where the person sees it, and the words

| | A. In the check after Download (recommended) | B. Also a line in the finish area before Download | C. Before Download only |
| --- | --- | --- | --- |
| Where | Top of the saved-file check | Under "2 boxes · 1 deletion", only when the file carries something | Same line, no read-back |
| Shown or claimed | Shown: the line under the list is the result of reading the saved bytes | A sentence about what will happen, then the check proves it | Claimed, never demonstrated |
| Cost | One block in a panel that already exists | Reads the original on load, pulling pdf-lib forward on every open | As B, and the claim is never checked |

**Recommendation: A.** Under 1A there is nothing to decide before Download, so a line before it informs
without changing any action (guideline §3, disclose by state). The editing stage stays as it is: the phone
already gives the toolbar 350px, guideline §17 asks the document to take the screen, and another toolbar
control would break Redact's count (nine balances; ten, after an export, already lands 4+4+2 on a phone;
editor.md, toolbar layout). B is the cheap add if
Shlomi wants the on-purpose person told first.

**The screen, desktop (1280).** The finish area as today: Download, "Saved redacted_lease.pdf · 4 pages",
the pages line, Compress it / Sign it. Then the check panel:

1. The lead, unchanged.
2. A small heading, **What your original file carried**.
3. A plain list, one sentence a row, in this order (only the rows the file has):
   - Made with CamScanner on an iPhone, 7 Oct 09:14
   - Titled "Lease draft", with Dana Levi as its author
   - Described as "Lease for Dana", tagged "lease dana"
   - A second set of details about the file, with its history of saves
   - A file attached inside it: original-unredacted.pdf
   - Scripts that can run when the file opens
   - Hidden details stored with page 1
4. Under the list, in the panel's normal text: **None of these are in your download. I read it back to make
   sure.**
5. Then the term rows, the picture-page note and the search box, as today. The old "This file has an
   attached file. I didn't look inside it." note now shows only if the read-back finds one (see below).

**The phone (390).** The same block, in flow, in the same order. Rows wrap; nothing is truncated, because a
name here is evidence (long file names break with `overflow-wrap: anywhere`, as `.term` already does). The
heading gets a scroll margin the height of the sticky toolbar so a jump to it is never hidden under it.

**How a detail becomes words** (pure function, one row per rule, each a unit test):

| The file holds | The row says |
| --- | --- |
| Creator, else producer | "Made with {app}", the app name exactly as written ("Microsoft® Word 2016"); nothing is shortened or invented |
| A producer or creator containing iPhone / iPad / iOS / Android / Mac OS / macOS / Windows (a plain string match, nothing else is inferred) | "on an iPhone", "on an iPad", "on an iPhone or iPad" (iOS alone), "on Android", "on a Mac", "on Windows"; no match, no device phrase |
| An app or device string nothing recognises | quoted as written: Made with "intsig.com pdf producer" |
| Creation date | ", 7 Oct 09:14": `Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' })` on the wall time the file recorded (its own offset applied, so the time reads as the device's clock said); `year: 'numeric'` added only when it is not this year |
| A modification date at least a minute later | ", last changed 9 Oct 18:02" |
| Title, author | Titled "…", with … as its author (either alone works) |
| Subject, keywords | Described as "…", tagged "…" |
| Any other Info entry | "{n} more details the app added" |
| Catalog XMP | "A second set of details about the file", plus ", with its history of saves" when it holds one |
| Attached files (names tree, and any the measurement gate finds elsewhere) | "A file attached inside it: {name}" / "{n} files attached inside it: {names}" |
| Document scripts, open action (and page `/AA` scripts if the gate finds them) | "Scripts that can run when the file opens" |
| Page `/Metadata` or `/PieceInfo` | "Hidden details stored with page 3" / "with 3 pages" |

**A file that carried nothing.** Options: say nothing; one line; the closing line alone. Recommended: one
line in place of the block, **"Your original file named no app, author or date and held nothing attached
or hidden, and neither does your download."** It names only what the reader reads, so it stays true. It is cheap in a panel that only exists after Download, and the person who came to scrub a file
gets their answer. It is true only when the reader found no trace of any kind; a file with only page notes
gets the block.

**If something survived** (a bug, since one function strips every path): that row ends "Still in your
download." in the warning style the unsolid-box note uses, the closing line is not shown, a note says "Don't
share this copy yet." (`role="alert"`), and the failure goes to `reportError`. No new Remove it kinds are
built for a state that should not happen.

**The no-absence rule.** `checkCopy.test.ts` forbids claims of absence, because text in pictures cannot be
read. The closing line names places the reader reads completely (the Info dictionary, catalog and page
keys) and does not match the test's forbidden patterns, so the test stays as it is; a new test pins the
condition instead: the closing line and the nothing-carried line come only from a zero-trace read-back.

**The existing document-detail places** (title, author, subject, keywords, XMP, attachment) stay in the
check unchanged, as the safety net behind a typed search. After the strip they should never be found; if
one is, that is the survived state above.

**Rows are segments, not strings.** `describeTraces` returns each row as a list of parts: plain text, a value
from the file (rendered in `<bdi dir="auto">`), and a date (rendered in `<time datetime>` with its display
text). `checkCopy.ts` holds the sentence templates that arrange them.

### 3. Phone, Hebrew, screen reader

- **Phone:** covered above. Rows are text, not controls, so no 44px rule applies except to the existing
  buttons. The block adds at most eight short lines to a panel the person scrolls to anyway.
- **Hebrew, now:** the English UI has to show Hebrew values correctly today. Every value from the file (title,
  author, app, file name) is wrapped in `<bdi>` with `dir="auto"` inside the sentence (guideline §9), the list
  uses `start`/`end` only, and a Hebrew-titled fixture ("חוזה שכירות", "דנה לוי") is in the unit tests and the
  e2e. Dates come from `Intl.DateTimeFormat` with the page's language.
- **Hebrew, later:** the strings go in `checkCopy.ts` as functions of their values, the shape a Redact
  catalogue will take, so the Hebrew edition translates them without restructuring. Drafts for Shlomi's
  read-through then: "מה היה בקובץ המקורי"; "נוצר ב־CamScanner באייפון, 7 באוק׳ 09:14"; "קובץ מצורף בתוכו:
  …"; "שום דבר מאלה לא נמצא בקובץ שהורדת. קראתי אותו שוב כדי לוודא."
- **Screen reader:** the block is a heading (`h3`, the check's first) and a `ul`; each date is a `<time
  datetime>`. Focus does not move (as today). When the read-back finishes, the existing polite live region
  says one sentence after "Saved. Download started.": "Checked your download: none of your original file's
  details are in it." The list itself is reached by heading navigation, never read out unasked.

### 4. The claim, demonstrated, and the docs

The block's last line is printed only from a read-back of the saved bytes by the same reader that read the
original, so the person sees a result, not a promise. The guides add how to look for yourself (Preview:
Tools, Show Inspector; Acrobat: File, Properties), so the claim can be checked outside PDkef too.

**The table the build must make true**, re-measured with step 1's script on the built code before any doc
changes:

| Row | Detail | Every path (Delete, flattened, mixed) |
| --- | --- | --- |
| T1 | Title, author, subject, keywords, and any other Info entry | gone (the Info dictionary is dropped) |
| T2 | Creator, producer, dates | none; nothing stamped by pdf-lib |
| T3 | Catalog XMP | gone |
| T4 | Attached files | gone |
| T5 | Document scripts, open action | gone (field scripts untouched, never claimed) |
| T6 | Page `/Metadata`, `/PieceInfo` | gone on every page, copied untouched or not |
| T7 | File ID | new and random on every download (pdf-lib writes none today on the flattened path, so this adds one) |
| T8 | Remove it | is a new export (RED-60), so T1 to T7 hold on it like any download |

**Doc sentences**, each tied to its rows:

- `permanently-delete-text-from-pdf.yaml`, the prose under Delete: "The downloaded copy also leaves out what
  the original said about itself: its title, author, the app and device that made it and when (T1, T2, T3).
  Files attached inside the PDF, scripts that run when it opens, and the hidden notes some apps keep on a
  page go too (T4, T5, T6). After Download, PDkef lists what your original carried and reads your copy back
  to show none of it is there."
- Same file, FAQ "Does Delete also remove links and the file details?": the same facts in two sentences, then
  the existing search sentence.
- `remove-camscanner-watermark-from-pdf.yaml`, both places: "…and the downloaded file keeps no title, author,
  app name or scan time from the original (T1, T2). After Download, the check lists what your original
  carried, like 'Made with CamScanner', and reads your copy back to show none of it is there."
- Redact FAQ (`src/data/tools.js`), a new entry, mirrored in the JSON-LD from the same source: "Does Redact
  remove the file's hidden details?" "Yes, on every download. The copy leaves out the title, author, the app
  and device that made it and its dates, any files attached inside it, scripts that run when it opens and the
  hidden notes some apps keep on a page (T1 to T6). After Download, the check lists what your original
  carried and reads your copy back to show none of it is there. Your original file keeps everything."
- The file ID (T7) stays out of the copy: it is real but has no plain-words value worth a sentence.

### 5. The tests that prove it

Pure logic, apart from the UX: `src/editor/adapters/pdf/documentTraces.js` exports
`readDocumentTraces(doc) -> DocumentTraces` and `stripDocumentTraces(doc, randomBytes)`, sharing one list of
trace kinds so reading and stripping can never disagree. `stripDocumentTraces` replaces
`clearDocumentDetails` and is called just before the two saves the export has: `assemble()` in `redact.js`
(which also creates its document with `updateMetadata: false`) and the end of `deleteObjectsFromPdf`. The
mixed path ends in `assemble()`, so it is covered without a third load and save.
`src/tools/redact/check/describeTraces.ts` turns traces plus a locale and today into rows. The UI only
renders rows.

Unit tests, each seen failing first:

- **Read, one per kind:** creator, producer, creation date, modification date, other Info entry, XMP with
  history, attached file, names-tree script, open action, page `/Metadata`, page `/PieceInfo`. Red today for
  every kind but title, author, subject, keywords, XMP and attachments.
- **Strip, one per kind** on a document carrying it, plus a new random ID (two calls give two IDs).
- **Each path end to end in Node:** Delete only (red today for T4, T5, T6, T7), flattened with one page
  copied untouched (red today for T2, T6, T7), mixed. Each asserts T1 to T7 on the saved bytes.
- **Describe, one per row** of the words table, plus a Hebrew title and author, a date in another year, and
  `he` locale dates.
- **Copy:** the closing line and the nothing-carried line are returned only for a zero-trace read-back.
- **UI:** `SavedFileCheck` renders the block, the nothing-carried line, and the survived state with its alert.

One e2e, `src/tools/redact/e2e/redact-hidden-traces.spec.js`, with a committed two-page fixture carrying every
trace (page 2 has page notes and is left untouched): download once with a Delete on page 1 and once with a
Blackout on page 1; read each saved file back with pdf-lib and assert no trace of any kind and an ID unlike
the original's; assert the check shows "Made with CamScanner" and the closing line. Seen failing before the
build.

### Traces step 1 did not measure: a gate before the build

The words above ("None of these are in your download", the FAQ's "on every download") hold only if these
are measured first and, where present, covered. Add them to the step 1 table, measured the same way:

- **Page thumbnails (`/Thumb`):** a small picture of the page as it was. On a Delete page it would still show
  what was deleted.
- **Additional actions (`/AA`)** on the document and pages: scripts that run on open, close or print.
- **Files attached elsewhere:** file-attachment comments (`placeLocator.ts` already knows them) and `/AF`,
  which `copyPages` may carry onto untouched pages.
- **Details stored on images and drawn objects** (`/Metadata`, `/PieceInfo` on XObjects).
- **Other Info entries** (Word's `SourceModified`, a company name): Delete clears named keys only.

Each one found widens the T row it belongs to and gets its unit tests; the words table gains a row only
where a plain sentence exists ("A small picture of page 3 as it was").

### Remove it lasts (RED-60, reviewed with this plan)

RED-60's ticket and its red guard (`redact-check-remove-sticks.spec.js`, on the peer branch
`claude/strange-ramanujan-2f598c`, to be cherry-picked here; the red spec must not reach main before the
fix) cover what this plan's strip does not: a field value, comment, link or bookmark removed from the
check. Its design shares one seam with the strip: `applyPageEdits` takes one optional `finish(doc)` step,
run right before each of the two saves, and Redact passes `removePlaces(doc, removedPlaces)`, pure, on
`placeLocator`. The removals live in Redact's work on the document (`extra.removedPlaces`), so a reload or
recents bring them back. Nothing shows in the editing stage; the next file and its check are the evidence.

Decisions (RED-60's, recommendation first):
- (a) Remove it records the removal and runs the normal export (one path; slower on flattened pages), or
  keeps the instant byte patch and only records for later downloads.
- (b) A removal is an Undo/Redo step, a new history operation with no page; no undo chip.
- (c) No new UI while editing.
- (d) Record every removable kind except `unused`, or only the four this plan's strip leaves.

### Decisions for Shlomi

1. Hidden parts: drop on every download and name them (recommended), or a "Keep it" per attached file.
2. Where: the check after Download only (recommended), or also a line before Download.
3. A file that carried nothing: the one line (recommended), or silence.
4. The words: the table above and the closing line, "None of these are in your download. I read it back to
   make sure."
5. The measurement gate runs before the build, not as an option: the copy depends on it.

## 2026-10-08 built

Shlomi approved every recommendation, plus one addition: an attached file can be kept. Built in
parallel by Sonnet implementers on disjoint files, each test seen red first, reviewed by a zero-context
agent and walked on the dev server at 390 and 1280.

- **Gate, measured before the build** (scratchpad `red59-gate/`): on a copied page both paths kept page
  thumbnails, page scripts, file-attachment comments with their payloads and details on images and
  drawn objects; Delete also kept custom Info keys, catalog scripts and `/AF`. No path wrote a file ID.
- **One list of trace kinds, read and stripped by the same module** (`src/editor/adapters/pdf/
  documentTraces.js`, `pdfDate.js`): Info (all keys), catalog XMP and `/PieceInfo`, attachments in all
  three shapes, document and page scripts, thumbnails, page and XObject details, and a fresh random ID.
  `stripDocumentTraces` runs before each of the export's two saves (`assemble()`, `deleteObjectsFromPdf`)
  behind `applyPageEdits(file, elements, onProgress, { finish, keepAttachments })`; `finish` replays
  RED-60's removals on the first pass only. A kept attachment is copied across the flattened path.
- **The check** reads both files' traces back (`runCheck.ts`), `describeTraces.ts` turns them into rows of
  parts (values in `<bdi>`, dates in `<time>`, `en-GB` for the English page), and `TracesBlock.tsx` shows
  them struck through with a hidden "Gone:" prefix, one read-back line, the nothing-carried line, or the
  survived state (danger row, alert, an error report). Keep it / Drop it on document-level attachments
  only; kept names live in the draft (`extra.keptAttachments`).
- **Docs**: the two guides and a new Redact FAQ entry, each sentence traced to T1 to T7 (table in
  `docs/redact-content-removal.md`).
- **Tests**: units per kind for read, strip, each path, each row, the copy, the UI; `redact-hidden-traces.
  spec.js` saves a fixture carrying every trace through Delete and Blackout and reads none back, then
  keeps one. `check:push` and `check:e2e` green.
- **Review findings fixed**: a kept file counted as survived (false error report), replay on both passes of
  a mixed export, Keep it offered on a comment a flattened page cannot keep, catalog `/PieceInfo`
  unread, and pdf-lib reaching `/redact/`'s first paint through `hasNoTraces` (caught by `test:lazy-modules`).

## 2026-10-08 re-planned: the details are yours to keep, alter or delete

Shlomi rejected the built presentation and its premise: "redact does not mean anonymize or obfuscate".
A person with a bank slip or a health declaration marks some of what is on the page, not all of it, and
the file's details get the same treatment. Sketch v7 (https://claude.ai/artifact/4F91rByrrsZ71Fwe144Ryj),
his calls in order: not dominant, at the document's foot, out of the workflow unless something was
changed; no "Every page keeps its text" line when nothing changed; a detail is never "blacked out", it is
either deleted or altered, two visible actions.

**The model.** Nothing in the file's details changes unless the person changes it. The export keeps every
detail as it came, with one exception that is page redaction, not a detail choice: a cached page picture
from before the marks (`/Thumb`) always goes, because a mark can be seen through it. The sheet says so in
one line.

**Rows** (derived from `readDocumentTraces`, in this order, only rows with something in them): Title,
Author, Subject, Keywords (text, Edit or Delete); Made with (creator and producer, Edit or Delete); Created,
Changed (dates, Delete only); Attached, one per file (Delete only); Scripts (Delete only); Hidden, one row
for the second copy of the details (XMP), the app's own notes (catalog and page `/PieceInfo`, other Info
keys, page and image `/Metadata`) (Delete only). Altering or deleting any text row also deletes the XMP
copy, since it would still carry the old value; the Hidden row then shows as deleted with "goes with the
changes above" and no Undo.

**Where.** One muted line under the last page, in the page-count's voice, the values joined by " · ", with
"Review" as the only way in. Review opens a sheet (`<dialog>`, `showModal()`): each row label, value, Edit
and Delete; a deleted row struck through with Undo; an edited row an input with Done. Done closes.

**Saved state.** Untouched: exactly today's saved state, no mention. Changed: one line in the footer's
voice, "Details: author deleted, title altered." with Review, and the check reads the download back:
every deleted row absent, every altered row carrying its new value. A detail that survived is the existing
survived state (danger line, error report).

**State.** `edits.details: Record<rowId, { action: 'delete' } | { action: 'alter', value: string }>`,
per document in the draft (`extra.details`), validated. Replaces `keptAttachments`, Keep it / Drop it,
`TracesBlock` and the TRACES_* copy, which are removed, not hidden.
