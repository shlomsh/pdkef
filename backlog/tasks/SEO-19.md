---
id: "SEO-19"
title: "New tool: compress an image to a target size, because people are already asking us to"
status: "done"
priority: "P1"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["SEO-06", "SEO-13"]
legacy_state: "Open"
---

# SEO-19 · New tool: compress an image to a target size, because people are already asking us to

## Scope and acceptance

**Build log.** 2026-09-12: built as `/compress-image/` (`src/lib/compressImage.js` over the shared
`src/lib/targetSizeSearch.js`, which `compressPdfToTarget` now uses too; island
`PdfCompressImageTool.tsx` with 20/50/100/200/500 KB presets; registry, redirect pair, entry sheet,
`llms.txt`, analytics allowlist). All CI checks green on the build. Same day, product decision (Shlomi): **one compress island, not two.**
The user has a file and a limit and should not care about the codec, and the format-agnostic queries
(`file compressor to 100kb`, `100 kb document size`) already land on `/compress/` and bounce on the
PDF-only guard. So `PdfCompressTool` accepts PDF, JPEG and PNG and dispatches by type after the drop;
the level grid stays PDF-only, image presets are 20 to 500 KB, the download is named by the output
blob's type. **`/compress/` keeps its title, H1, description and FAQ exactly**, since "compress PDF" is
the keyword it holds; only the island's own text changes. `/compress-image/` stays as the door for
image-word queries ("compress image to 100kb", "jpg to 50kb"), with its own H1, mounting the same
island opened in target mode. Its URL is an experiment: if after eight weeks its impressions are only
the format-agnostic family `/compress/` also gets, fold it into `/compress/` with a redirect. The
"separate route" recommendation under the product questions below is superseded by this. Left open
until the merge is reviewed, the real-browser pass with a phone JPEG and a transparent PNG is done
and the indexing request is in; ships alone in its week per the acceptance below.

