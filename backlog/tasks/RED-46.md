---
id: "RED-46"
title: "The Redact page speaks the tool's words, without losing what people search for"
status: "in_progress"
priority: "P2"
epic: "redact"
horizon: "now"
depends_on: []
---

# RED-46 · The Redact page speaks the tool's words, without losing what people search for

The /redact/ page still says "flatten" and "text layer", which the tool dropped (RED-37). Some of these may be search terms people actually use, so this starts with the evidence: which terms carry queries (docs/seo-competitive-findings.md, GSC data Shlomi shares), which are only jargon, and where each appears (title, h1, description, how-it-works, FAQ and its JSON-LD).

## Acceptance
- A findings section in this ticket: every term, where it appears, query evidence, and a proposed rewrite.
- Shlomi picks; the copy change follows with test:seo and test:csp green.

## Findings (2026-10-01)

Research only; no copy was changed. Every line number is `src/data/tools.js` at 540af6d4 unless another file is named.

### Where the /redact/ text comes from

One source feeds every surface. `src/pages/redact.astro` renders `toolsBySlug['redact']` (tools.js:314-358) through `ToolPageLayout.astro`, which passes the same object to the hero (`h1`, `subhead`), the how-it-works card (`aboutLead`, `steps`), the FAQ card, the `<title>`/description, and `SeoSchema.astro` (FAQPage JSON-LD is built from `tool.faq`, the `description` from `seoDescription`). The Markdown twin (`src/pages/[slug].md.ts` -> `toolToMarkdown(tool)`, served by `middleware.ts`) reads the same fields. So one edit in tools.js changes page, JSON-LD and Markdown together, and they cannot drift.

Not on the page's own source but shown on it: the "Documentation" cards (`src/data/contentPages.js:90` and `:99`). Elsewhere: `public/llms.txt:17` is clean ("Blacking out, blurring, whiting out, or deleting"). **There is no Hebrew /redact/ page** (`src/content/localized-tools/he/` holds only compress, merge, sign). The only Hebrew Redact text is the card in `src/i18n/cardMessages.ts:28-31`, a translation of tools.js:321 ("אזורים" = areas). Adjacent, separate pages that carry the same words and are out of this ticket: `src/content/content-pages/blur-vs-blackout-vs-delete-pdf.yaml` (21 lines with flatten / text run / text layer) and `permanently-delete-text-from-pdf.yaml` (7).

### What the tool actually does (checked in code, so no rewrite claims more)

- A page with any Blur, Blackout, Whiteout box or brush stroke is rendered at 2.5x, the boxes are painted in, and the page is saved as one JPEG (0.95) with **no text layer at all** (`src/editor/adapters/pdf/redact.js` `flattenPage`, `assemble`; decision 2026-09-28 in `docs/redact-content-removal.md`). Pages with no box are copied untouched. Solid boxes are painted after blurs.
- Delete cuts the drawing operation out of the page and drops a link lying over it (`deleteObjects.js`, `linksOverDeleted.js`); a page with Delete only stays vector and keeps its selectable text. A page with both is Delete first, then picture (`applyPageEdits.js`).
- Every download drops the source's document details: Delete exports clear Title, Author, Subject, Keywords, Creator, Producer, dates and the XMP stream (`clearDocumentDetails`, RED-27); box exports build a new document, so none of it is carried over. The page never says this. The tool's own words for it are "document details" (`check/checkCopy.ts`).
- After each export the tool searches the saved file for what was covered or deleted (text, form fields, comments, bookmarks, document details) and says it cannot search inside pictures (`useSavedFileCheck.ts`, `checkCopy.ts` `CHECK_LEAD`). Also not on the page.
- The tool's own phrase for the picture step is "saved as a picture" (`finishState.ts:41-44`).

### Term evidence

Evidence in the repo is thin for every term. No Search Console export in the repo has a query containing "flatten", "text layer", "area", "element" or "metadata" for `/redact/`; the only per-query list is SEO-04's thirteen zero-click blur queries (2026-09-10), and none contains one of these words (`blur text in pdf` 32 impressions, `blur text in pdf online free` 23, `pdf blur tool` 17, `blur pdf online free` 16, `blur in pdf` 16, `blackout text in pdf free` 13, `blur out pdf` 10, and six smaller). GSC withholds low-volume queries, so "absent from the export" is not "nobody types it".

