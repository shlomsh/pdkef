<!-- GENERATED FILE: edit backlog/tasks/*.md, then run npm run generate:backlog -->

# Backlog

The canonical backlog is the task-file collection in [backlog/tasks/](backlog/tasks/). This view is generated and read-only. 46 live: 6 up next, 8 then, 16 waiting, 16 parked.

## Redact: finish removal

Find covers exactly what it matched, Delete reaches every object, and the saved-file check can remove what it finds.

### Up next

| ID | P | Task | Note |
| --- | --- | --- | --- |
| RED-57 | P1 | [RED-57](backlog/tasks/RED-57.md) · Redact export never embeds an empty page picture on a large page | In progress |

### Then, in order

| ID | P | Task | Note |
| --- | --- | --- | --- |
| RED-56 | P2 | [RED-56](backlog/tasks/RED-56.md) · Redact: defer old-document dispose until after the pdfDocument prop swaps |  |
| RED-62 | P2 | [RED-62](backlog/tasks/RED-62.md) · Text drawn twice for a bold look reads as doubled letters under a box |  |

### Parked

| ID | P | Task | Note |
| --- | --- | --- | --- |
| RED-58 | P3 | [RED-58](backlog/tasks/RED-58.md) · The two redaction guides speak the tool's words, as the Redact page now does |  |

## Sign: finish fill mode

Fill mode is the default since SNG-19. Close the test gaps, then desktop parity, then retire the old editor.

### Then, in order

| ID | P | Task | Note |
| --- | --- | --- | --- |
| SNG-06 | P2 | [SNG-06](backlog/tasks/SNG-06.md) · Fill mode on desktop and iPad: parity, then retire the old editor behind ?next=0 |  |
| SNG-22 | P3 | [SNG-22](backlog/tasks/SNG-22.md) · Fill mode draws its own text caret, 1.05em tall, so a tall-metric font's caret stays inside the field |  |
| SNG-23 | P2 | [SNG-23](backlog/tasks/SNG-23.md) · In the Simulator, the first tap on a field after tapping outside does not focus it |  |

### Parked

| ID | P | Task | Note |
| --- | --- | --- | --- |
| SNG-09 | P1 | [SNG-09](backlog/tasks/SNG-09.md) · Every mark lands neatly: at the fingertip, text sits on the line, a tick centres in its box, a circle wraps the word, a strike runs through it; local, declining when unsure, on every document |  |
| SNG-04 | P1 | [SNG-04](backlog/tasks/SNG-04.md) · One interaction machine and one input router, pure and synchronous, with the MOBI history as tests |  |
| SNG-12 | P3 | [SNG-12](backlog/tasks/SNG-12.md) · The model step (postponed): a model the person connects reads the form, and a document that clears 90/90/85 unlocks asking its questions |  |

## Form detector accuracy

Every detected spot is a stop in fill mode, so false positives reach people directly. One fix at a time, since each re-records the baselines.

### Up next

| ID | P | Task | Note |
| --- | --- | --- | --- |
| FORM-36 | P2 | [FORM-36](backlog/tasks/FORM-36.md) · Add BTL 1500 (05.2026) to the scored corpus: a held-out Hebrew Word form | In progress |

### Then, in order

| ID | P | Task | Note |
| --- | --- | --- | --- |
| FORM-35 | P2 | [FORM-35](backlog/tasks/FORM-35.md) · Count how often Sign opens a page that is only an image, before building anything for scans |  |

### Parked

| ID | P | Task | Note |
| --- | --- | --- | --- |
| FORM-07 | P2 | [FORM-07](backlog/tasks/FORM-07.md) · A scanned form's ruled geometry, from its raster |  |
| FORM-06 | P3 | [FORM-06](backlog/tasks/FORM-06.md) · Spike: measure Tesseract heb on the two evidence forms before building any scanned path |  |
| FORM-08 | P3 | [FORM-08](backlog/tasks/FORM-08.md) · Re-evaluate pdf-inspector: the MIT crate grew the positioned API the wasm build still hides |  |

## Robustness and debt

Production errors you can see, small tools that clean up after themselves, and drafts whose limits people can see.

### Up next

| ID | P | Task | Note |
| --- | --- | --- | --- |
| DEBT-42 | P2 | [DEBT-42](backlog/tasks/DEBT-42.md) · pdf.js runs on browsers that lack the built-ins it calls | In progress |

### Waiting

| ID | P | Task | Note |
| --- | --- | --- | --- |
| MOBI-01 | P1 | [MOBI-01](backlog/tasks/MOBI-01.md) · Verify the Android share-sheet round trip on real hardware | Waiting on An Android phone. Needs Shlomi: Half an hour with an Android phone |
| SIGN-40 | P2 | [SIGN-40](backlog/tasks/SIGN-40.md) · Sign: Preact NotFoundError while arming a tool or placing a mark | Waiting on The next Sign NotFoundError report, with the translated flag |
| DEBT-40 | P3 | [DEBT-40](backlog/tasks/DEBT-40.md) · Move to preact 11 once @astrojs/preact supports it | Waiting on @astrojs/preact peer range admits preact 11 |

### Parked

| ID | P | Task | Note |
| --- | --- | --- | --- |
| ENC-09 | P3 | [ENC-09](backlog/tasks/ENC-09.md) · Merge tells a protected file from an unreadable one, and takes the unlocked file back |  |
| ENC-10 | P3 | [ENC-10](backlog/tasks/ENC-10.md) · The daily read counts protected files as a funnel |  |
| ENC-14 | P3 | [ENC-14](backlog/tasks/ENC-14.md) · PDF to Image meets a protected PDF at the door and leads back after Unlock |  |
| ENC-11 | P3 | [ENC-11](backlog/tasks/ENC-11.md) · Every tool's intake is tested against a real protected file in one table |  |
| MEM-12 | P3 | [MEM-12](backlog/tasks/MEM-12.md) · An alert when people are stuck on an old build |  |
| MOBI-08 | P3 | [MOBI-08](backlog/tasks/MOBI-08.md) · Offer install at the moment it pays off, not in a card about working offline |  |

## Search and languages

Mostly waiting on dated Search Console reads. Two small things can ship now.

### Up next

| ID | P | Task | Note |
| --- | --- | --- | --- |
| SEO-03 | P1 | [SEO-03](backlog/tasks/SEO-03.md) · External signals: the work that moves the constraint and does not live in this repo |  |
| SEO-42 | P2 | [SEO-42](backlog/tasks/SEO-42.md) · Title test: put "No Upload" in the Split and Compress titles and read the result in Search Console | In progress. Needs Shlomi: The 28-day Search Console read for /compress/ about 2026-11-06 |
| SEO-44 | P2 | [SEO-44](backlog/tasks/SEO-44.md) · /split/ ranks 51.6 for a head term that Compress, on the same domain, ranks 9.4 for: find the page-level difference |  |

### Waiting

| ID | P | Task | Note |
| --- | --- | --- | --- |
| LOC-17 | P1 | [LOC-17](backlog/tasks/LOC-17.md) · Read 2026-11-08 · Indonesian pilot: kompres pdf 1 mb / di bawah 1 mb family | Waiting on 2026-11-08 |
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
| DEMO-11 | P3 | [DEMO-11](backlog/tasks/DEMO-11.md) · The O on the Hebrew home page |  |
| SEO-16 | P3 | [SEO-16](backlog/tasks/SEO-16.md) · Positioning review: Merge, Split and Protect & Unlock |  |

## Polish

Small, independent, good for a spare hour.

### Then, in order

| ID | P | Task | Note |
| --- | --- | --- | --- |
| QUAL-04 | P3 | [QUAL-04](backlog/tasks/QUAL-04.md) · --color-border-strong is 2.07:1 on white and 1.80:1 on the primary tint, under the 3:1 boundary guideline |  |
| SIGN-20 | P3 | [SIGN-20](backlog/tasks/SIGN-20.md) · The per-script pixel guards are close to blind to a cluster whose ink is right and whose advance is wrong |  |

### Parked

| ID | P | Task | Note |
| --- | --- | --- | --- |
| ENC-12 | P3 | [ENC-12](backlog/tasks/ENC-12.md) · One hand-off row, not four copies |  |

# Closed work

Done and retired tickets are not listed. Their files stay in [backlog/tasks/](backlog/tasks/) as the record.

- Redact: finish removal: 19 done, 1 retired
- Sign: finish fill mode: 2 done, 1 retired
- Form detector accuracy: 15 done, 1 retired
- Robustness and debt: 36 done, 3 retired
- Search and languages: 7 done, 0 retired
- Polish: 3 done, 0 retired
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