**Guardrail, tracking and the read rule (2026-09-12).** The real-browser proof jsdom cannot give is
`e2e/compress/image-target-size.spec.js`: a canvas-generated JPEG of a few hundred KB (no binary
committed; the test asserts the fixture is 250 to 900 KB so a passthrough can never make it trivial)
goes through `/compress/` at the 50 KB preset and the download is asserted to be `image/jpeg` by MIME
type and magic bytes, at or under 50 KB, named `photo-compressed.jpg`; a transparent PNG goes through
the same flow and the output is asserted JPEG, under target, with the transparent region decoded back
as white, which is the flatten-to-white claim the FAQ makes. `/compress-image/` and
`/pdf-wont-compress-to-100kb/` are now in `docs/seo-last-crawled.json`, so the crawl-staleness report
tracks them and the 2026-10-08 recapture has a row to fill. **Indexing request for `/compress-image/`: made by Shlomi on 2026-09-11 and resubmitted on
2026-09-12 (the resubmission does not move it up the queue; the clock runs from 2026-09-11, so the
eight-week read is due 2026-11-06).** Also in `docs/seo-last-crawled.json` under `indexingRequested`. (`/compress/` was already requested on
2026-09-11 and is not resubmitted; Google's dialog says a resubmission does not move it up the queue.)

**The eight-week read, due 2026-11-06.** Pull GSC queries by page for
`/compress-image/`. If its impressions are only the format-agnostic family `/compress/` also gets
(`file compressor to 100kb`, `reduce file size to 100kb`, `100 kb document size`), the second URL is
splitting one intent across two pages: fold it into `/compress/` with a slash-terminated redirect pair
in `vercel.json`, drop the registry entry, and let `/compress/`'s island (which already takes images)
carry the demand. If image-word queries reach it (`compress image to 100kb`, `jpg to 50kb`, `photo
under 20kb`, `reduce photo size`), it stays and gets its own review in SEO-11's shape. Either way the
verdict is written here with the export date, and the findings doc's status row is replaced, not
appended.

**One artefact to know before the 2026-10-08 crawl read.** `scripts/seo-crawl-staleness.mjs` now
reports `/unlock/` as content-changed on 2026-09-12 by `358ca67`, this ticket's first commit. That
commit only inserted the `compress-image` registry object directly above the `unlock` entry in
`src/data/tools.js`; the range-based `git log -L` attributes the insertion to the neighbour. Nothing
visible on `/unlock/` changed, so its crawl date should still be read as SEO-01's unrequested control
alongside `/merge/`, not as a stale page.

**This is the only new tool in the epic with measured demand behind it rather than an estimate.** In
three months, 128 impressions and 6 clicks came from queries with no "pdf" in them at all:
`file compressor to 100kb` (81 impressions, position 9.60, 3 clicks), `reduce file size to 100kb` (26 at
9.50), `compress file size to 100kb`, `100kb file compressor`, `image size reduce to 100kb`,
`100 kb document size`. They land on `/compress/`, which only accepts PDFs, and bounce.

**Raised to P1 on 2026-09-12: the demand is global and native, not a GSC leak.** [LOC-11](LOC-11.md)'s
autocomplete sweep (five locales, `node scripts/seo-autocomplete.mjs`) seeded the *shrink* task without
the word pdf and every locale completed to photos before PDFs: Vietnamese `nén ảnh dưới 1mb` / `dưới
2mb`, `chụp ảnh dưới 2mb`, `giảm dung lượng ảnh đã chụp trên iphone`; Turkish `1 mb fotoğraf yapma`,
`2 mb fotoğraf boyutu`, `2 mb fotoğraf nasıl olur`; Spanish (Mexico) `bajar el peso de una imagen`,
`reducir peso de imagen jpg`, `reducir tamaño de fotos`; Italian `ridurre peso foto`, `ridurre
dimensioni jpg`; Indonesian `memperkecil ukuran foto jpg`, `mengecilkan ukuran file foto`, `ukuran
file lamaran kerja via email`, `kompres foto 200 kb`. The pattern is one intent, a portal or job
application with a hard KB limit on a photo, and the same limit family (`100 kb`, `200 kb`, `300 kb`,
`1 mb`, `2 mb`) as our English target-size queries. The PDF version of this family is below Trends'
floor in every language we checked (LOC-11, LOC-13); the image version is what people type first. It
is the one product gap the localization research surfaced, and in English that intent already converts
today, on `/compress/` (`file compressor to 100kb`, position 9.4, 4 clicks / 95 impressions in the 28
days to 2026-09-11). `/pdf-wont-compress-to-100kb/` is the page shape built for that intent, honest
target-size, portal limits cited, the miss stated, but its own ability to rank is unmeasured: it has
not been indexed yet, and whether the page shape itself earns position is exactly what SEO-17's
eight-week read decides. Ship it in English first; the localization gate (LOC-11) applies to it
afterwards like any other page, and Indonesian is first in line there ([LOC-14](LOC-14.md)).

The intent behind them is the same one behind the whole 100KB cluster and it is strongest in India:
application portals cap the photo, the signature and the document separately, often at 20-50KB for a
photo and 100-200KB for a document. Somebody with a form open needs all three, and we serve one.

**The implementation is small, and most of it exists.** `compressPdfToTarget()` in `src/lib/compress.js`
already does the hard part: a DPI ladder, a binary search on JPEG quality, a wall-clock budget, an honest
`metTarget: false`. For an image there is no PDF assembly and no page loop - decode to a canvas, search
scale and quality, encode. The search logic should be extracted and shared rather than copied, so the
two tools cannot drift on behaviour the FAQ describes for both.

**Constraints, all of them the usual ones.** No network. Canvas and `toBlob` only, no new dependency; if
one is genuinely needed it must clear the reviewed permissive allowlist, be added to
`optimizeDeps.include` in `astro.config.mjs` (an island-only import is invisible to Vite's startup crawl
and the cascade that follows is nasty and well documented in CLAUDE.md), and pass
`npm run test:licenses`.

**Two product questions to settle, not to assume.** Whether this is a separate route or a mode of
`/compress/` - separate is the recommendation, since the query set is distinct and a PDF tool that also
takes images is confusing, but argue it. And which formats: JPEG and PNG at minimum, with an honest note
about what re-encoding a PNG to JPEG does to transparency and to text screenshots.

**Acceptance.**

- Real `src/lib/` logic with no network calls, sharing the target-size search with `compressPdfToTarget`
  rather than duplicating it, with unit tests covering the already-under-target passthrough, the met
  target, and the honest miss.
- The component mirrors `PdfMergeTool.jsx`: real call, real download, no `setTimeout` mock. The
  live-`FileList` hazard applies - read `input.files` into an array before clearing `input.value`.
- Registered in `src/data/tools.js` so the sitemap picks it up automatically; visible How it works and
  FAQ on the page with a matching `<SeoSchema>` (FAQ schema only, never HowTo); no `noindex`.
- `/compress/` and the new tool link to each other on the PDF-versus-image distinction.
- `npm run build && npm run preview` verified for CSP and hydration before this is called done.
- Ships alone in its week, so its indexing can be attributed.