| Term | Evidence in the repo | Verdict |
| --- | --- | --- |
| flatten / flattened / flattening | `flatten pdf online` is a competitor-research guess of 20k-50k/mo (`docs/seo-competitive-findings.md` section 5, "est. volume ... competitor-tool guesswork"); SEO-21 then checked Google Trends (worldwide, 12 months, 2026-09-12): relative interest 1-2 against `compress pdf` 55-70 and `merge pdf` 90-100, "noise-floor". The intent there is a standalone tool that locks form fields and annotations, not redaction. SEO-04 (`backlog/tasks/SEO-04.md` ~L102-111) already judged "Marked pages flatten on download" meaningless to a searcher and cut it from the meta. The only outside echoes are derived from our own copy: the 2026-09-11 AI Overview ("flatten the file so text cannot be copied") and SEO-14's search summary ("flattened image"). | Jargon, weak demand. Say "saved as a picture". Keep the word once, explained, only in the FAQ question that asks about it (decision below). |
| text layer | No query evidence. It appears in SERP prose, not queries: the 2026-09-17 AI Overview ("leaves the text layer underneath", SEO-04 ~L392) and competitor articles ("the text is still there underneath", saferedact.app, SEO-14 ~L93). | Jargon. Replace with "hidden text under the box". |
| permanently / permanent | `permanently redact pdf` 15k-35k/mo, Adobe and Sejda (competitor-research guess, not Keyword Planner or Trends). SERP sample 2026-09-11 (Bing/DDG proxy, SEO-14): Smallpdf, Xodo, iLovePDF, Adobe, PDFgear, PDF Complete, Gonitro, saferedact.app ("Permanently, Not Just Black Boxes"). Shipped in the meta by SEO-04; no GSC read yet. | Searched. Keep (meta, FAQ 3, aboutLead). |
| redact / redaction | `blur / redact` cluster 22 clicks / 717 impressions at position 13.5 (2026-09-10, regex includes redact); `/redact/` 45 clicks / 1,284 impressions, CTR 3.50% (section 3.2). The URL, title and h1 carry it. Per-query counts for "redact" alone are not in the repo. | Searched. Keep in title, h1, a body mention. |
| area / areas | None. Blur-intent queries say "text", "out", "pdf". A competitor's snippet says "sensitive areas" (BlurPen, SEO-04 ~L101), nothing more. | Retired word. Replace with "box" or name the thing. |
| element / elements / selected element | None. | Retired word. Say "text or an image". |
| selectable / searchable | None as queries. Plain facts about the result. | Fine in "can no longer be selected or searched"; drop the adjective from "delete selectable text" in the hero and card. |
| one image, one-way, marked page, bakes, "no separate box to lift off", "visual mask", "altered pixels" | None. Implementation phrasing. | Replace with "saved as a picture" and "softens". |
| metadata | Not on the page. No evidence in the repo either way. | Do not add the word without a Trends/GSC read. If the fact is wanted, use "document details" (the tool's own words). |
| rasterize / burn / text run | Not on /redact/. "text run" is only on `permanently-delete-text-from-pdf.yaml:73`. | Out of this page; cover in the guides pass. |
| Whiteout / white out | A tool name; no query data in the repo. | Keep as the tool name. |

### Occurrences and proposed rewrites

JSON-LD means the FAQ rows change both the visible answer and the FAQPage entry; keep them the same string (they are, by construction). Strings in tools.js are single-quoted, so an apostrophe needs a double-quoted string or an escape (RED-12 fixed an unescaped one).

| File:line | Surface | Now (term in bold) | Proposed |
| --- | --- | --- | --- |
| 324 `seoTitle` | title | "Blur PDF Online Free - Blackout & **Redact** Text \| PDkef" | No change. Primary keyword and a searched word; shipped and indexed (SEO-04). |
| 326 `seoDescription` | meta description, JSON-LD description | "Blur, black out, or **permanently** delete text in a PDF for free, right in your browser..." | No change, same reason. |
| 329 `h1` | h1 | "Blur PDF Online Free: Blackout & **Redact** Text" | No change. |
| 321 `gridDescription` | tool card on the home page and tool lists | "Blur PDF **areas**, black out private details, or delete **selectable** text and images." | "Blur parts of a PDF, black out private details, or delete text and images. Your file stays on your device." (Hebrew card `cardMessages.ts:30-31` says "אזורים"; change it with this and have Shlomi read it.) |
| 331 `subhead` | hero | "...delete **selectable** text and images. Choose a solid blackout for sensitive information. **Marked pages flatten** automatically when you download." | "...delete text and images. Choose a solid blackout for sensitive information. A page you cover is saved as a picture when you download. Free, open source, and your file stays on your device." Mind the first-screen rule (three plain sentences, shared closer last): the swap is one-for-one. |
| 335 `aboutLead` | how-it-works lead | "Blur softens visual detail, Blackout creates a solid cover, and Whiteout clears an **area** visually. ... because the marked page is **flattened** into **one image** on download, the **redaction** is **permanent**: there's no **text layer** left underneath to recover. Delete removes a selected text or image **element** from the PDF page." | "Choose the result you want. Blur softens what is under a box, Blackout covers it solid, and Whiteout covers it with a clean box. All three work on typed PDFs and scans. A page with one of these boxes is saved as a picture when you download, so the redaction is permanent: there is no hidden text under the box to recover. Delete deletes text or an image and leaves the rest of the page as it was." |
| 344 step 2 | steps | "drag over an **area**. Use Delete to click a highlighted text or image **element**." | "Use Blur, Blackout or Whiteout to drag a box over what you want to cover. Use Delete to click highlighted text or an image and delete it. You can mix the tools in the same PDF." |
| 345 step 3 | steps | "Pages with Blur, Blackout or Whiteout **flatten** automatically into **one image**, making that export a **one-way** change with no selectable or searchable text on the **marked page**. Delete removes the selected **element** from the page." | "A page with a Blur, Blackout or Whiteout box is saved as a picture, so its text can no longer be selected or searched and what was under the box is gone for good. Pages where you only used Delete keep their text. Your original file is not changed." |
| 348 FAQ 1 | FAQ + JSON-LD | "...drag across the **area**. ... The marked page is **flattened** automatically. Blur is a **visual mask**; use Blackout for confidential text." | "Choose your PDF, select Blur, and click and drag to draw a box over the text. Adjust the box, then choose Download. There is no signup, upload, or watermark. A page with a blur box is saved as a picture. Blur only softens, so use Blackout for confidential text." |
| 349 FAQ 2 | FAQ + JSON-LD | "PDkef **bakes** the boxes into images of the marked pages, without copying their original **text layers** underneath." | "Open your PDF, select Blackout, and draw a box over the whole word, line or image. Repeat on every page that needs it, then choose Download. Each page with a box is saved as a picture with the box painted in, and its original text is not kept underneath. It also works on scans." |
| 350 FAQ 3 | FAQ + JSON-LD | "Blackout and Whiteout **permanently redact** the page: PDkef **flattens** it into **one image**, so there is **no separate box to lift off and no text layer** left underneath... **altered pixels**... **hidden information** elsewhere" | Question unchanged (its words are the searcher's). Answer: "No. A Blackout or Whiteout box permanently redacts what it covers. PDkef saves the page as a picture, so the box is part of the picture and there is no hidden text under it to recover. You can check this yourself: open the downloaded PDF and search for the word you covered. It will not be found, because it is no longer there as text. Blur only softens, and softened pixels can still give clues, so use a solid Blackout for anything sensitive. Look for the same detail elsewhere in the PDF too." Optional true sentence: "After you download, PDkef also searches the saved file for what you covered, including form fields and comments." |
| 351 FAQ 4 | FAQ + JSON-LD | "...with that selected **element** removed from the page while the surrounding page content stays in place and remains **selectable**." | "Yes. Choose Delete and click or tap highlighted text or an image. Download creates a new PDF with it deleted, while the rest of the page stays in place and its text stays selectable. This is useful for deleting a prefilled form value before entering replacement text with Sign & Fill PDF." |
| 353 FAQ 6 | FAQ + JSON-LD | Q "Do I need to **flatten** the PDF separately?" A "...automatically **flatten** pages... **page elements**..." | Keep the question as the one explained mention of the word: "Do I need to flatten the PDF myself?" Answer: "No. When you download, or prepare a file with Share, every page with a Blur, Blackout or Whiteout box is saved as a picture. Some tools call this flattening. The page's text can no longer be selected or searched, and the page cannot be changed back into the original. Pages where you only used Delete are not turned into pictures, so their text stays selectable." |
| 352, 354, 355, 356 | FAQ | none of the terms | No change. (356 could gain: "The saved copy leaves out the original's title, author and dates." True for both export paths; add only if wanted.) |
| contentPages.js:90 | doc card on /redact/ | "A visual guide to each option, with automatic **flattening** explained." | "A visual guide to each option, and what saving a page as a picture means." |
| contentPages.js:99 | doc card on /redact/ | "Remove selectable **elements**, keep the remaining text, and know the limits." | "Delete text or an image and keep the rest of the page selectable." |

### Recommendation

1. **Leave title, h1 and meta description alone.** They carry no retired term, they hold the searched words (blur, black out, redact, permanently), and SEO-04's 2026-10-08 read treats the 09-17 copy change as its second variable. A copy ticket also is not done until the page is recrawled (content-and-copy rule).
2. **Retire "area", "element", "text layer", "one image", "one-way", "marked page", "bakes", "visual mask", "altered pixels" everywhere on the page.** None has any query evidence in the repo; the replacements above use the tool's own words (box, cover, picture, "Delete deletes text or an image").
3. **Keep "permanently" and "redact"; they are the only searched words in the set.** Both stay exactly where they are.
4. **Keep "flatten" once, explained in plain words, in FAQ 6 only** (the question, plus "Some tools call this flattening"). The evidence is weak (Trends noise-floor, near-zero), but it is the single place a person who knows the word will land, it costs one clause, and it does not appear in the title, h1, meta or subhead. Shlomi's call: if he would rather have none, drop the clause and rename the question "Do I need to save the PDF as a picture myself?". Do not keep "text layer" as a term; no query evidence at all.
5. **Add nothing about metadata.** No evidence either way. If wanted, use "document details" and the two true sentences above (title, author, dates left out; the saved-file check), not the word.
6. **Ask Shlomi for the 2026-10-08 Search Console export** and filter `/redact/` queries for `flatten`, `text layer`, `permanent`, `white out`, `remove text`, `metadata`, `erase`. If any carries real impressions, put that word back in plainly and explained; this decision should be revisited only on that data.
7. **Order of work after he picks:** edit tools.js and contentPages.js only (page, JSON-LD and Markdown follow); `npm run test:seo` and `test:csp` after `build`; update the Hebrew card in the same change only with his read (LOC gate); ask for an indexing request on `/redact/`. File a follow-up ticket for the two guide pages (28 occurrences of flatten / text run / text layer, plus `flatten.svg` alt text) so this one stays on /redact/.

Blocked 2026-10-01 on Shlomi's picks from the findings above, and the 2026-10-08 GSC export for `/redact/` queries.

## Decisions (Shlomi, 2026-10-01)

- "Flatten" stays once, in FAQ 6, explained ("Do I need to flatten the PDF myself?" ... "Some tools call this flattening").
- The two optional facts (document details left out; the saved-file check) are skipped.
- The Hebrew card's "אזורים" becomes "מה שצריך": "טשטשו מה שצריך ב-PDF, השחירו פרטים פרטיים או מחקו טקסט ותמונות. הקובץ נשאר במכשיר שלכם."
- Ship after the 2026-10-08 Search Console read, so new body copy does not blur its measurement of the 2026-09-17 change. If that export shows a retired term carrying real impressions, put it back plainly and explained before shipping.
