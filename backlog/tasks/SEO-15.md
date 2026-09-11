---
id: "SEO-15"
title: "Positioning review: the three tools Google has never looked at"
status: "done"
priority: "P2"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["SEO-11", "SEO-06"]
legacy_state: "Done 2026-09-11"
---

# SEO-15 · Positioning review: the three tools Google has never looked at

## Scope and acceptance

**Run as a dedicated review, per SEO-11, covering `/image-to-pdf/`, `/pdf-to-image/` and `/edit-pdf/`
together.** All three returned zero impressions in three months. They are reviewed as one because their
shared problem is that a crawler cannot tell them apart quickly, and reviewing them separately is how
that problem survives.

**The method needs an adjustment here, and the reviewer must notice it.** SEO-11 step 1 says start from
our Search Console queries. These pages have none. So the query set has to come from elsewhere - the
research doc's volumes, the phrasings competitors' own pages target, and adjacent queries the site does
receive - and the reviewer should say plainly that this is a weaker basis than the other reviews had.

**What is at stake.** `jpg to pdf` is a query with millions of monthly searches, split between iLovePDF
and Smallpdf, and we have the tool and appear for it nowhere. That is not a copy problem alone (SEO-06
covers indexing), but the copy is what decides whether being indexed is worth anything.

**The specific hazard.** `/image-to-pdf/` and `/pdf-to-image/` are inverse operations with adjacent
names and, currently, a great deal of shared framing. A reader landing on the wrong one should know
within a second. Two different lead sections is the minimum; the review should consider whether the two
should look visibly different rather than merely read differently.

**Per-tool differentiators worth testing** - and if one of them turns out to be weak, the review should
say so rather than manufacture something:

- **Image to PDF** is the app's origin story: a batch of phone photos or scans into one file, on the
  phone that took them, with nothing uploaded. `src/lib/imageToPdf.js` embeds at native size, one page
  per image. Photos of documents are a category people are right to be careful with.
- **PDF to Image** deliberately ships no zip dependency and downloads sequentially instead
  (`PdfToImageTool.tsx:125`). That is a real decision with a reason and it is invisible on the page.
  Worth deciding whether it is a feature to explain or a limitation to state.
- **Edit Pages** covers reorder, remove, rotate and page numbering. Its overlap with `/split/` on
  extract-shaped queries is SEO-09's subject; this review should not settle it independently.

**Acceptance.**

- SEO-11 method followed, with the substituted query basis stated and its weakness acknowledged.
- Each of the three has a named differentiator or an explicit finding that it has only the four general
  claims from SEO-11's table.
- A concrete recommendation for making `/image-to-pdf/` and `/pdf-to-image/` distinguishable within one
  screen, coordinated with SEO-06's distinctiveness measurement rather than duplicating it.
- Concrete copy as a diff for all three; `npm run test:seo` passes; single `<h1>` each.

## Progress (2026-09-11)

**Run end to end, per the SEO-11 method, with the method's adjustment this ticket calls for. Finding:
one real, evidenced elevation shipped for `/image-to-pdf/` and one for `/pdf-to-image/` (same pattern as
SEO-13/14 - a true claim that existed only where nobody would read it, moved to visible copy); `/edit-pdf/`
gets nothing shipped, because its one candidate differentiator did not survive the competitive research.
The distinguishability question resolves to "already passes, no change warranted," verified rather than
assumed.**

**0. The adjusted method, stated plainly, as instructed.** None of the three pages has ever appeared in
a Search Console query (section 1's By page table lists 12 pages with impressions; `/edit-pdf/`,
`/image-to-pdf/` and `/pdf-to-image/` are named in section 1's own "absent from the report entirely"
line). So step 1 of SEO-11's method - "pull the tool's queries out of the latest Search Console export,
rank by impressions" - has nothing to run on for these three. What stands in for it here: section 3's
competitor-research volumes and player list (`jpg to pdf`, 4.8-6.12M combined at iLovePDF/Smallpdf, the
only one of the three with a real published estimate), section 4's standings row for `jpg to pdf`
(not present, 0 impressions, gap = `/image-to-pdf/` is not indexed, tickets SEO-06/SEO-15), and a
WebSearch sweep of the phrasings competitors themselves target for all three tools' core queries. **This
is real evidence of what the field looks like, but it is not evidence of what our own visitors search
for or respond to** - there is no click-through or position data to validate any claim against, unlike
SEO-12/13/14's reviews, all of which could point at a real (if sometimes negative) Search Console number.
Every finding below should be read with that gap in mind: this review can say what the competitive field
does and does not say, and what our own code actually does, but it cannot say what moves our numbers,
because there are no numbers yet to move.

