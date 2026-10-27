<!-- GENERATED FILE: edit backlog/tasks/*.md, then run npm run generate:backlog -->

# TODO

What is next across the board. Every lane, with its full order, is in [BACKLOG.md](BACKLOG.md).

## Up next

### Robustness and debt

- [DEBT-64](backlog/tasks/DEBT-64.md) P2 · Merge's phone chip test passes alone and fails under parallel load
- [DEBT-65](backlog/tasks/DEBT-65.md) P2 · Two layout-shift specs failed once each in the 2026-10-27 nightly
- [ENC-16](backlog/tasks/ENC-16.md) P2 · Locked-file state polish: Merge's calm notice, the panel's sizing, focus ring and file name (in progress)

### Unify the tools, narrow the graph

- [ARCH-51](backlog/tasks/ARCH-51.md) P2 · Merge keeps its lifecycle in one reducer and its decisions in mergePlan (in progress)
- [ARCH-52](backlog/tasks/ARCH-52.md) P2 · Sign keeps its document and finish lifecycle in one typed reducer (in progress)
- [ARCH-53](backlog/tasks/ARCH-53.md) P2 · Compress runs its build and gate lifecycle through one explicit state machine (in progress)
- [ARCH-37](backlog/tasks/ARCH-37.md) P2 · Opening a file is one hook per kind of tool (in progress)
- [ARCH-55](backlog/tasks/ARCH-55.md) P2 · pdfObjects.js splits into a parser, one text-state interpreter and extractors (in progress)
- [ARCH-67](backlog/tasks/ARCH-67.md) P2 · The draft store is TypeScript with one record type parsed where it is read (in progress)
- [ARCH-79](backlog/tasks/ARCH-79.md) P2 · E2e specs wait on conditions, and fixed sleeps are a shrinking ratchet (in progress)
- [ARCH-88](backlog/tasks/ARCH-88.md) P2 · Shadows and scrims are tokens, and color literals outside :root fail a check (in progress)

### Search and languages

- [SEO-03](backlog/tasks/SEO-03.md) P1 · External signals: the work that moves the constraint and does not live in this repo
- [SEO-47](backlog/tasks/SEO-47.md) P1 · Page tools get the names people search: Organize, Rotate, Remove pages, Page numbers, Extract pages (in progress)
- [LOC-18](backlog/tasks/LOC-18.md) P2 · Hebrew edition sign-off: Israeli portal-limit guides and Shlomi's own /he/ read-through (in progress)
- [SEO-46](backlog/tasks/SEO-46.md) P2 · Real star ratings: ask once when a tool finishes, bake an honest aggregate into each tool page, and win the SERP stars (in progress)
- [SEO-48](backlog/tasks/SEO-48.md) P2 · Ratings carry country and region, and a person may add a comment (in progress)
- [SCAN-01](backlog/tasks/SCAN-01.md) P3 · Scan to PDF: its own tool at /scan-to-pdf/, sharing Image to PDF's engine, plus a how-to-scan-to-PDF guide (in progress)

### Polish

- [QUAL-21](backlog/tasks/QUAL-21.md) P2 · Pages render at the size they are shown, and the practice form's logo is sharp (in progress)

## Waiting, by date

- 2026-10-28: [SEO-45](backlog/tasks/SEO-45.md) · /merge/ left Google's results on 2026-10-08, the day its new title was crawled: put the old title and H1 back and read it
- 2026-11-06: [LOC-03](backlog/tasks/LOC-03.md) · Read 2026-11-06 · Hebrew pilot: three tool pages, phrased the way Israelis actually search, reviewed in-house
- 2026-11-06: [SEO-17](backlog/tasks/SEO-17.md) · Read 2026-11-06 · One content page on portal size limits, instead of three doorway pages
- 2026-11-06: [SEO-42](backlog/tasks/SEO-42.md) · Read 2026-11-06 · Title test: "No Upload" in the Split and Compress titles, read per query in Search Console
- 2026-11-07: [SEO-40](backlog/tasks/SEO-40.md) · The November eight-week reads
- 2026-11-07: [SEO-44](backlog/tasks/SEO-44.md) · /split/ ranks 51.6 for a head term that Compress, on the same domain, ranks 9.4 for: find the page-level difference
- 2026-11-08: [LOC-17](backlog/tasks/LOC-17.md) · Read 2026-11-08 · Indonesian pilot: kompres pdf 1 mb / di bawah 1 mb family
- A full UTC day of production reads on a stamped build with the fix: [DEBT-44](backlog/tasks/DEBT-44.md) · Every counted failure leaves a trace in the error reports
- An Android phone: [MOBI-01](backlog/tasks/MOBI-01.md) · Verify the Android share-sheet round trip on real hardware
- A full UTC day of production reads on a build with the fix: [RED-57](backlog/tasks/RED-57.md) · Redact export never embeds an empty page picture on a large page
- A full UTC day of production reads on a stamped build with the fix: [DEBT-42](backlog/tasks/DEBT-42.md) · pdf.js runs on browsers that lack the built-ins it calls
- A full UTC day of production reads on a stamped build with the fix: [DEBT-51](backlog/tasks/DEBT-51.md) · Redact and Sign export from the bytes they hold, so a file gone from disk still exports
- LOC-17 and SEO-40: [LOC-13](backlog/tasks/LOC-13.md) · Spanish pilot: one target-size compress page for Mexico, on the niche this domain already wins
- An iPhone check, and a day of production reads with no check_saved_file NotReadableError: [RED-63](backlog/tasks/RED-63.md) · Redact: saved-file check should fall back quietly when the saved file is unreadable on iOS
- A day of production reads after the fix with no details_read EncryptedPDFError: [RED-64](backlog/tasks/RED-64.md) · Redact details reader waits for the document to open, so a protected PDF never reaches pdf-lib
- SEO-06 crawl gate and a volume check: [SEO-20](backlog/tasks/SEO-20.md) · New tool: crop a PDF, the only one of these with nothing to apologise for
- SEO-05's verdict: [SEO-30](backlog/tasks/SEO-30.md) · A two-click demo below the Compress hero, for a visitor who has never used a PDF tool before
- About four weeks after indexing: [SEO-38](backlog/tasks/SEO-38.md) · One honest guide: remove the "Scanned with CamScanner" footer from a PDF
- The next Sign NotFoundError report, with the translated flag: [SIGN-40](backlog/tasks/SIGN-40.md) · Sign: Preact NotFoundError while arming a tool or placing a mark
- @astrojs/preact peer range admits preact 11: [DEBT-40](backlog/tasks/DEBT-40.md) · Move to preact 11 once @astrojs/preact supports it
- A full UTC day of production reads on a stamped build with the fix: [DEBT-48](backlog/tasks/DEBT-48.md) · The usage funnel can say how many sessions finished, not only how many runs
- A Playwright release whose WebKit starts on Ubuntu 26.04: [QUAL-28](backlog/tasks/QUAL-28.md) · Move e2e-webkit back to ubuntu-latest once Playwright's WebKit runs on Ubuntu 26.04
- SEO-06 crawl gate and a volume check: [SEO-22](backlog/tasks/SEO-22.md) · New tool: extract the images embedded in a PDF, without a zip dependency
- SEO-06 crawl gate and a volume check: [SEO-23](backlog/tasks/SEO-23.md) · New tool: convert a PDF to grayscale, with the cost stated
- SEO-06 crawl gate and a volume check: [SEO-24](backlog/tasks/SEO-24.md) · New tool: make a PDF look scanned
- SEO-06 crawl gate and a volume check: [SEO-32](backlog/tasks/SEO-32.md) · New tool: PDF to Markdown, English-only v1, Hebrew/RTL deferred pending anydoc-wasm's dependency bump

## Needs Shlomi

- [MOBI-01](backlog/tasks/MOBI-01.md) · Half an hour with an Android phone
- [SEO-45](backlog/tasks/SEO-45.md) · The 2026-10-28 Search Console read of /merge/ (Queries, Compare, position on)
- [DEBT-53](backlog/tasks/DEBT-53.md) · A check on your iPhone
- [SEO-40](backlog/tasks/SEO-40.md) · The Search Console exports
- [SEO-42](backlog/tasks/SEO-42.md) · The /compress/ query export (28 days before and after 2026-10-08) and /compress-image/ filtered to queries containing pdf
- [SEO-44](backlog/tasks/SEO-44.md) · The 2026-11-07 Search Console export: the /split/ and /he/split/ rows

See [BACKLOG.md](BACKLOG.md) for every lane.
