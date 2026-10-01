<!-- GENERATED FILE: edit backlog/tasks/*.md, then run npm run generate:backlog -->

# Backlog

The canonical backlog is the task-file collection in [backlog/tasks/](backlog/tasks/). This view is generated and read-only. 48 live: 3 up next, 17 then, 19 waiting, 9 parked.

## Redact: finish removal

Find covers exactly what it matched, Delete reaches every object, and the saved-file check can remove what it finds.

### Waiting

| ID | P | Task | Note |
| --- | --- | --- | --- |
| RED-46 | P2 | [RED-46](backlog/tasks/RED-46.md) · The Redact page speaks the tool's words, without losing what people search for | Waiting on 2026-10-08. Needs Shlomi: The 2026-10-08 Search Console export of /redact/ queries (filter for flatten, text layer, permanent, white out, remove text, metadata, erase) |

## Sign: finish fill mode

Fill mode is the default since SNG-19. Close the test gaps, then desktop parity, then retire the old editor.

### Up next

| ID | P | Task | Note |
| --- | --- | --- | --- |
| SNG-21 | P2 | [SNG-21](backlog/tasks/SNG-21.md) · Fill mode's pinch-zoom e2e runs on CI's Linux Chromium too |  |
| SNG-20 | P2 | [SNG-20](backlog/tasks/SNG-20.md) · iOS gate: drive pinch-zoom, then the keyboard's Next, in the Simulator |  |

### Then, in order

| ID | P | Task | Note |
| --- | --- | --- | --- |
| SNG-09 | P1 | [SNG-09](backlog/tasks/SNG-09.md) · Every mark lands neatly: at the fingertip, text sits on the line, a tick centres in its box, a circle wraps the word, a strike runs through it; local, declining when unsure, on every document |  |
| SNG-04 | P1 | [SNG-04](backlog/tasks/SNG-04.md) · One interaction machine and one input router, pure and synchronous, with the MOBI history as tests |  |
| SNG-06 | P2 | [SNG-06](backlog/tasks/SNG-06.md) · Fill mode on desktop and iPad: parity, then retire the old editor behind ?next=0 |  |
| SNG-22 | P3 | [SNG-22](backlog/tasks/SNG-22.md) · Fill mode draws its own text caret, 1.05em tall, so a tall-metric font's caret stays inside the field |  |

### Parked

| ID | P | Task | Note |
| --- | --- | --- | --- |
| SNG-12 | P3 | [SNG-12](backlog/tasks/SNG-12.md) · The model step (postponed): a model the person connects reads the form, and a document that clears 90/90/85 unlocks asking its questions |  |

## Form detector accuracy

Every detected spot is a stop in fill mode, so false positives reach people directly. One fix at a time, since each re-records the baselines.

### Then, in order

| ID | P | Task | Note |
| --- | --- | --- | --- |
| FORM-10 | P2 | [FORM-10](backlog/tasks/FORM-10.md) · The undivided-panel test reads the whole page, and a lone tick square survives only by accident |  |
| FORM-03 | P2 | [FORM-03](backlog/tasks/FORM-03.md) · Take label association to the 85% gate, starting with the column header a tall table's last row cannot reach |  |
| FORM-07 | P2 | [FORM-07](backlog/tasks/FORM-07.md) · A scanned form's ruled geometry, from its raster |  |

### Parked

| ID | P | Task | Note |
| --- | --- | --- | --- |
| FORM-02 | P3 | [FORM-02](backlog/tasks/FORM-02.md) · Canonical field types, so a detected box can become a question |  |
| FORM-06 | P3 | [FORM-06](backlog/tasks/FORM-06.md) · Spike: measure Tesseract heb on the two evidence forms before building any scanned path |  |
| FORM-08 | P3 | [FORM-08](backlog/tasks/FORM-08.md) · Re-evaluate pdf-inspector: the MIT crate grew the positioned API the wasm build still hides |  |
| FORM-15 | P3 | [FORM-15](backlog/tasks/FORM-15.md) · 1040 amount boxes the form leaves blank read as fields |  |
| FORM-29 | P3 | [FORM-29](backlog/tasks/FORM-29.md) · The detector's cell, line and widget readers are type-checked |  |

## Robustness and debt

Production errors you can see, small tools that clean up after themselves, and drafts whose limits people can see.

### Up next

| ID | P | Task | Note |
| --- | --- | --- | --- |
| DEBT-17 | P1 | [DEBT-17](backlog/tasks/DEBT-17.md) · We cannot see what breaks in production, and a day proved it | Needs Shlomi: The telemetry governance call |

### Then, in order

| ID | P | Task | Note |
| --- | --- | --- | --- |
| QUAL-19 | P2 | [QUAL-19](backlog/tasks/QUAL-19.md) · Sign's corpus scoring test sets up inside its hook timeout under a full run |  |
| UNDO-05 | P2 | [UNDO-05](backlog/tasks/UNDO-05.md) · Merge and Split share one undo chip, and Split's stops leaking |  |
| DEBT-21 | P3 | [DEBT-21](backlog/tasks/DEBT-21.md) · Nothing checks that a navigating-away flag uses the hook that survives a Back |  |
| MEM-10 | P1 | [MEM-10](backlog/tasks/MEM-10.md) · A shipped fix has no way to reach someone who keeps the app open | Needs Shlomi: A ruling on updates with several tabs open |
| ARCH-32 | P2 | [ARCH-32](backlog/tasks/ARCH-32.md) · e2e selected by file-level reachability: a src/editor/ change runs the pages that import it |  |
| DEBT-15 | P3 | [DEBT-15](backlog/tasks/DEBT-15.md) · Field placement: a points-based combFontSize signature, and comments that carry the why, not the incident log |  |

### Waiting

| ID | P | Task | Note |
| --- | --- | --- | --- |
| MOBI-01 | P1 | [MOBI-01](backlog/tasks/MOBI-01.md) · Verify the Android share-sheet round trip on real hardware | Waiting on An Android phone. Needs Shlomi: Half an hour with an Android phone |

### Parked

| ID | P | Task | Note |
| --- | --- | --- | --- |
| MOBI-08 | P3 | [MOBI-08](backlog/tasks/MOBI-08.md) · Offer install at the moment it pays off, not in a card about working offline |  |

## Search and languages

Mostly waiting on dated Search Console reads. Two small things can ship now.

### Then, in order

| ID | P | Task | Note |
| --- | --- | --- | --- |
| SEO-03 | P1 | [SEO-03](backlog/tasks/SEO-03.md) · External signals: the work that moves the constraint and does not live in this repo |  |

### Waiting

| ID | P | Task | Note |
| --- | --- | --- | --- |
| LOC-17 | P1 | [LOC-17](backlog/tasks/LOC-17.md) · Read 2026-11-08 · Indonesian pilot: kompres pdf 1 mb / di bawah 1 mb family | Waiting on 2026-11-08 |
| SEO-04 | P1 | [SEO-04](backlog/tasks/SEO-04.md) · Read 2026-10-08 · Thirteen blur queries are on page one and earning zero clicks | Waiting on 2026-10-08 |
| SEO-05 | P1 | [SEO-05](backlog/tasks/SEO-05.md) · Read 2026-10-08 · The 100KB cluster ranks and does not convert, and the page implies something untrue | Waiting on 2026-10-08 |
| SEO-06 | P1 | [SEO-06](backlog/tasks/SEO-06.md) · Read 2026-10-08 · Nine URLs have never been crawled, and three of them are working tools | Waiting on 2026-10-08 |
| SEO-39 | P1 | [SEO-39](backlog/tasks/SEO-39.md) · The 2026-10-08 Search Console read | Waiting on 2026-10-08. Needs Shlomi: The Search Console exports |
| LOC-03 | P2 | [LOC-03](backlog/tasks/LOC-03.md) · Read 2026-11-06 · Hebrew pilot: three tool pages, phrased the way Israelis actually search, reviewed in-house | Waiting on 2026-11-06 |
| LOC-13 | P2 | [LOC-13](backlog/tasks/LOC-13.md) · Spanish pilot: one target-size compress page for Mexico, on the niche this domain already wins | Waiting on LOC-17 and SEO-40 |
| LOC-18 | P2 | [LOC-18](backlog/tasks/LOC-18.md) · Hebrew edition sign-off: Israeli portal-limit guides and Shlomi's own /he/ read-through | Waiting on Shlomi's read-through. Needs Shlomi: Israeli portal size limits and a read-through of /he/ |
| SEO-17 | P2 | [SEO-17](backlog/tasks/SEO-17.md) · Read 2026-11-06 · One content page on portal size limits, instead of three doorway pages | Waiting on 2026-11-06 |
| SEO-20 | P2 | [SEO-20](backlog/tasks/SEO-20.md) · New tool: crop a PDF, the only one of these with nothing to apologise for | Waiting on SEO-06 crawl gate and a volume check |
| SEO-30 | P2 | [SEO-30](backlog/tasks/SEO-30.md) · A two-click demo below the Compress hero, for a visitor who has never used a PDF tool before | Waiting on SEO-05's verdict |
| SEO-38 | P2 | [SEO-38](backlog/tasks/SEO-38.md) · One honest guide: remove the "Scanned with CamScanner" footer from a PDF | Waiting on About four weeks after indexing |
| SEO-40 | P2 | [SEO-40](backlog/tasks/SEO-40.md) · The November eight-week reads | Waiting on 2026-11-07. Needs Shlomi: The Search Console exports |
| SEO-22 | P3 | [SEO-22](backlog/tasks/SEO-22.md) · New tool: extract the images embedded in a PDF, without a zip dependency | Waiting on SEO-06 crawl gate and a volume check |
| SEO-23 | P3 | [SEO-23](backlog/tasks/SEO-23.md) · New tool: convert a PDF to grayscale, with the cost stated | Waiting on SEO-06 crawl gate and a volume check |
| SEO-24 | P3 | [SEO-24](backlog/tasks/SEO-24.md) · New tool: make a PDF look scanned | Waiting on SEO-06 crawl gate and a volume check |
| SEO-32 | P3 | [SEO-32](backlog/tasks/SEO-32.md) · New tool: PDF to Markdown, English-only v1, Hebrew/RTL deferred pending anydoc-wasm's dependency bump | Waiting on SEO-06 crawl gate and a volume check |

### Parked

| ID | P | Task | Note |
| --- | --- | --- | --- |
| DEMO-11 | P3 | [DEMO-11](backlog/tasks/DEMO-11.md) · The O on the Hebrew home page | Needs Shlomi: Your call on beat 4 |
| SEO-16 | P3 | [SEO-16](backlog/tasks/SEO-16.md) · Positioning review: Merge, Split and Protect & Unlock |  |

## Polish

Small, independent, good for a spare hour.

### Then, in order

| ID | P | Task | Note |
| --- | --- | --- | --- |
| QUAL-04 | P3 | [QUAL-04](backlog/tasks/QUAL-04.md) · --color-border-strong is 2.07:1 on white and 1.80:1 on the primary tint, under the 3:1 boundary guideline |  |
| SIGN-20 | P3 | [SIGN-20](backlog/tasks/SIGN-20.md) · The per-script pixel guards are close to blind to a cluster whose ink is right and whose advance is wrong |  |
| QUAL-14 | P3 | [QUAL-14](backlog/tasks/QUAL-14.md) · Citron stroke on the Hebrew pages: a Hebrew on-device phrase for the tool subheads and the closing heading | Needs Shlomi: The Hebrew wording |

# Closed work

Done and retired tickets are not listed. Their files stay in [backlog/tasks/](backlog/tasks/) as the record.

- Redact: finish removal: 9 done, 0 retired
- Sign: finish fill mode: 0 done, 1 retired
- Form detector accuracy: 6 done, 0 retired
- Robustness and debt: 3 done, 0 retired
- Search and languages: 3 done, 0 retired
- Polish: 2 done, 0 retired
- Sign tool architecture: 37 done, 1 retired
- Editor architecture: 14 done, 0 retired
- Fonts and script support: 6 done, 3 retired
- Landing story and demo: 10 done, 0 retired
- Mobile round trip: 22 done, 7 retired
- Site quality: 14 done, 1 retired
- Search acquisition: 11 done, 1 retired
- Localized search: 9 done, 1 retired
- Awaiting a read: 0 done, 10 retired
- English base: 1 done, 1 retired
- Hebrew edition: 2 done, 0 retired
- Merge tool: 19 done, 0 retired
- Localization pilots: 1 done, 0 retired
- Module boundaries: 20 done, 2 retired
- Architecture debt: 16 done, 2 retired
- Undo and redo: 5 done, 0 retired
- One memory space: 3 done, 0 retired
- Form understanding: 15 done, 3 retired
- Sign next generation: 7 done, 6 retired
- Redact tool: 30 done, 11 retired