Checked section 1's full query list for anything image/convert/rotate/reorder/page-number-adjacent that
might hint at intent landing near these three pages: nothing. The 207-row export (referenced in SEO-12's
progress note) has no image-conversion or page-editing vocabulary in the clusters or the by-page table;
the closest adjacent signal is the four OS sign guides, unrelated to this ticket's tools. No adjacent-
query evidence exists to substitute either, beyond what's already recorded in section 3/4.

**1. Read the product code before writing anything**, per the task:

- `src/lib/imageToPdf.js`: `imagesToPdf()` embeds each JPG/PNG at its native pixel dimensions (`pdf.addPage([image.width, image.height])`, `drawImage` at `x:0,y:0` full size) - one image per page, no recompression, no resizing, no letterboxing. Confirmed directly in code, not assumed from copy.
- `src/components/PdfToImageTool.tsx` around line 125 (as the ticket cites): a code comment states the reason directly - *"No zip dependency is used (keeps the reviewed-permissive-license + zero-network constraint simple) - multi-page output downloads each image sequentially instead."* `downloadAll()` loops over `images` and fires one `<a download>` click per file, staggered 200ms apart via `setTimeout` - genuinely N separate file downloads, not a zip, confirmed by reading the function body rather than trusting the comment alone. This aligns with CLAUDE.md's runtime-dependency allowlist and lean-bundle principles: a zip library is one more dependency to license-review and ship to every visitor, for a feature (one combined archive) that a handful of separate downloads accomplishes without it.
- `src/lib/editPages.js`: `editPages()` takes `pageOrder`, `removedPageNums`, `rotations` and `addPageNumbers` as one options object and applies all four in a single pass over one output document - reorder, remove, rotate and page-numbering (stamped bottom-centre via `StandardFonts.Helvetica`) are genuinely one operation, not four separate exports chained together. Confirmed in code.

