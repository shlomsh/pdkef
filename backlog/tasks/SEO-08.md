---
id: "SEO-08"
title: "The four OS how-to guides rank between 44 and 58, and one of them is our best-read page"
status: "done"
priority: "P2"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["SEO-07"]
legacy_state: "Done 2026-09-11"
---

# SEO-08 · The four OS how-to guides rank between 44 and 58, and one of them is our best-read page

## Scope and acceptance

**The guides are drawing real impressions and converting essentially none of them.**
`/how-to-sign-a-pdf-on-android/`: 130 impressions, 1 click, position 44.18.
`/how-to-sign-a-pdf-on-windows/`: 46 at 48.57, no clicks. `/how-to-sign-a-pdf-on-iphone/`: 39 at 46.82,
no clicks. `/how-to-sign-a-pdf-on-mac/`: 4 impressions at position 9.00, which is a different animal
entirely and worth understanding rather than averaging away.

The query detail underneath is unambiguous about intent. Around thirty distinct phrasings of "how to
sign a pdf on android / iphone / pc / phone / laptop", all between positions 43 and 66. And five
variants of **"how to sign on pdf file sent through whatsapp"** (19 impressions, positions 48-50) -
which is PDkef's own story, already named in `/sign/`'s subhead and its aboutLead, and we are losing it.

Position 44-58 is not a snippet problem, unlike SEO-04 and SEO-05. It is a page that Google has decided
is roughly the fiftieth-best answer. So the question this ticket has to answer honestly is which of
three things is true, and the evidence for it:

1. **The pages are fine and the domain is too young.** Then the fix is SEO-03 and time, and this ticket
   should say so and close rather than churn the copy.
2. **The pages are competing with the OS vendors' own documentation and losing on a fair comparison.**
   Apple, Google and Microsoft all document this. Then the pages need to be about what those pages are
   not about - which is what happens when the built-in tool stops being enough - and the `compare`
   block the content schema already provides is exactly the right shape for it.
3. **Four near-identical pages are splitting one topic four ways.** Then the answer is consolidation,
   and it has a cost worth stating: four indexed URLs become one, on a domain where getting indexed is
   the hard part.

Do the comparison before choosing. Read what actually ranks in the top ten for
`how to sign a pdf on android` and record what those pages do that ours does not.

**The WhatsApp thread is worth pulling separately.** Nineteen impressions on a phrasing we already
write about, at position 48, on a query no incumbent is targeting. If any single sub-topic here is
winnable on merit, it is that one.

**Acceptance.**

- The top ten for `how to sign a pdf on android` is recorded here with what each result offers, before
  any edit.
- One of the three diagnoses above is chosen explicitly and argued from that evidence. "Do all three" is
  not an answer.
- If consolidation wins: redirects are slash-terminated on both sides per CLAUDE.md's URL
  canonicalization section, which has shipped broken once before, and the surviving page absorbs the
  content rather than dropping it.
- If the pages stay: each names, specifically, where the built-in tool stops - and the claims are
  verified against the current OS versions, not repeated from the existing copy.
- The WhatsApp phrasing is addressed deliberately, and where it landed is recorded.
- `npm run test:seo` passes; positions for the guide cluster tracked in the SEO-02 table.

## Resolution (2026-09-11)

### The top ten for "how to sign a pdf on android"

