# Show HN fact sheet (SEO-03, 2026-11-17)

Raw material for Shlomi's Show HN post and for answering its comments. Hacker News does not allow
generated or AI-edited posts or comments, so nothing here is meant to be pasted: Shlomi writes the post
and the replies himself, and this sheet only holds the facts. Each one was checked against the code on
2026-11-17 and carries its evidence. If the code changes before the post goes up, check the line again.

## Links

- Site: https://pdkef.com/
- Source: https://github.com/shlomsh/pdkef (MIT)
- Redaction guide: https://pdkef.com/blur-vs-blackout-vs-delete-pdf/

## The post

- Title (Shlomi's words win): build it on one of the leads in the next section, not on "free PDF tools
  in your browser" alone. HN titles take a plain hyphen. Don't use "first", "best" or a superlative.
- Show HN asks for something people can try right away with no sign-up. PDkef has no accounts at all.
- Never ask anyone for an upvote, and don't link the post in places where people would come just to vote.
- The story is Shlomi's: a software engineer who thinks that now that code is quick to write, the PDF
  tools the web is full of should be free, light and private for everyone. CLAUDE.md asks that PDkef is
  never framed around how little time it took to build, so tell the "why", not the hours.
- Be around for the first few hours to answer comments.

## Lead with what only PDkef does

A post that says "free PDF tools in your browser" walks into a known reaction. On
[Show HN: Pdfwithlove](https://news.ycombinator.com/item?id=46675231) (2026-01, 177 points, PDF tools that
run locally) the top skepticism was that client-side PDF tools are "the new hello world", with a list of
five similar Show HNs from the two months before. The tool list is the supporting detail, not the hook.
Pick one of these for the title and the first paragraph:

- **Redaction that removes the text, not covers it.** Marked pages become a single image, so nothing
  survives under the box; unmarked pages keep their text; every export drops page thumbnails that can show
  the page before redaction (see Per tool, Redact). The guide explains when blur is not enough:
  https://pdkef.com/blur-vs-blackout-vs-delete-pdf/
- **Signing in 20 languages and scripts, right to left included.** Hebrew and Arabic boxes grow leftward
  from a fixed right edge, shaping is right in the download and not only on screen, and every font is
  embedded (`src/data/tools.js:105-212`; 25 font screening guards in CI, `npm run test:e2e:fonts`).
- **Works on scans, with no OCR and no models.** Scan to PDF finds and straightens the page in the browser
  and lets the person drag any corner; Highlight finds text lines from the page pixels, so a phone photo
  of a book can be marked like a real PDF (`src/lib/pageLayout/rasterInk.ts`).

## What HN will ask, and the true answer

From the same thread. Answer with what PDkef does, never by running another project down.

- **"How does it compare to Stirling PDF / PDF24?"** Say what PDkef is rather than grading them: a web
  page that does the work in the tab, with nothing to install or host, which also works on a phone. If
  someone wants to host it, the site builds to static files (`npm run build`), MIT licensed.
- **"How do I know it runs locally?"** Open the network tab while using a tool, or load a tool, switch
  the connection off and keep working. The production `connect-src` is `'self'` plus the site's own
  usage-count subdomain (see Where your files go). The thread's complaint was that actions hung offline:
  in PDkef, opening a tool caches that page's whole closure, every script, worker and wasm file it
  reaches, including the ones a tool loads lazily (`public/sw.js:6-11`), and
  `e2e/offline/offline-workflows.spec.js` tests working with the connection cut.
- **"Where's the source?"** https://github.com/shlomsh/pdkef, MIT, the whole site, not a shell around a
  closed core.
- **"Can I install it?"** Yes, as a PWA, with a share target (`public/manifest.webmanifest`).
- **"Was this built with an LLM?"** Expect it: GitHub shows Claude as co-author on 4,353 of 4,982
  commits (`git log`, 2026-11-18). The true answer is yes, with a coding agent, and Shlomi decides the
  design, reviews and owns it. What backs the quality is the testing: 967 unit test files, 176 Playwright
  specs, and CI checks for the invariants (CSP, page weight, gesture behaviour, licenses, fonts). Per
  CLAUDE.md, tell the "why" and how it is checked, never how fast it was built.
- **"Why build another one?"** Shlomi's own answer (see The post): with code quick to write, the everyday
  PDF tools should be free, light and private for everyone. Then the one thing above that is new.

## What it is

- 12 tools: Sign, Highlight, Redact, Merge, PDF to Image, Image to PDF, Scan to PDF, Split, Compress,
  Compress Image, Unlock/Protect, Organize (`src/data/tools.js`, the `listedTools` filter on entries
  without `variantOf`). Rotate, Remove pages, Add page numbers and Extract pages are their own pages
  over the Organize and Split tools.
- A static Astro site with Preact islands. Every page is plain HTML built ahead of time.
- 18 runtime dependencies, all on a permissive-license allowlist (MIT, Apache-2.0, ISC, BSD-2/3, Zlib,
  0BSD) that CI enforces (`scripts/runtime-license-inventory.mjs:67`).
- PDF work is done by `@cantoo/pdf-lib` 2.11.1 (MIT, a pdf-lib fork) for building, editing and
  encryption, and `pdfjs-dist` 6.5.438 (Apache-2.0) for rendering and reading text. Everything else
  (Scan's corner finding and perspective fix, Highlight's line finding) is PDkef's own classical image
  code. No OCR, no ML models, no LLM calls anywhere in the product. Pages do list the tools for AI agents
  through WebMCP (`navigator.modelContext` in `BaseLayout.astro`), which is a description, not a call.
- First commit 2026-06-30; 4,970 commits on main; 967 unit test files and 176 Playwright specs
  (`git ls-files`, 2026-11-17). 9 GitHub stars on 2026-11-17.
- Installable as a PWA (`public/manifest.webmanifest`, with a share target).

## Where your files go

- **Nowhere.** No code path sends file content off the device, except `/drive/` (below). Every `fetch`
  in `src` is a same-origin GET (fonts, a sample PDF) or a Drive call; every `sendBeacon` sends a small
  JSON event: to `api/report.ts` (which rejects anything over 2 KB) or to the usage-count endpoint below.
- The CSP backs it up. The live production `connect-src` on pdkef.com is `'self' https://e.pdkef.com`
  (the site and its own usage-count subdomain; read with curl, 2026-11-17; `astro.config.mjs:314` adds
  that host only when the build sets it, and `/drive/` adds Google's hosts). The pdf.js worker is served from the same
  origin, and there are no third-party scripts except Google's sign-in script on `/drive/`.
- Anyone can check it: open the network tab, or load a tool, go offline, and use it.
- **Offline:** a hand-written service worker caches a tool the first time it is opened, then that tool
  works with no connection (`public/sw.js`). It is per tool, not the whole app at once.
- **On the device:** opened PDFs and the work on them are kept in IndexedDB so a closed tab loses
  nothing: at most 6 recent files, each dropped after 28 days unused, and removable by hand
  (`draftRecentIndex.ts:55`, `draftPolicy.js:7`). Saved signatures, small preferences and two visit
  dates for the usage counts (below) live in localStorage. PDkef sets no cookies (no `document.cookie`
  anywhere in `src`); Google's sign-in on `/drive/` and the pressed video frame are Google's own code.
- **Server code** is two pieces and neither sees a PDF: `middleware.ts` (serves Markdown to clients that
  ask for it) and `api/report.ts` (anonymous counts, error reports and star ratings).
- **Google Drive** is opt-in on `/drive/` only: `drive.file` scope, the token stays on the device, and
  files go straight between the browser and `www.googleapis.com`. No other page calls Google.

## Usage counting (expect this question)

- Anonymous, cookie-less, production only. Events carry a tool name and closed-list properties, a random
  id made per page load and kept only in memory, the page URL without query or fragment, and four coarse
  buckets (device, browser, OS, referrer kind). Tool page views also carry how recently this browser last
  visited (new, today, week, month, older), from two dates kept in localStorage
  (`src/lib/telemetry/visitRecency.ts`, `usageEventSchema.ts:115`). No file names or contents; the only
  size-like values are coarse buckets such as a camera photo's long edge (`maintenanceEventSchema.ts:103`).
  The sender is `src/lib/telemetry/analyticsSink.ts`.
- Vercel's page-view analytics also runs, same-origin, with queries and fragments stripped
  (`BaseLayout.astro:108-125`).
- Error reports carry the error name and PDkef's own stack frames, never the message.
- There is no opt-out, and Do Not Track / Global Privacy Control are not read. If someone asks, that is
  the true answer today.
- The home page and `/redact/` have a short video in a `youtube-nocookie.com` frame that loads only when
  pressed.

## Per tool, as the code does it

- **Redact.** Blackout, Whiteout and Blur turn each marked page into a single image, so the covered text
  is gone from the file, not hidden under a box (`src/tools/redact/lib/applyPageEdits.js:11-13`,
  `redact.js:182-194`). Unmarked pages are copied as they are and keep selectable text. Delete removes the
  object itself and keeps the page as vector. Every export drops page thumbnails (`/Thumb`), `/PieceInfo`
  and XMP thumbnails (`documentTraces.js`). Other metadata (Title, Author, XMP) is shown and each item can
  be edited or removed, but it is kept unless the person changes it. Don't say "strips all metadata".
  Whether a weak blur can be read back from its pixels is untested, so don't claim it can't; Blackout is
  the safe answer for anything sensitive.
- **Sign.** Type, draw or upload a signature; typed text in 20 language and script entries, including
  Hebrew and Arabic written right to left, with every font embedded so the export matches the screen
  (`tools.js:105-212`, `src/tools/sign/lib/sign.js:82`). It is a visual signature, not a certificate-based
  digital signature (no PKCS/PAdES code). Say so if asked.
- **Compress.** By default it re-encodes the images inside the PDF and leaves text, fonts and links as
  they are, so text stays selectable (`compressImages.js:1-3`). An optional flatten mode renders pages to
  images for bigger savings and says that text stops being selectable. A target size ("to 100 KB") is
  real and tries to hit it, reporting when it can't (`metTarget`). When nothing can shrink, the file comes
  back unchanged and the tool says so (`messages.ts:196`).
- **Protect / Unlock.** Protect encrypts with AES-256 (the pdf-lib fork's default,
  `node_modules/@cantoo/pdf-lib/cjs/core/security/PDFSecurity.js:42`; PDkef passes no algorithm,
  `src/tools/security/lib/security.js:65`), one password for opening and permissions.
  Unlock needs the password; there is no cracking. Owner-password-only files open without one.
- **Scan to PDF.** Finds the page corners in the browser, straightens the perspective, and the person
  can drag any corner. Document, Original and Grayscale looks.
- **Highlight.** Marker-style highlights and comments saved as standard PDF annotations; it reads line
  positions from the page image, so scanned pages work too.

## Size

- First load is small because the PDF libraries load only when a tool is used. From the 2026-11-09
  build (brotli, document + CSS + eager JS): home about 100 KB, `/compress/` about 112 KB, `/merge/`
  about 137 KB; the heaviest, `/sign/`, ships 170 KB of eager JS. CI caps every page's first load at
  400 KB brotli (`scripts/check-page-weight.js:183`).

## Languages

- Site pages and documentation in 13 locales, including Hebrew and Arabic
  (`src/i18n/documentationLocales.ts`). Not every locale has every tool page, so say "13 languages of
  help pages", not "translated into 13 languages".