**Decision on the zip question (ticket's own open item): disclosure, not framing as a feature.** Read as
a feature ("look how lean we are") it rings like spin to a visitor who just wanted their files; read as a
plain fact ("here's what happens, so you're not surprised"), it's useful information and matches
CLAUDE.md's "plain facts over intensifiers" rule. Shipped as disclosure - see section 5.

**2. Top-ten-equivalent research.** WebSearch (Bing/DuckDuckGo-style proxy, per SEO-04/05/12/13/14 - direct
Google capture is blocked for scripted fetches in this environment), sampled 2026-09-11.

- `jpg to pdf converter online free`: PDF24, PDFgear, Smallpdf, Drawboard, Wondershare, FreeConvert,
  jpg2pdf.com, freepdfconvert.com. **The privacy/no-upload thesis in the ticket's framing needed
  checking, and it does not fully hold for this specific query.** PDFgear's own snippet states files are
  "processed locally on your device and are not uploaded to PDFgear servers"; Drawboard's states "no
  watermarks, uploading files, or accounts needed... everything is processed locally on your device."
  Two of the eight results already lead with on-device processing. A second, narrower search
  (`"jpg to pdf" "runs in your browser" OR "no upload"`) surfaced a longer tail of small dedicated tools
  making the same claim explicitly - CleanPDF, QuickJPG, PrivacyScanPDF, JPGtoPDF.io - all describing
  themselves as browser-based/no-upload for exactly this conversion. **So "nobody talks about on-device
  processing" is not accurate as a blanket claim for image-to-pdf specifically; it is accurate only for
  the market leaders** (Smallpdf, iLovePDF, Adobe, PDF24, Wondershare - the five actually cited in
  section 3's competitor table - all upload to servers and do not make this claim), while a real tier of
  smaller no-upload competitors already exists below them. This matters for what we can honestly claim:
  privacy-on-device is real and true for us, and worth stating plainly, but it is not the exclusive claim
  the ticket's framing implied - it is a claim shared with a long tail of small tools, made against
  incumbents who do not make it. The differentiator that *is* still exclusive to us at this altitude:
  **verifiability**. None of the eight no-upload-claiming sites sampled offer a way to check the claim
  (no devtools-offline test, no open-source link); `/open-source-pdf-editor/` already documents that test
  for the general product, one hop from every tool page via `ToolCrossLinks`.
- A third search specifically for the origin-story angle (`image to pdf converter photos of documents
  privacy sensitive`) returned only server-side tools describing encryption-in-transit and delete-after-
  N-hours retention (Smallpdf, Nitro, pdfFiller, PDF4me, FreePDFConvert) as their answer to "privacy" -
  confirming the mainstream field's privacy claim is about *server-side handling*, not *not having a
  server at all*. That is the real gap this review can lean on: not "we're private and they're not" (some
  aren't, some smaller ones claim to be) but the specific, checkable fact that there is no upload step to
  secure in the first place, applied to the photographed-document category the origin story names.
- `pdf to jpg converter online free`: PDF24, Smallpdf, Canva, PDFgear, pdf2jpg.net, FreeConvert,
  freepdfconvert.com. **None of the seven results, nor their linked pages, mention a zip-versus-individual-
  downloads decision anywhere** - this is invisible across the whole sampled field, not just on our own
  page, confirming the ticket's premise for this tool specifically.
- `reorder pdf pages online free add page numbers` and a follow-up `pdf page numbering tool free "add
  page numbers" reorder rotate remove pages one tool`: Adobe, Smallpdf, PDFChef, peacefulpdf.com, and -
  more directly relevant - **pdf.net, PDF Toolbox and pdfforge all already bundle page numbering with
  delete/rotate/reorder in one free, browser-based tool.** PDF Toolbox's own snippet: "everything running
  locally in your browser... also allows you to remove unwanted pages, change the order of pages, and
  rotate one or more pages." **This directly contradicts the ticket's suggested hypothesis** ("page
  numbering is arguably the most distinctive feature no competitor bundles for free in the same tool") -
  at least three competitors already bundle exactly this combination for free. See finding 4 below.

**3. Word-by-word comparison.** Read `src/pages/image-to-pdf.astro`, `src/pages/pdf-to-image.astro`,
`src/pages/edit-pdf.astro` (each a two-line `ToolPageLayout` wrapper - all copy lives in `tools.js`, same
shape SEO-13/14 found for `compress.astro`/`redact.astro`) and the full three entries in
`src/data/tools.js` (`seoTitle`, `seoDescription`, `h1`, `subhead`, `gridDescription`, `aboutLead`,
`freeNoteLead`, every step, every FAQ answer for all three). None of the three is a `content-pages` YAML
entry, so the two-tag-dialect rule does not apply here - confirmed by checking `src/content/content-pages/`
does not contain any of the three slugs.

Cross-checked each claim already on the page against the code in step 1: Image to PDF's "no recompression
or downscaling... native dimensions" FAQ answer matches `imagesToPdf()` exactly; PDF to Image's page-range
and three-DPI-preset FAQ answers (added by SEO-06) match `PdfToImageTool.tsx`'s `SCALE_OPTIONS`; Edit
Pages' "all edits in one pass" FAQ answer matches `editPages()`'s single options object. No overclaim
found in any of the three pages' existing copy.

**4. Named differentiator per tool.**

- **Image to PDF: real, but narrower than the ticket's framing suggested.** Native-size, no-recompression
  embedding plus zero upload is true and, per finding 2, checkable - but "nobody talks about privacy
  here" does not hold; a tier of small competitors already claims no-upload. What remains genuinely ours:
  tying the privacy claim to the specific document category (photographed IDs, medical forms, consent
  forms) the way CLAUDE.md's own origin story does, and being verifiable rather than merely asserted. The
  existing copy already states the mechanics (no upload, native size) but never connects them to *why
  that matters for what gets photographed this way* - that connective sentence was the gap, not the
  underlying fact. Shipped, see 5.
- **PDF to Image: the zip decision is a real, invisible fact across the whole competitive field, not just
  our own page.** Disclosing it plainly is a genuine, checkable point of difference in the one narrow
  sense that we are the only sampled result that says anything about it at all - not because withholding
  it is common practice elsewhere, but because it never comes up (nobody ships a comparable client-side,
  no-dependency multi-file download that needs explaining). Shipped, see 5.
- **Edit Pages: no differentiator beyond the four general claims from SEO-11's table, and the ticket's own
  candidate does not survive the research.** The suggested hypothesis - free bundled numbering being
  unmatched - is contradicted directly by finding 2 (pdf.net, PDF Toolbox, pdfforge already bundle it, at
  least one explicitly client-side). What remains true and accurate (one-pass reorder+remove+rotate+
  numbering, per code) is a real feature, correctly described, but not one this research found any
  competitor lacking. Per the ticket's own instruction to say so rather than manufacture a fifth claim:
  **Edit Pages carries the four general claims (free/private/open-source/any-device) and nothing beyond
  them, honestly.** Nothing shipped for this page - see 6.

**5. Shipped.**

`image-to-pdf` `aboutLead` in `src/data/tools.js`, connecting the existing privacy fact to what it
protects (finding 2's origin-story gap):

```diff
- 'Turn a stack of photographed pages, scanned receipts, or screenshots into one PDF you can actually send - reorder them first, then combine, right in your browser.',
+ "Turn a stack of photographed pages, scanned receipts, or screenshots into one PDF you can actually send - reorder them first, then combine, right in your browser. Nothing is uploaded, which matters most for what people actually photograph this way: ID pages, medical forms, signed consent slips.",
```

`pdf-to-image` `aboutLead` and FAQ answer in `src/data/tools.js`, disclosing the zip decision (finding 1's
"decide feature vs limitation" call, resolved as plain disclosure) above the fold and in the FAQ where a
visitor converting a long document would look for it:

```diff
  aboutLead:
-   'Turn a PDF into images for a slideshow, a social post, or a page you need to paste into an email - right in your browser, with a resolution you pick yourself.',
+   'Turn a PDF into images for a slideshow, a social post, or a page you need to paste into an email - right in your browser, with a resolution you pick yourself. A multi-page PDF downloads as separate image files rather than one zip, so each one lands on its own.',

  faq: [
-   { question: 'What happens with a multi-page PDF?', answer: 'By default each page is converted to its own image file, downloadable individually or all at once. You can also choose "Single combined image" to stack every page into one tall image instead.' },
+   { question: 'What happens with a multi-page PDF?', answer: 'By default each page is converted to its own image file. "Download all" saves them one at a time rather than as a single zip file, since this tool has no zip library bundled - your browser may ask to allow multiple downloads the first time. You can also choose "Single combined image" to stack every page into one tall image instead.' },
```

Both changes are copy-only, add no claim beyond what step 1 verified against the actual code, name no
competitor, and use no em dashes. `<SeoSchema>`'s `faq` prop is built straight from `tool.faq`
(`ToolPageLayout.astro:27`, `faq={tool.faq}`), confirmed by reading the component - the FAQ text change
on `/pdf-to-image/` needs no separate mirroring step, and `/image-to-pdf/`'s change touched no FAQ text
at all. Single `<h1>` unchanged on both pages. `npm run build`, `npm run test:seo` (23 pages),
`npm run test:css` and `npm run test:csp` (23 files) all pass against the built output.

**Not shipped for `/edit-pdf/`, and why:** per finding 4, its one candidate differentiator did not
survive the competitive check, and no other evidenced gap turned up in the word-by-word comparison (step
3) - the page's copy already matches what the code does, with no overclaim and no missing disclosure of
the shape found on the other two pages. Inventing a change here to have "shipped something" for all three
would be exactly the manufactured-differentiator failure mode the ticket warns against. Left untouched.

**6. Distinguishability within one screen.** Per the ticket, this is a narrower question than SEO-06
answered (SEO-06 measured body-text overlap and found it near-zero, all chrome; this asks whether a
confused visitor can tell the two pages apart at a glance). Checked directly against the built HTML and
the source, not assumed:

- `/pdf-to-image/`'s `h1` is "Convert PDF to Image Online Free" (direction stated in the first four
  words: PDF -> Image); `/image-to-pdf/`'s is "Image to PDF Online Free: Combine JPG & PNG" (direction
  in the first three words: Image -> PDF). Both lead with the direction, not a shared generic phrase.
- The two tool icons are already inverted: `/pdf-to-image/` uses `ImageUp` (an image icon with an
  upward/outward arrow - pages coming *out* as images), `/image-to-pdf/` uses `ImageDown` (an image icon
  with a downward/inward arrow - images going *into* a PDF). Confirmed by reading the `icon:` field for
  both entries in `tools.js` (lines 402 and 446) - this is a pre-existing, deliberate visual pairing, not
  something this review added.
- Subheads reinforce direction: "Turn each PDF page into a high-quality JPG or PNG..." versus "Combine
  JPG or PNG images into a single PDF in any order...". Both name the input format first.

**Recommendation: no change warranted.** The one-second test the ticket describes is already passed by
the existing H1 wording alone (direction is the first thing read on both pages), reinforced by an
opposite-direction icon pairing that predates this ticket. This mirrors SEO-06's own conclusion in its
"First-screen distinction" section ("both server-rendered, both in the first screen... nothing changed
here"), reached independently by this review via a different question (icon/lead-section read, not body
overlap). Proposing a visual redesign on top of an already-passing check would be exactly the
over-engineering the ticket cautions against for what it calls "primarily a copy ticket."

**7. Folded back into SEO-11 (docs/seo-competitive-findings.md section 6).** This ticket's own text
predicted a real protocol gap - "no query data exists for these three pages" - and it held up in practice
closely enough to be worth codifying, since SEO-16 (or any future review of an unindexed page) will hit
the identical problem. Added a short paragraph to section 6's "per-tool method" introduction, directly
after the numbered steps, naming the substitution used here (competitor volumes/players from section 3,
WebSearch phrasing sampling, an explicit check of the full query export for adjacent intent) and the
caveat that findings from it describe the field, not validated clicks - so a future reviewer does not
have to independently discover and justify the same adjustment SEO-15 had to.

## Verification

`npm run build`, `npm run test:seo` (23 pages), `npm run test:css` and `npm run test:csp` (23 files) all
pass on this branch with the `image-to-pdf` and `pdf-to-image` changes in and `edit-pdf` untouched.
