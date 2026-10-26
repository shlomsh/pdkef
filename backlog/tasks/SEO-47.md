---
id: "SEO-47"
title: "Page tools get the names people search: Organize, Rotate, Remove pages, Page numbers, Extract pages"
status: "in_progress"
priority: "P1"
epic: "search-and-languages"
horizon: "now"
order: 1
---

# SEO-47 · Name the page tools after the searches, one page per job

Filed 2026-10-26 from Shlomi's question "why does Google refuse to crawl /edit-pdf/?".

## Why

- `/edit-pdf/` is clean to Googlebot (200, self canonical, no `noindex`, in the sitemap, linked from every
  indexed tool page) and has sat in "Discovered - currently not indexed" with every crawl field N/A since
  launch (SEO-06). So have `/pdf-to-image/` and `/image-to-pdf/`.
- **SEO-06 treated this as a patience game. It is not.** `/he/pdf-to-image/` shipped 2026-10-14 and was
  indexed within about 12 days, while English `/pdf-to-image/` (same tool, months older, and now discovered
  through that Hebrew page's `hreflang`) is still never crawled (URL Inspection 2026-10-26). Google crawls
  new URLs on this site quickly when it sees little else answering them; it skips our English pages on
  crowded terms. Shlomi's call: the "no new URLs until one of the 15 is crawled" gate in SEO-06 is lifted
  for this work.
- **"Edit PDF" is the wrong name.** Every competitor surveyed (eight sites, 2026-10-26) uses `edit-pdf` /
  `pdf-editor` for its text editor, and splits page jobs into their own pages: remove/delete, organize,
  rotate, page numbers, extract. Our one page aims four page jobs at the term text editors own.
- Crawl stats export (90 days to 2026-10-21): about 16 requests a day, 96.8% refresh, 3.2% discovery, 73%
  page resources while rendering. Host status "Problems in the past" (robots.txt not available 0.47%).

The evidence (Trends table, competitor naming) is recorded in `docs/seo-competitive-findings.md`.

## Design

One island, several honest landing pages, as every competitor does it:

| Page | URL | Island | Trends (worldwide, 12 months, one scale) |
| --- | --- | --- | --- |
| Organize PDF | `/organize-pdf/` (was `/edit-pdf/`, 308) | `PdfEditPagesTool` | organize pdf ~54 |
| Rotate PDF | `/rotate-pdf/` | `PdfEditPagesTool` | rotate pdf ~58 |
| Remove PDF pages | `/remove-pages/` (was a redirect) | `PdfEditPagesTool` | remove pages ~27, delete pages ~12 |
| Add page numbers | `/add-page-numbers-to-pdf/` | `PdfEditPagesTool` | ~3 |
| Extract PDF pages | `/extract-pdf-pages/` | Split island | ~9, rising |

- Each page has its own title, H1, how-to and FAQ about its one job, verified against the tool's code.
  No template-swapped copy: that is the line between a landing page and a doorway page.
- The home grid keeps one tile for the page tool (Organize PDF). The others are reached from Organize, from
  the tool cross-links and from the sitemap, so the first screen stays one composed unit.
- The tool itself does not change in this ticket.

## Contract (the shape every piece builds against)

The codebase assumes a page's URL is `/<slug>/` (`documentationPath`, sitemap, Markdown twins, cards), so
**every page keeps slug = URL**, and the tool's data identity (drafts, recents, telemetry, ratings,
hand-offs, `from=` strings) stays what the island already writes. Two optional fields in `src/data/tools.js`:

- `toolId`: the island's id when it differs from the slug. `organize-pdf` has `toolId: 'edit-pdf'`. Default
  is the slug. The island keeps writing `'edit-pdf'` everywhere it does today, so `ANALYTICS_TOOLS`,
  `RATING_TOOLS`, recents saved under `'edit-pdf'`, `RETURN_TO` and hand-off keys are untouched.
- `variantOf`: the slug of the listed page this one is a landing page for. `rotate-pdf`, `remove-pages` and
  `add-page-numbers-to-pdf` have `variantOf: 'organize-pdf'`; `extract-pdf-pages` has `variantOf: 'split'`.
  A variant inherits its parent's `toolId`.

Exported helpers next to `tools`: `toolIdOf(entry)`, `listedTools` (entries without `variantOf`),
`pageForToolId(id)` (the listed entry whose `toolIdOf` is `id`), `variantsOf(slug)`.

- **Lists of tools a person picks from use `listedTools`**: home dock, 404 grid, `index.md` tools list,
  ToolCrossLinks cards, WebMCP enum, `CAPABILITIES`, `llms.txt` / `SKILL.md` and their tests, `cardMessages` test.
- **Pages use `tools`** (all entries): sitemap, Markdown twins, `localizedTools`, `ToolPageLayout`.
- **Lookups by stored id use `pageForToolId`**: RecentFiles, FileDropzone, `ratingForPage(toolIdOf(tool))`.
- `handoffKeyFor(slug)` returns `toolIdOf`; `PAGE_SLUGS` in `handoffPending.ts` gains
  `'edit-pdf': [the four pages]` and `split: ['split', 'extract-pdf-pages']`.
- ToolCrossLinks adds one compact text row under its cards linking every variant (crawlable links from
  every indexed tool page, no new cards).
- Redirects: `/edit-pdf/` and `/edit-pdf` 308 to `/organize-pdf/`; the two `/remove-pages` redirects are
  deleted (they would win over the new page); a non-slash pair for each of the five new routes.

## Acceptance

- [ ] Five pages live with distinct copy; `/edit-pdf/` and `/remove-pages` 308 to their new homes in one hop
- [ ] Every internal link points at the new URLs; sitemap carries the five
- [ ] Full CI chain green (`check:push`, then CI)
- [ ] Shlomi requests indexing for the five after deploy
- [ ] 2026-11-23 read: URL Inspection on the five (crawled or not), and Search Console impressions per page