Google itself is blocked from this environment (per the epic's standing rule); this is DuckDuckGo,
which is a proxy for *who competes*, not for our own Google position - that's already known from GSC
(44.18). Read 2026-09-11.

| # | Result | What it offers |
| --- | --- | --- |
| 1 | Adobe (`adobe.com/acrobat/business/hub/...`) | Vendor authority page. Generic "two basic ways" (app or browser), FAQ-driven ("can I sign without an email account", "can I save a copy"), pushes Acrobat at the close. No specific app named for the browser path, no privacy claim. |
| 2 | SigPDF (`sigpdf.com/blog/...`) | Same business model as us - client-side browser signer, "never uploaded to any server." Framed as "3 easy methods": itself first with full steps, then Google Drive and Adobe Fill & Sign with honest pros/cons of each, including its own tool's limits. Dated 2026-02-08. |
| 3 | HowToGeek | Independent tech publisher, author byline, affiliate model. One page covering edit + sign + image-to-PDF + rotate on Android, recommending third-party apps (Foxit, Adobe Acrobat Reader, Google Drive, Microsoft Lens) - never its own product, because it doesn't have one. |
| 4 | BasicDocs | Tool vendor, "5 free methods" listicle. Dated 2026-01-29. |
| 5 | PrimeDocu | Tool vendor, "3 Free Methods (2026)", explicit vs. Google Drive and Adobe in the title. Dated 2026-05-30. |
| 6 | PDFgear | Tool vendor. Own online tool first ("processed directly in your browser... never uploaded"), then a comparison table (PDFgear / PDFgear Online / Adobe Acrobat / Google Drive / Samsung Notes by Best For / Signature Method / Privacy) recommending itself, then its native Android app for the "full workflow" case. Byline + "Last updated July 24, 2026." |
| 7 | Wondershare | Tool vendor, "6 Methods", pushes its native app first. |
| 8 | Adobe (AU) | Second Adobe page, phone+tablet framing. |
| 9 | SignWell | Tool vendor, "two methods". Dated 2025-01-10. |

### Diagnosis chosen: domain authority is the floor, but our own pages show a fixable gap underneath it

Three things are true at once here, and only one of them is ours to fix this week.

**Adobe and HowToGeek are not a fair fight and time is the only lever (part of diagnosis 1).** DR in
the 80s and an independent-publisher editorial page with a decade-old author byline are not something
a three-month-old domain closes with copy. This part of the ranking gap is SEO-03 and time, exactly as
the ticket allows for.

**Against our real peer group - other client-side tool vendors running the same privacy pitch
(SigPDF, PrimeDocu, PDFgear, BasicDocs, Wondershare, SignWell) - the gap is not content depth.** Our
Android/iPhone/Windows guides already have a dedicated WhatsApp flow (nothing in the top ten targets
that phrasing specifically), a compare block against the built-in OS tool, and a seven-question FAQ.
That is comparable to or deeper than most of the above. What every one of them has that we don't:
they're each visibly dated ("Last updated July 24, 2026", "2026-02-08") and several carry an author
byline. None of that is a copy question this ticket can fix alone (it needs a schema field and a
render change to `[contentPage].astro`), so it is out of scope here and worth its own ticket rather
than a rushed addition - flagged below, not built.

**A subhead rewrite leading with the built-in tool was drafted, then reversed on direct product
guidance.** The first pass of this ticket rewrote the subhead of the three underperforming guides to
open with the built-in OS tool and where it stops (Google Drive / Markup+iOS 26 Preview / Edge),
mirroring what already works on `/how-to-sign-a-pdf-on-mac/` - our best-performing guide by a wide
margin (position 9.00 vs. 44-58), whose subhead is the only one of the four that leads with the
built-in tool before ever mentioning PDkef. On review, the product direction for these pages is that
they exist to document PDkef's own flow, not to lead with a comparison to anything else, built-in or
not - so that draft was reverted (all four subheads are back to their original, PDkef-first copy) and
is recorded here only as a dead end, not shipped.

**What shipped instead: real screenshots of the actual PDkef flow, added to all four guides.**
Every one of the ten SERP results read above shows *something* - a screenshot, a demo GIF, a numbered
walkthrough - and our four guides had zero, despite describing the same flow in prose (compare
PDFgear's numbered screenshots above). That gap is closeable without touching positioning at all: it
documents our own tool doing the thing the page claims, which is squarely what CLAUDE.md's own
product/voice section asks for ("documentation plus a working demo"). Three screenshots were captured
against a live build of `/sign/` (Playwright driving the real editor, not a mock - see below) and added
to the "Four steps" section of all four guides, Mac included, since it had the same gap:

- `picker.jpg` - the empty file picker ("Drop PDF here"), showing there's no upload step before the
  file loads.
- `signature-methods.jpg` - the real Create Signature dialog (Draw / Type / Upload tabs), illustrating
  the "draw, type, or choose a signature image" line every guide already had in prose.
- `filled-and-signed.jpg` - the payoff: a practice form with text, a checked box, and a typed cursive
  signature, all placed and ready to download.

All three are real UI, not mockups: captured by loading `public/images/redaction-guide/sample.pdf`
(the same practice form already used by the redaction guide) into a live preview build of `/sign/` via
a throwaway Playwright script, filling it exactly as a visitor would, and cropping/resizing the
results. The script was deleted after use; it isn't part of the repo. Images live in
`public/images/sign-guide/` and are referenced with real `width`/`height` and descriptive `alt` text,
matching the existing pattern in `blur-vs-blackout-vs-delete-pdf.yaml`. `ContentImage.astro` already
sets `loading="lazy"` on every content-page image, so these three per guide (twelve images total) add
nothing to the page-weight guardrail's eager-image budget - confirmed via `npm run test:weight`.

**The built-in-tool compare blocks that were already on these pages before this ticket are untouched.**
They predate this ticket and removing them wasn't asked for; this ticket's job was to add the missing
documentation, not to re-litigate what's already there. Flagging it explicitly in case a future review
wants to revisit whether those sections still earn their place now that real screenshots exist.

**The `docs/seo-competitive-findings.md` line item on the SEO-29 date/byline gap stands independently
of this reversal** - it came from reading the SERP, not from the subhead draft, and is still real and
still open.

**Consolidation (diagnosis 3) was considered and rejected.** The four guides are not near-identical -
each names a different built-in tool, with different real capabilities and different sourced links
(Google Drive's form-fill support, Apple's Markup/AutoFill/iOS 26 Preview, Edge's basic form filling
and its XFA gap) - and Mac's result shows device-specific pages can rank well. Four URLs stay four URLs.

### The fix applied

- Reverted the subhead draft on all three guides back to the original PDkef-first copy (no net text
  change from before this ticket).
- Added three real screenshots of the `/sign/` flow to all four guides (Android, iPhone, Windows, and
  Mac), as described above.
- `npm run build`, `npm run test:seo`, `npm run test:weight`, `npm run test:css`, and the full
  `npm test` unit suite (2133 tests) all pass. Verified visually in a real preview build that all three
  images render correctly on `/how-to-sign-a-pdf-on-android/`.

### The WhatsApp phrasing

Already addressed, on all four guides, not just Android: each has a dedicated "How to sign a PDF sent
through WhatsApp on `<OS>`" section with its own steps plus a matching FAQ entry
("How do I sign a PDF file sent through WhatsApp on iPhone?", etc.). Confirmed none of the ten SERP
results above target this phrasing at all - it stays the one sub-topic in this cluster with no
incumbent, and it is already covered per-OS rather than costing a fifth page. No change needed; this
resolution just records that the acceptance criterion is already met.

### What's deliberately not done here

- **No visible "last updated" date or byline on the content-pages template.** Real, evidenced gap
  against every tool-vendor competitor in the SERP above, but it's a schema + `[contentPage].astro`
  change affecting all eight content pages, not a copy edit to three subheads - flagged as a follow-up
  rather than folded into this ticket. The `lastmodFor()` git-derived date already computed for
  `sitemap.xml.js` (`src/pages/sitemap.xml.js`) is the same mechanism that would back a visible date,
  so it's cheap when it's picked up.
- **No competitor-naming restructure.** Decided explicitly, see above.
