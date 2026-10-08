# Search acquisition: what is true now, and what to do next

**Owner:** the `SEO-*` and `LOC-*` tickets in [backlog/tasks/](../backlog/tasks/). Since the 2026-09-12
re-filing they sit in five epics that answer what can move and what is waiting: `seo-awaiting-read`
(shipped, blocked on a dated Search Console read), `english-base` (authority and on-page work that can
move now), `new-tools-gated` (blocked on SEO-06's crawl read), `hebrew-edition` and
`localization-pilots`. `search-acquisition` and `localized-search` hold only closed history.
**Read this before any SEO work.** It is the epic's one shared memory. Sections 1 to 4 are the part to
read every time; 5 to 7 are reference, there when a ticket needs them.

## 0. What goes here, and what does not

**This file says what is true now. Tickets say how we found out.** A ticket owns its own diagnosis,
SERP captures, before/after tables and dead ends, at whatever length the work needed. This file gets
the result: one status row, and one line in section 2 if the ticket learned something that outlives it,
with a link back. If a section here starts narrating, it is in the wrong file - move the narrative to
the ticket and leave the conclusion.

Three further rules. Every number carries its measurement date. Standings are **replaced** at each
refresh, never appended; git history is the timeline. A stale row stays visible with its old date
rather than being deleted - a term that went to zero is exactly the one worth seeing.

Instruments: `scripts/seo-refresh.mjs` (Search Console export to the section 3 tables),
`scripts/seo-crawl-staleness.mjs` with `docs/seo-last-crawled.json` (crawl date vs content-change date
per URL, `npm run seo:crawl-staleness`). Both are run at the monthly refresh (section 6), not in CI.

---

## 1. Status board

**Last refresh: 2026-10-08 (SEO-39). Next: 2026-11-07, with SEO-40's eight-week reads.** One Search Console pull covers
all of it (section 6). Tickets whose only remaining step is a dated read live in the `seo-awaiting-read` epic as
`blocked`, with the read date at the front of their title, so the Open lane holds only work that can
move today.

| Ticket | State | Date | Result in one line | Next check |
| --- | --- | --- | --- | --- |
| SEO-01 baseline, `lastmod`, indexing requests | done | 2026-09-11 | 27 URLs tracked, 11 indexed, 9 never crawled; `lastmod` shipped; **9 of the 11 indexed pages are stale** (crawled before their last content change); indexing requested for all 9 stale + all 9 never-crawled | **Recaptured 2026-09-17** from the Coverage -> Valid export: all nine requested URLs crawled 09-11 to 09-14; 21 indexed, up from 11; controls split (`/merge/` moved, `/unlock/` did not, SEO-28) | 2026-10-08: three-month export plus the Not-indexed export |
| SEO-02 standings + refresh procedure | done | 2026-09-10 | `seo-refresh.mjs` reproduces section 3 from an export; procedure in section 6 | monthly |
| SEO-03 external signals | open, in progress | 2026-09-11 | repo-side work done (description/homepage/topics fixed, README's language paragraph corrected from 11 to the real 20); referring-domain baseline captured at zero external mentions (proxy method, see caveat); one outreach submitted (pluja/awesome-privacy PR); two venues found ineligible on traction gates (awesome-selfhosted: no tagged release; openalternative.co: under 10 stars, confirmed by its own form); both PDF-specific awesome-lists submitted 2026-09-11 (abhi18av PR #68, OneOffTech issue #81); **first tagged release published**: [v1.0.0](https://github.com/shlomsh/pdkef/releases/tag/v1.0.0) at `038b5d7`, 2026-09-11 19:54 UTC (awesome-selfhosted becomes eligible 2027-01-12); Astro Showcase comment posted; PWA directories and Lissy93/awesome-privacy still queued | [section 8](#8-reference-seo-03-venue-list-and-outreach-log): watch #1103, #68, #81; submit awesome-selfhosted after 2027-01-12; revisit openalternative.co past 10 stars |
| SEO-04 blur zero-click | done | 2026-10-08 | **Read 10-08: the thirteen went from 0 clicks on 190 at 8.67 to 39 on 526 (7.4%) at 5.96; nine of thirteen click.** Credit the 09-11 recrawl (live title indexed, +2.7 positions), not the meta: Google snippets the steps copy. `/redact/` has not been crawled since 09-11, so the 09-17 Blur-first change was never seen and is not judged | |
| SEO-05 compress CTR + honesty | done | 2026-10-08 | **Read 10-08: flat at the page-one boundary.** `/compress/` 2.4% at 9.38 after (was 3.3% at 10.14), the 100KB family four times the impressions at 10.4; position ten cannot test the meta. Lever is authority | SEO-03 |
| SEO-06 never-crawled nine | done | 2026-10-08 | **Week 4 gate failed: all fifteen Discovered URLs still `Last crawled` N/A, the nine among them.** New-URL work stops; effort moves to SEO-03 (horizon now). `/remove-camscanner-watermark-from-pdf/` (09-28) in neither list yet | gate reopens when one of the fifteen is crawled |
| SEO-07 `/sign/` language story | done | 2026-09-11 | language card leads with the claim; comb fields, RTL growth and refuse-while-typing now stated; title changed | 2026-10-08: `/sign/` CTR vs 2.38%, after recrawl |
| SEO-11 review protocol | done | 2026-09-11 | section 7 | |
| SEO-12 Sign review | done, no change | 2026-09-11 | method run end to end; SEO-07 had already shipped everything it would propose; the "no change" verdict is the model for SEO-13 to 16 | |
| SEO-28 Redact/Split recrawl starvation | retired into SEO-39 | 2026-10-08 | **Read 10-08: the 09-11 recrawl was bought by the request**; neither page recrawled since (27 days), while `/unlock/` and five others were recrawled unrequested. No escalation: one request per copy change, plus SEO-03 | `/split/` left unrequested as the organic probe |
| SEO-08 OS how-to guides | done | 2026-09-11 | top-ten read: Adobe/HowToGeek win on authority alone (SEO-03 territory); real peer group (other client-side tool vendors) wins on a visible date/byline (SEO-29) and on showing the tool, not just describing it - a subhead-comparison draft was reversed on product guidance (these pages document PDkef's own flow, not a comparison), so the shipped fix is three real `/sign/` screenshots added to all four guides instead; WhatsApp already covered on all four, no change; consolidation rejected | 2026-10-08 positions |
| SEO-29 visible date on content pages | done | 2026-09-11 | "Last updated <date>" line in the content-page header, on all 11 pages and every localized edition; git-derived through the same `src/site-lib/gitLastModified.js` the sitemap and the Markdown twins now read, so the three cannot disagree; no byline (a real author exists in the schema, rendering it is a positioning call left open) | 2026-10-08: guide-cluster positions, read alongside SEO-08 and not attributed to this alone |
| SEO-13 Compress review | done | 2026-09-11 | ran end to end; passthrough and no-cap were already visible outside the FAQ (SEO-05); shipped one line stating the honest miss in `aboutLead`; non-PDF-keyword traffic recommendation fed into SEO-19, not built now | |
| SEO-14 Blur/Redact review | done | 2026-09-11 | shipped one line making flattening-makes-it-permanent visible in `aboutLead`, same move as SEO-13; blur-vs-removal caveat and the three-page cluster checked, no change needed | |
| SEO-15 Image-to-PDF/PDF-to-Image/Edit-Pages review | done | 2026-09-11 | shipped: image-to-pdf's privacy fact tied to what it protects (ID pages, consent forms); pdf-to-image's no-zip limitation disclosed above the fold and in FAQ; edit-pdf's candidate differentiator didn't survive the competitive check, no change shipped there | |
| SEO-09 Split/extract vocabulary | retired into SEO-39 | 2026-10-08 | **Read 10-08:** extract head rows at 85+ gone, a few long-tail rows at 22 to 28, no clicks; `/split/` 51.9 after. Closed; authority problem | |
| SEO-10 Merge no-limit fact | retired into SEO-39 | 2026-10-08 | **Read 10-08:** no-limit demand is two impressions; nothing to read. `/merge/` itself went from 36.1 to 7.3 on a title from before 09-12 | |
| SEO-17 Portal size-limits page | open, shipped | 2026-09-11 | `/pdf-wont-compress-to-100kb/` live, hub `compress`; every size in the measured table came from running real files (1/5/10-page scans, one typed page) through the actual `compressPdfToTarget` at 100KB in a live browser, not estimated; the ten-page "met the byte target but body text is blurry" finding is stated in the body, not buried in FAQ; portal limits cited to primary sources (IBPS 500KB PDF cap, NTA UGC-NET 10-200KB photo / 4-30KB signature) with links; `test:seo`/`test:csp`/`test:css`/`test:weight`/full unit suite (2137 tests) all green | 2026-09-17: still not indexed, the one requested URL that has not landed; 2026-10-08 recheck, eight-week read 2026-11-06; **2026-10-08: still Discovered, never crawled** |
| SEO-25 compress before/after preview | retired into SEO-39 | 2026-10-08 | **Read 10-08:** five quality impressions in three months; CTR was never this feature's instrument. Stays as built | |
| SEO-19 image to a target size | in progress, shipped ahead of its gate | 2026-09-12 | one compress island accepts PDF, JPEG and PNG and dispatches by type (`src/tools/compress/compressImage.js` over the shared `src/tools/compress/targetSizeSearch.js`); `/compress/` keeps its PDF title and H1, `/compress-image/` is a second URL with an image H1 mounting the same island, kept as an experiment; raised to P1 the same day on LOC-11's autocomplete sweep (photo-to-target-KB is what every locale types first); picked up ahead of the Week 4 gate on Shlomi's call, same as SEO-25; real-browser JPEG/PNG guardrail under `src/tools/compress/e2e/`; manual pass done 2026-09-12 on the dev server; indexed 2026-09-12, 2 impressions at 6.0 by 09-15 | indexing request for `/compress-image/` (date in SEO-19), then the eight-week fold-in read: image-word queries reach it, it stays; only the format-agnostic family `/compress/` also gets, fold it in with a redirect |
| SEO-31 photo and signature size page | open, shipped | 2026-09-12 | `/photo-and-signature-size-for-forms/` live, hub `compress-image`; eight-row table of real phone photos run through the shipped image compressor at IBPS/NTA/UPSC targets (portrait, signature, document), crop-first lesson stated in the body, limits cited to the portals' own PDFs; `/pdf-wont-compress-to-100kb/` gained its photo/signature half the same day; indexed 2026-09-12, 27 impressions / 1 click at 2.96 by 09-15 | 2026-11-07 eight-week read |
| SEO-33 compress vocabulary | retired into SEO-39 | 2026-10-08 | **Read 10-08:** no head-term row for size reducer, shrink or resize; only kb-target variants at 12.6. Words stay, no more vocabulary work | |
| SEO-34 home page targets `pdf tools` | retired into SEO-39 | 2026-10-08 | **Read 10-08:** indexed title is the targeted one; `pdf tools` has no row. `/` gets navigational clicks only. Authority term | |
| SEO-35 merge decision | retired into SEO-39 | 2026-10-08 | **Read 10-08: not "small or none".** `/merge/` reached page one (1,597 merge and 551 combine impressions at 7.2 and 9.2) at 0.5% CTR, on the pre-09-12 title; SEO-35's own title has not been crawled | reindex `/merge/`, read its CTR next refresh |
| SEO-18 sign-in-your-language page | open, shipped | 2026-09-12 | `/sign-pdf-in-your-language/` live, hub `sign`; one page, eight-row table guarded by a test against `LANGUAGE_COVERAGE`; divergences named; indexing requested 2026-09-12 | 2026-10-08 crawl state, then the eight-week read 2026-11-07 |
| SEO-16, 20 to 24, 26, 30 | open | | not started; 20 to 24 wait on the Week 4 gate | per section 4 |
| SEO-27 localization decision | retired | 2026-09-11 | superseded: the Hindi half was settled by LOC-01's measurement, the Hebrew-guides half is LOC-05 | |
| LOC-01 demand measurement | done | 2026-09-11 | Trends + `hl`/`gl` SERPs + GSC-by-country for Hebrew, Indonesian, Malay, Hindi (Shlomi's browser; report in `docs/archive/localized-search-research-brief-report.md`). **Malay and Hindi flat at 0 on every instrument** (16 Hindi probes incl. Hinglish; GSC India all English, zero Hinglish leakage). Hebrew small but real, free to review. Indonesian at parity on compress/sign - and a SERP owned end to end by the majors at 300k-700k reviews; Google already machine-translates our English page there. Criterion 2 of the decision rule does not hold for Indonesian | ROI judgment closed by LOC-07 |
| LOC-02 localized tool-page mechanism | done | 2026-09-11 | route, review gate, localized islands and shell, RTL, switcher, sitemap alternates + reciprocal `hreflang`, five `verify-seo.js` guards, `/he/` out of the precache | |
| LOC-03 Hebrew pilot | open, shipped | 2026-09-11 | `/he/compress/`, `/he/merge/`, `/he/sign/` reviewed by Shlomi and live (indexable, in the sitemap); indexing requested 2026-09-11, so the eight-week read runs to 2026-11-06; **interim 2026-09-17: all three indexed 09-11, four of seven guides 09-13; `/he/merge/` 67 impressions at 27 (more than `/merge/` itself), `/he/sign/` 2 clicks / 49 at 48; 82 Hebrew query impressions, 0 clicks, position 50** | 2026-11-06; 3.7 has the first table; **Hebrew SERPs 2026-09-17: page one for `צירוף קבצים`, absent for `איחוד קבצי pdf`, and the `seoTitle` lacked `איחוד`: added 2026-09-17 on Shlomi's read, nothing else (LOC-03)**; **2026-10-08: `/he/sign/` left the index (22 to 21 on 09-22); `/he/merge/` still under the pre-09-17 title; Hebrew 895 impressions at 28.3 over three months** |
| LOC-04 Indonesian pilot | retired | 2026-09-11 | LOC-01 cleared demand (Trends parity on compress/sign) but LOC-07's ROI judgment found criterion 2 fails on the real SERP (iLovePDF/Smallpdf/Adobe/PDF24/Canva, 300k-700k reviews each, same field `/merge/` loses to in English at position 36.13/0 clicks) and Indonesian is already machine-bridged by Google's translated-results list | reopen only alongside LOC-03 producing impressions, or an English page reaching page one on its own head term |
| LOC-05 Hebrew guides | done | 2026-09-12 | seven of eight published and live for Shlomi's review on the deployed site (`offline-pdf-form-filler` held: its English is a retired redirect); five were stale against SEO-08's screenshots and were updated; links resolve inside `/he/` where an edition exists | indexing requested 2026-09-12 for every published guide; CTA disclosure gap closed; outcome folded into LOC-03's read |
| LOC-06 per-locale refresh table | done | 2026-09-11 | `seo-refresh.mjs` gained section 3.7 (pages grouped by `src/i18n/localePrefixes.js` prefix next to their English sibling, non-Latin queries clustered by detected script, a country breakdown for the locale's pilot country); pure logic in `scripts/seoRefreshLib.mjs`, unit-tested (`scripts/seoRefreshLib.test.mjs`, 27 tests); findings doc section 3.7 added as "not yet run" and section 6 procedure updated - no real numbers yet, that is the 2026-10-08 read | 2026-10-08: first real per-locale table, folded into LOC-03's outcome |
| LOC-07 second-language ROI | done | 2026-09-11 | Verdict: not now. In-language demand is necessary but not sufficient - this domain hasn't beaten Indonesian's competitive field once, in English, at any position better than 36. Retired LOC-04; declined Part 2 (unmeasured languages) since a harder-to-verify language isn't worth measuring when the clearest-demand one already failed the field test | revisit alongside the two signals above |
| LOC-08 Tamil/Telugu demand check | done | 2026-09-12 | Both no. Telugu: Trends flat at 0 on all four anchor tasks (8 native and romanized probes, phrasing from PDF24's real Telugu pages); `hl=te` SERPs are Google's own translations of English pages plus PDF24, related searches all English. Tamil: no native phrasing exists to chart; all 40 `hl=ta` results are Google-translated English pages, the only Tamil content is English-titled YouTube videos. GSC India, last 28 days: all 50 queries English, zero Tamil/Telugu script or transliteration, same 100kb and blur clusters. With Hindi, Telugu and Tamil flat on every instrument, Marathi/Gujarati/Kannada/Malayalam stay unmeasured and the India list stops here | |
| LOC-09 Hebrew home page | open | 2026-09-11 | design in `docs/home-page-localization-plan.md`; `/he/` is the one URL the edition's switcher cannot offer; waits on LOC-03's first read | |
| LOC-10 keep or remove localization | done, keep | 2026-09-12 | Removal case made on cost (freshness gate taxes every English edit on 10 pages, Hebrew strings, the pdf.js RTL bug class, ratchet re-base) and on a demand ceiling generalised from India and Israel. LOC-11 refuted the ceiling the same day; Shlomi: keep. No generic tool page gets localized into a new language; the niche is the entry | LOC-13 pilot, LOC-12 re-check |
| LOC-11 top-languages research | in progress | 2026-09-12 | Vietnam, Turkey, Mexico, Italy search natively at 6x to 20x the English term; India, Israel, Malaysia, UAE are the exceptions. Every native SERP is the majors natively, and a local site already holds the on-device claim in Vietnamese (O.Convertor), Spanish (UnePDF, position 3) and Italian (regispro.it). Opening: target-size compress in every related-searches block, and blur in Vietnamese | Filipino and Bengali Trends, GSC per-country positions |
| LOC-12 two-month re-check | open, due 2026-11-12 | 2026-09-12 | Countries and in-language queries re-checked against the 2026-09-10 baseline; ROI gate in LOC-11 | |
| LOC-13 Spanish target-size pilot | open | 2026-09-12 | One Mexican portal-limits page (SEO-17's model), paid native reviewer, standalone localized page (not an hreflang twin); reads eight weeks after indexing | Reviewer sourcing, portal limits research |
| LOC-14 Indonesian target-size gate | done | 2026-09-12 | Keyword Planner 50,000/month on `kompres pdf 1 mb`, Trends steady at 1 MB, second-tier field, gate passed at 1 MB only | LOC-15 builds |
| LOC-15 Indonesian target-size pilot | done, reviewer deferred | 2026-09-17 | `/id/kompres-pdf-di-bawah-1-mb/` live under AI review, indexing requested 09-13 and 09-17; **field re-read with `hl=id&gl=id`: not thin at 1 MB, and gethonestpdf.com holds the on-device claim natively at position three**; reviewer hire waits for the read; any second page is 100 KB (three of nine results translated) | LOC-17, 2026-11-08 |

---

## 2. What we know

Durable lessons, one line each, newest first. The ticket has the evidence.

- **Search Console Insights shows the title Google holds for each page.** Its "Your content" card is the
  cheapest staleness check there is: on 2026-10-08 it showed `/merge/` and `/he/merge/` under titles from
  before their 09-12 and 09-17 edits, while `/redact/` and `/compress/` matched the live page. Check it
  before reading any CTR. ([SEO-39](../backlog/tasks/SEO-39.md))
- **The domain is being re-weighed without any change of ours.** `/merge/` went from position 36 to 7.3
  on a title Google had held since before 09-12, and the blur thirteen went from zero clicks to 7.4% once
  the 09-11 recrawl put the live title in the index. A page-one, zero-click page is first a crawl
  question, then a snippet question. ([SEO-39](../backlog/tasks/SEO-39.md), [SEO-04](../backlog/tasks/SEO-04.md))
- **Requests buy one crawl; traffic does not buy the next.** `/redact/` (81% of clicks) and `/split/` sat
  27 days on their 09-11 request date while `/unlock/` and five other pages were recrawled unrequested.
  So every copy change ends with its own request. ([SEO-39](../backlog/tasks/SEO-39.md))
- **At this growth rate every percentage-change view in Search Console misleads.** Read 2026-09-22:
  205 of the trailing quarter's 223 clicks and 4.9K of its 5.5K impressions fell in the last 28 days.
  So Insights renders a query that lost one click as "down 100%", Top countries shows every country
  losing share against a denominator that roughly tripled, and the incomplete final day reads as a
  cliff beside record highs. All three were mistaken for a ranking loss on 09-22. Read absolute clicks
  over complete windows until the curve flattens. ([SEO-02](../backlog/tasks/SEO-02.md))
- **An indexing request on a starved URL is acted on the same day, and the ranking re-score comes
  with it.** `/redact/` was crawled on 2026-09-11, the day it was requested after 65 days; site
  clicks stepped from 36 to 86 a week that day and `/redact/` moved from 13 to 7. The unrequested
  control `/unlock/` stayed at 08-21, so the visit was bought, not earned. A dated request is the
  cheapest lever on this domain and it is used once per URL. ([SEO-04](../backlog/tasks/SEO-04.md),
  [SEO-28](../backlog/tasks/SEO-28.md))
- **Competitor titles in a language are not evidence of how natives say it.** LOC-01 read "מיזוג PDF"
  as the Hebrew market term off PDF24, Adobe and Sejda's `/he/` titles; Shlomi's native read is that
  Israelis say איחוד, and Trends (Israel, 12 months) has the two at near parity, 60 to 52. Those
  titles are translations of "merge". Carry both words, lead with the native one, and check a
  synonym on Trends before trusting the incumbents' word choice. Also: צירוף is attach, not merge,
  so `צירוף קבצים` at position 9 with zero clicks was wrong intent, not a snippet problem.
  ([LOC-03](../backlog/tasks/LOC-03.md))
- **The on-device claim is copyable in words, and in Indonesian it has been.** gethonestpdf.com ranks
  third for `kompres pdf 1 mb` saying "langsung di browser" with our target sizes and portal angle,
  the fourth language after Vietnamese, Spanish and Italian where a local site holds the claim. Only
  the demonstrable behaviour (offline in devtools, the installable app) and the open source are not
  copyable in a snippet; positioning reviews (section 7) should lean on those. Reviewer spend on the
  Indonesian page is deferred to its read. ([LOC-15](../backlog/tasks/LOC-15.md))
- **AI-feature impressions concentrate on Redact, and the one-in-five share is now stale.** The
  Generative AI features report (first pulled 2026-09-17, 28 days) showed 407 impressions site-wide,
  `/redact/` 363 of them (89%), single digits in August to 58 a day, tracking the recrawl: about one in
  five of our impressions, and growing faster than web impressions at that point. Re-read 2026-09-22
  (28 days, UI not export): `/redact/` 536, up 48% in five days, next page 34. Site impressions grew
  faster over the same days, so the count rose while the share fell; the 10-08 export settles it.
  Impressions only. Pull it with every refresh; it is the instrument for "cited but not clicked".
  ([SEO-04](../backlog/tasks/SEO-04.md))
- **At the page-one boundary a snippet cannot be tested.** `compress pdf to 100kb` is nine exact-match
  titles with Adobe and PDF24 stars, and we sit at ten. SEO-05's meta hypothesis is untestable from
  there; the gap is rank, and rank in that field is authority. ([SEO-05](../backlog/tasks/SEO-05.md))
- **An AI Overview citation is not an asset you hold.** On 2026-09-11 the overview for `blur text in
  pdf` named PDkef first; on 2026-09-17 it cites Smallpdf and argues against blurring at all. Do not
  plan around being cited, and expect an overview that steers away from the query's verb to sit under
  any page titled with it. ([SEO-04](../backlog/tasks/SEO-04.md))
- **The Coverage -> Valid export carries `Last crawled` for every indexed URL in one file**, so the
  crawl-date capture no longer needs URL Inspection one URL at a time; only the Not-indexed export
  says whether an absent URL was ever fetched. ([SEO-01](../backlog/tasks/SEO-01.md))
- **We win where Trends is flat and lose where it is tall; do not chase the tallest line.** A
  three-instrument read on 2026-09-12 (Google Trends past 12 months worldwide; iLovePDF's Keyword
  Planner export; Keyword Planner's ideas list for pdkef.com) said three things at once. `blur pdf`
  sits at zero on Trends and is 22 of our 71 clicks; `merge pdf` is the tallest line and we hold 6
  impressions at position 90. iLovePDF's merge page is thin and ranks first on DR 83 plus brand demand
  (half its Keyword Planner rows are `ilovepdf edit`, `ilovepdf signature`: traffic nobody else can
  take), so content depth is not what that SERP rewards. The one new signal was the ideas list: `pdf
  size reducer`, `shrink pdf size`, `resize pdf`, `combine pdf` at 1M-10M and `pdf tools` at 100K-1M
  (+900% YoY) all describe pages we already have and words we do not use; its "Low competition"
  column is ad competition, not organic difficulty, so read the volumes and ignore it. Decisions:
  extend the proven `/compress/` position into the reduce/shrink/resize vocabulary (SEO-33), give `/`
  a query (SEO-34), add "combine" to merge and otherwise redirect merge effort to SEO-03 (SEO-35);
  localization stays on hold exactly as LOC-07/LOC-10 concluded, since localizing a head term is
  fighting the tallest line in a second language with the same authority. ([SEO-33](../backlog/tasks/SEO-33.md),
  [SEO-34](../backlog/tasks/SEO-34.md), [SEO-35](../backlog/tasks/SEO-35.md))
- **In-language search volume is necessary and not sufficient; the field and the domain's authority
  decide.** Indonesian cleared the demand gate cleanly (Trends parity with English on 2 of 4 anchor
  tasks, the strongest result any language in this epic produced) and still wasn't worth building: the
  real `hl=id&gl=ID` SERP is owned end to end by iLovePDF, Smallpdf, Adobe, PDF24 and Canva at
  300k-700k reviews each - the same field this domain already loses to in English (`/merge/`, position
  36.13, 0 clicks) - and Indonesian is on Google's translated-results list, so the marginal gain over
  an auto-translated English page is unmeasured. A translated page inherits the domain's authority, not
  the competitors'; check whether the domain can already compete in that field in English before
  spending a paid reviewer's budget on a native edition of the same fight. ([LOC-07](../backlog/tasks/LOC-07.md), retiring [LOC-04](../backlog/tasks/LOC-04.md))
- **Absence of a localized competitor page is itself a data point, and it can mean either "no demand"
  or "no one has bothered yet" - only Trends tells the two apart.** Checking Tamil and Telugu directly
  (fetching each major's own `/ta/`/`/te/` URLs rather than guessing from a screenshot) found PDF24 has
  a real, native Telugu page for every anchor tool but serves plain English at the identical Tamil URL
  despite it resolving with a `200`; Sejda's `/ta/` route carries a `lang="ta"` tag on an entirely
  English page. Direct URL fetches like this are a cheap first pass before spending Shlomi's Trends
  screenshot budget on a language - they can rule a phrasing in or out, but never substitute for the
  real `hl`/`gl` SERP. ([LOC-08](../backlog/tasks/LOC-08.md))
- **Page localization, measured across twelve languages (2026-09-11/12): keep the mechanism, build
  nothing generic, and grow the English base before localizing anything.** Three findings, each
  the opposite of what the previous one suggested, so read all three. (1) In-language search is the
  norm, not the exception: Vietnam, Turkey, Mexico and Italy search the native term at 6x to 20x the
  English one, and Indonesia at parity; India, Israel, Malaysia, the UAE and the Philippines search
  in English. The "tens of impressions" ceiling that argued for removal was generalised from India
  and Israel, the two exceptions. (2) Demand was never the blocker. Every native SERP is iLovePDF,
  Smallpdf, PDF24, Adobe and Canva with native pages and six-figure review counts, a local site
  already holds the on-device claim in Vietnamese, Spanish and Italian, and GSC by country shows the
  domain's own foothold is seven clicks across seven countries in a quarter, all English blur queries
  at positions 30 to 50. (3) The niche we win in English (target-size compress) is below Trends'
  floor in Spanish and already has dedicated native pages from Pi7, 11zon, Smallpdf and Adobe. So:
  localize only a query family this domain already ranks for, only where the native SERP for that
  family is thin, and only once the English number is big enough that a fraction of it is readable.
  Today that number is about 70 clicks a quarter, which is why LOC-13 is held. Hebrew stays as the
  one live experiment and reads 2026-11-06. ([LOC-10](../backlog/tasks/LOC-10.md) decision,
  [LOC-11](../backlog/tasks/LOC-11.md) evidence, [LOC-12](../backlog/tasks/LOC-12.md) re-check,
  [LOC-13](../backlog/tasks/LOC-13.md) pilot on hold)
- **On a language Google machine-translates results into, a SERP full of "translated incumbents" is a
  sign of thin native demand, not an opening.** Telugu and Tamil (`hl=te`/`hl=ta`, `gl=IN`) returned
  top tens where nearly every result carried Google's "translated, see original (English)" badge -
  Google backfilling the SERP with its own translations of iLovePDF, Smallpdf, Adobe and the rest,
  applied to every English page equally, ours included. The decision rule's criterion 2 ("an incumbent
  is machine-translated") was written for a competitor's sloppy localization; when the translator is
  Google, a native edition competes with Google's translation of the whole English field, and the
  badge count says there was no native field for anyone to build. Read it as a "no" signal, alongside a
  flat Trends line. ([LOC-08](../backlog/tasks/LOC-08.md))
- **"Free, open submission" directories commonly gate on traction anyway, and it is rarely visible until
  you try.** openalternative.co hard-blocks under 10 GitHub stars (confirmed by the form itself, not
  documentation); awesome-selfhosted gates on a tagged release 4+ months old, found only by reading its
  real `CONTRIBUTING.md`, not its README. Check each venue's actual submission path (form validation,
  contributing doc, issue template) before drafting anything for it - a directory with no stated barrier
  on its landing page can still have one. ([SEO-03](../backlog/tasks/SEO-03.md))
- **Search Console cannot see non-English demand on an English-only site.** It lists only queries we
  got impressions for, and an English page gets none on `כיווץ קובץ pdf`; so "every India query is in
  English" describes what we rank for, not what people type. The blind spot is measured from outside
  GSC (Trends by country, autocomplete, incumbents' localized pages) in the `localized-search` epic,
  [LOC-01](../backlog/tasks/LOC-01.md) first; localized *tool* pages, not guides, are what compete for
  those queries. ([SEO-27](../backlog/tasks/SEO-27.md) addendum)
- **The non-PDF `file compressor to 100kb` query started converting**, ahead of the scheduled refresh:
  Shlomi's Search Console screenshot (28-day view, captured 2026-09-11) shows 4 clicks / 95 impressions,
  4.2% CTR, avg. position 9.4, with clicks first appearing around 2026-09-02 and climbing through
  2026-09-07/08 - up from the zero-click state SEO-13 recorded for this exact query (81 impressions,
  position 9.60, 0 clicks, as of the 2026-09-10 export). **Do not credit this to the SEO-05/SEO-13 copy
  changes** - both shipped 2026-09-10/11 and, per SEO-05's own indexing check, were still unindexed as of
  2026-09-11, so the uptick predates them being visible in the SERP at all. Logged as a pre-fix baseline
  ahead of the 2026-10-08 refresh, not a verdict. ([SEO-05](../backlog/tasks/SEO-05.md))
- **These guides document PDkef's own flow; they are not a place to lead with a comparison, even to a
  built-in OS tool.** A subhead draft that opened by naming the built-in tool's limits (matching what
  `/how-to-sign-a-pdf-on-mac/` already does) was reversed on direct product guidance mid-ticket: the
  page's job is to show the tool working, not to frame it against alternatives. The shipped fix was
  three real screenshots of `/sign/` instead. Read this before drafting comparison-led copy for any
  future how-to guide. ([SEO-08](../backlog/tasks/SEO-08.md))
- **Against a peer group of similarly-resourced competitors (not the Adobe/HowToGeek authority tier),
  the ranking gap is a visible date or byline, not content depth.** Every one of ten SERP results for
  "how to sign a pdf on android" carries a publish date, an "updated" stamp, or an author byline; none
  of our content pages did. **Closed by [SEO-29](../backlog/tasks/SEO-29.md) on 2026-09-11**: the
  date the sitemap already derived from git now renders in every content page's header, and in its
  Markdown twin, from one shared module. Note that shipping it re-dated all eleven pages to the same day
  (the template changed), so the 2026-10-08 refresh should not read that as per-page freshness.
  ([SEO-08](../backlog/tasks/SEO-08.md), [SEO-29](../backlog/tasks/SEO-29.md))
- **"Indexed" is not "current".** Google held `/redact/`'s title from before 2026-08-29 while the live
  page served the new one; a copy change is not measurable until the *indexed snippet* changes. Check
  the SERP title before reading any CTR as a verdict. ([SEO-01](../backlog/tasks/SEO-01.md#addendum-2026-09-11-an-indexed-page-can-be-stale-enough-to-hide-shipped-work), [SEO-04](../backlog/tasks/SEO-04.md))
- **A copy ticket's definition of done includes an indexing request**, or the work is merged and
  invisible. `/redact/` was 65 days stale, `/split/` 35. ([SEO-01](../backlog/tasks/SEO-01.md))
- **The pages that earn the most are recrawled the least**, and it is not internal links, headers or
  `lastmod` - all checked, all equal or better. Read 2026-10-08: still true, and requests are the answer (see above). ([SEO-28](../backlog/tasks/SEO-28.md))
- **Resubmitting a URL does not move it up the crawl queue** (Google's own dialog). Submit once, leave it.
- **AI Overviews cite us and cost us the click.** On `blur text in pdf online free` PDkef is the first
  tool named, accurately, and gets 0% CTR at position 6.65. Being cited is a GEO asset, not a click; no
  snippet rewrite reaches it. ([SEO-04](../backlog/tasks/SEO-04.md#the-real-serp-captured-at-last-2026-09-11))
- **Judge a phrasing by the impressions it loses, not the clicks it wins.** The "Top queries" view
  flatters whatever the title already says. Summing zero-click rows: generic `blur pdf` loses ~26% of
  its demand, `blur text in pdf` loses ~72%, but generic is four times the size, so it stays primary.
  `blur text in pdf` alone is a page-two rank gap on a how-to SERP, not a snippet problem.
  ([SEO-04](../backlog/tasks/SEO-04.md#which-blur-phrasing-to-optimise-for-decided-from-the-2026-09-11-export))
- **Google discards our meta description on some queries** and snippets from body copy, so the intro
  paragraph in `src/data/tools.js` is doing snippet work whether we meant it to or not. ([SEO-04](../backlog/tasks/SEO-04.md))
- **Do not emit `AggregateRating`.** PDF24 carries review stars on every blur SERP; we have no reviews,
  and fabricated structured data is worse than none. Declined deliberately. ([SEO-04](../backlog/tasks/SEO-04.md))
- **The Sign query cluster is device intent, not language intent, and it ranks on the OS guides, not
  `/sign/`.** All 58 queries are iphone/android/computer/whatsapp phrasings at positions 43-66;
  `/sign/` itself ranks on queries GSC withholds, so we do not know what it ranks for. The language
  advantage's search demand is **unmeasured**. ([SEO-07](../backlog/tasks/SEO-07.md), [SEO-12](../backlog/tasks/SEO-12.md))
- **Check which page a query cluster actually lands on before analysing its SERP.** Cross-reference
  the cluster against the By-page table; SEO-12 nearly analysed the wrong page's competitors.
- **Unique-text share does not discriminate winners from losers** (`/redact/` 52.9%, `/merge/` 28.8%),
  inflates when any text is added, and penalises cross-link cards. Do not use it as a diagnosis.
  ([SEO-06](../backlog/tasks/SEO-06.md))
- **Google blocks scripted SERP fetches from this environment.** Real Google SERPs come from Shlomi's
  screenshots; Bing/DuckDuckGo are a proxy for *who competes*, never for *our* Google position.
- **Search Console's `Queries.csv` drops low-volume queries** (privacy filter); cluster totals are a
  lower bound, `Pages.csv` is exact. ([SEO-02](../backlog/tasks/SEO-02.md))
- **External audits guess at what we already have.** The report that started this epic proposed
  building target-size compression that had shipped before it was written. Verify any gap list against
  `src/data/tools.js` and `src/lib/` first.
- **The favicon Google shows is a separate crawler with its own cache**; do not rename the icon to
  bust it. Re-check after `/` is recrawled. ([SEO-04](../backlog/tasks/SEO-04.md))

---

## 3. Standings

Source: Search Console, Web, last 3 months, **exported 2026-10-08** (data 2026-07-06 to 2026-10-05).
562 clicks, ~15,388 impressions site-wide (`Pages.csv`). Daily impressions went from 100-250 in early
September to 550-950 by early October, at positions 8 to 11. Where a ticket says "before" and "after",
before is the 2026-09-11 export (three months to 09-08) and after is 09-09 to 10-05, derived by
subtracting that export from this one (positions impression-weighted); the 09-11 recrawl of `/redact/`
falls two days into the after window. `Queries.csv` stops at 1,000 rows and its tail is one-impression
rows, so every query with two or more impressions is in it.

**Generative AI features** (same three months, impressions only): 2,188 site-wide, 14.5% of web
impressions; 15.9% over the last 28 days and 13% to 19% in every week since 09-07, so the share has
held level rather than grown. `/redact/` carries 1,851 (85%), 23.5% of its own impressions, and its CTR
rose from 3.5% to 6.3% over the same weeks. `/compress/` 123, the photo-size page 67, `/he/merge/` 42.

### 3.1 By intent cluster (lower bound - see section 6)

| Cluster | Clicks | Impressions | Weighted position | Measured | Read |
| --- | ---: | ---: | ---: | --- | --- |
| blur / redact | 211 | 4,392 | 7.5 | 2026-10-08 | The franchise; was 22 / 717 at 13.5. The thirteen zero-click queries now take 39 clicks at 7.4% (SEO-04). |
| compress to a size | 26 | 1,201 | 10.2 | 2026-10-08 | Still the page-one boundary at 2% to 3% CTR (SEO-05). |
| sign | 0 | 248 | 37.0 | 2026-10-08 | The device-intent rows at 44 to 59 dropped out after 09-08; `fill and sign pdf online` (50 at 13.6) leads now. |
| split / extract | 0 | 130 | 70.1 | 2026-10-08 | The extract rows at 85+ are gone; a few long-tail extract rows sit at 22 to 28 (SEO-39). |
| unlock | 0 | 158 | 13.4 | 2026-10-08 | New: `password protect pdf free`, 81 at 4.1 with no clicks. |
| merge | 11 | 2,097 | 7.8 | 2026-10-08 | Was 6 at 90. Page one on merge and combine phrasings, 0.5% CTR (SEO-39). |

### 3.2 By page (exact)

| Page | Clicks | Impressions | CTR | Position |
| --- | ---: | ---: | ---: | ---: |
| `/redact/` | 457 | 7,892 | 5.79% | 7.35 |
| `/compress/` | 54 | 2,138 | 2.53% | 9.52 |
| `/` | 17 | 147 | 11.56% | 15.90 |
| `/merge/` | 11 | 2,263 | 0.49% | 7.87 |
| `/he/merge/` | 7 | 849 | 0.82% | 14.33 |
| `/he/sign/` | 7 | 329 | 2.13% | 36.47 |
| `/sign/` | 2 | 268 | 0.75% | 9.56 |
| `/how-to-sign-a-pdf-on-iphone/` | 2 | 58 | 3.45% | 34.03 |
| `/unlock/` | 1 | 290 | 0.34% | 21.37 |
| `/photo-and-signature-size-for-forms/` | 1 | 187 | 0.53% | 5.33 |
| `/how-to-sign-a-pdf-on-android/` | 1 | 142 | 0.70% | 41.15 |
| `/compress-image/` | 1 | 52 | 1.92% | 8.94 |
| `/he/how-to-sign-a-pdf-on-iphone/` | 1 | 34 | 2.94% | 14.94 |
| `/split/` | 0 | 360 | 0% | 59.47 |
| `/he/compress/` | 0 | 110 | 0% | 34.46 |
| `/how-to-sign-a-pdf-on-windows/` | 0 | 61 | 0% | 39.33 |
| `/he/how-to-sign-a-pdf-on-android/` | 0 | 57 | 0% | 10.96 |
| `/he/how-to-sign-a-pdf-on-mac/` | 0 | 53 | 0% | 15.25 |
| `/he/how-to-sign-a-pdf-on-windows/` | 0 | 35 | 0% | 17.69 |
| `/he/` | 0 | 22 | 0% | 5.14 |
| `/about/` | 0 | 19 | 0% | 3.42 |
| `/licenses` (no trailing slash) | 0 | 16 | 0% | 12.88 |
| `/how-to-sign-a-pdf-on-mac/` | 0 | 6 | 0% | 8.67 |

Absent entirely: the fifteen never-crawled URLs in 3.4 (`/edit-pdf/`, `/image-to-pdf/`,
`/pdf-to-image/` among them) and `/remove-camscanner-watermark-from-pdf/`.

### 3.3 Country and device (2026-10-08)

India 246 clicks / 4,413 impressions at 7.90 (5.6%), by a distance. Indonesia 35 / 1,241 at 9.14.
United States 34 / 2,157 at 12.55 (1.6%). Israel 33 / 1,476 at 20.88. Pakistan 19 / 251 at 6.58
(7.6%), then the Philippines. Desktop 430 / 11,251 at 11.32 (3.8%); mobile 129 / 3,827 at 10.85
(3.4%). Search appearance "Translated results": 8 clicks / 322 impressions at 10.52.

### 3.4 Indexing and crawl state (captured 2026-10-08)

Coverage export (data to 10-04): 21 indexed, 23 not indexed (Discovered - currently not indexed 15,
Crawled - currently not indexed 2, Page with redirect 4, noindex 2). The Discovered drilldown
(Shlomi's screenshot, 2026-10-08) is the same fifteen as on 10-02, every one with `Last crawled` N/A:
`/blur-vs-blackout-vs-delete-pdf/`, `/edit-pdf/`, `/image-to-pdf/`, `/install-pdf-app/`,
`/offline-pdf-form-filler/`, `/open-source-pdf-editor/`, `/pdf-to-image/`,
`/permanently-delete-text-from-pdf/`, `/sign-pdf-no-signup/`, `/pdf-wont-compress-to-100kb/`,
`/sign-pdf-in-your-language/`, `/id/kompres-pdf-di-bawah-1-mb/`, and the `/he/` editions of
`install-pdf-app`, `open-source-pdf-editor` and `sign-pdf-no-signup`. **The Week 4 gate failed: none of
the nine has been crawled** (SEO-06). `/remove-camscanner-watermark-from-pdf/` (live 09-28) is in
neither list yet.

**`/he/sign/` left the index.** It was indexed on 09-11, it is absent from the Valid export, and the
chart's indexed count stepped from 22 to 21 on 09-22. It is probably one of the two "Crawled - currently
not indexed" URLs; that drilldown has not been pulled.

Recrawled since 09-17 without a request: `/unlock/` 09-16 (from 08-21), `/sign/` 09-19,
`/how-to-sign-a-pdf-on-iphone/` 09-20, `/compress/` 09-23, `/` 09-28, `/how-to-sign-a-pdf-on-android/`
09-29; `/he/` first crawled 09-17. Not since their 09-11 request: `/redact/`, `/split/`, `/he/merge/`,
`/he/compress/`; `/merge/` not since 09-12. `npm run seo:crawl-staleness`: 11 of the 13 crawled English
URLs are stale (content changed after the last crawl); only the photo-size page and the Android guide
are current. Search Console Insights shows the titles Google holds for `/merge/` and `/he/merge/` are
the ones from before their 09-12 and 09-17 edits. The 2026-09-11 baseline is in
[SEO-01](../backlog/tasks/SEO-01.md); dates in `docs/seo-last-crawled.json`.

### 3.5 Against the competition (refreshed 2026-10-08)

"Who is above us" is manual sampling from the 2026-09 research unless dated otherwise. The softest
column here. Positions marked "after" are the 09-09 to 10-05 window (see the top of section 3).

| Winning term | Our position | Our impressions | Measured | Who is above us | Gap to close | Ticket |
| --- | ---: | ---: | --- | --- | --- | --- |
| SEO-04's thirteen blur queries | 5.96 (after) | 526 (after) | 2026-10-08 | as the two rows below | Before: 0 clicks on 190 at 8.67 (three months to 09-08). After: 39 clicks, 7.4%; nine of the thirteen click | SEO-04 |
| blur pdf online | 5.51 | 560 | 2026-10-08 | supertool, small utility sites | Converting: 29 clicks, 5.2% | SEO-04 |
| blur text in pdf | 6.46 (after) | 113 (after) | 2026-10-08 | AI Overview (cites Smallpdf, argues against blur), Videos carousel; then iLovePDF, Adobe, Quora, Smallpdf, Tungsten, PDF24 (Google SERP 2026-09-17) | 3 clicks, 2.7%: how-to intent, the weakest of the family | SEO-04 |
| compress pdf to 100kb (cluster) | 10.38 (after) | 959 (after) | 2026-10-08 | Adobe (4.6, 281,831), bigpdf/11zon, Duplichecker, iLovePDF, Aback Tools, SmallSEOTools, Zamzar, PDF24 (4.9, 14,972), AI Overview citing Adobe and PDFgear (Google SERP 2026-09-17, we are page two) | Rank at the page-one boundary; 18 clicks, 1.9% | SEO-05, SEO-17, SEO-03 |
| file compressor to 100kb | 9.69 | 121 | 2026-10-08 | generic file compressors | 7 clicks, 5.8%: the cluster's best converter | SEO-19 |
| sign pdf on android / iphone (cluster) | absent (after) | 0 (after) | 2026-10-08 | DocHub, Smallpdf, OS vendor docs | The rows at 44 to 59 dropped out; the guides now show at 8 to 11 on a few rows | SEO-08 |
| איחוד קבצי pdf / איחוד pdf / מיזוג קבצי pdf (Hebrew merge) | 11.34 / 14.59 / 34.0 | 119 / 41 / 11 | 2026-10-08 | PDF24 (5.0, 24,060), FreePDFConvert, AvePDF, Adobe, Sejda, plus local lexa.co.il, mypdf.co.il, itspdf (Google SERP 2026-09-17) | The איחוד family outranks and outdraws מיזוג; the indexed title is still the pre-09-17 מיזוג one | LOC-03 |
| `/sign/` itself (queries withheld) | 9.56 | 268 | 2026-10-08 | unknown | 2 clicks, 0.75% (was 2.38% on 42); stale since 09-28 | SEO-07 |
| extract pdf / pdf extractor | 28.2 (after, long-tail rows only) | 18 (after) | 2026-10-08 | iLovePDF, Sejda | The head rows at 85+ are gone | SEO-39 |
| merge pdf / combine pdf | 7.23 / 9.15 (after) | 1,597 / 551 (after) | 2026-10-08 | iLovePDF, Smallpdf | Page one: 11 clicks at 0.7% on merge phrasing, none on combine | SEO-39, SEO-03 |
| pdf size reducer / shrink pdf size / resize pdf | absent; kb-target variants 12.56 (after) | 156 (after) | 2026-10-08 | not sampled | No head-term row; the words reach only kb-target queries | SEO-39 |
| pdf tools / free pdf tools | not present | 0 | 2026-10-08 | not sampled | `/` ranks only for navigational queries | SEO-39 |
| password protect pdf free | 4.09 | 81 | 2026-10-08 | not sampled | Page one, no clicks | SEO-16 |
| jpg to pdf | not present | 0 | 2026-10-08 | iLovePDF, Smallpdf | `/image-to-pdf/` has never been crawled | SEO-06, SEO-03 |

### 3.6 Non-ranking dimensions

| Dimension | Us | Incumbents | Honest read |
| --- | --- | --- | --- |
| Domain authority | new (launched ~2026-06) | DR 59-83 | The binding constraint. Only SEO-03 moves it. |
| Free | no account, cap, watermark or paid tier | freemium with daily caps | Real and checkable. State it plainly, never as an attack. |
| Privacy | on-device, demonstrable offline in devtools | asserted, files uploaded | The one claim a competitor structurally cannot copy. |
| Open source | MIT, auditable | closed | Underused. |
| Language support (Sign) | 11+ scripts, native RTL, comb fields | Latin-centric | Largest unmatched product advantage; search demand for it unmeasured. |
| Offline / installable | full PWA | none | Underused. |
| Indexed page count | 21 indexed and 23 URLs earning impressions, of 38 live (2026-10-08) | thousands | SEO-06, SEO-03. |

### 3.7 By locale

**Read 2026-10-08** from the three-month export ([LOC-06](../backlog/tasks/LOC-06.md)); LOC-03's
eight-week read is 2026-11-06. `node scripts/seo-refresh.mjs` prints this section too (section 6 step 2);
paste its output over the tables below.

Same privacy-filter caveat as 3.1, more so here: a locale with only a handful of impressions has
proportionally more of its queries omitted by Search Console's privacy filter, so the query list below
is a lower bound on what the locale actually receives.

**/he/ pages vs. their English sibling**

| Page | Clicks | Impressions | CTR | Position | English sibling | Sibling clicks | Sibling impressions | Sibling CTR | Sibling position |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| `/he/merge/` | 7 | 849 | 0.82% | 14.33 | `/merge/` | 11 | 2,263 | 0.49% | 7.87 |
| `/he/sign/` | 7 | 329 | 2.13% | 36.47 | `/sign/` | 2 | 268 | 0.75% | 9.56 |
| `/he/compress/` | 0 | 110 | 0% | 34.46 | `/compress/` | 54 | 2,138 | 2.53% | 9.52 |
| `/he/how-to-sign-a-pdf-on-android/` | 0 | 57 | 0% | 10.96 | `/how-to-sign-a-pdf-on-android/` | 1 | 142 | 0.70% | 41.15 |
| `/he/how-to-sign-a-pdf-on-mac/` | 0 | 53 | 0% | 15.25 | `/how-to-sign-a-pdf-on-mac/` | 0 | 6 | 0% | 8.67 |
| `/he/how-to-sign-a-pdf-on-windows/` | 0 | 35 | 0% | 17.69 | `/how-to-sign-a-pdf-on-windows/` | 0 | 61 | 0% | 39.33 |
| `/he/how-to-sign-a-pdf-on-iphone/` | 1 | 34 | 2.94% | 14.94 | `/how-to-sign-a-pdf-on-iphone/` | 2 | 58 | 3.45% | 34.03 |

Pilot country for `/he/`: Israel (`src/i18n/localePrefixes.js`'s `pilotCountry` map). Israel, site-wide:
33 clicks, 1,476 impressions, 2.24% CTR, position 20.88. Search appearance "Translated results": 322
impressions, 8 clicks, position 10.52.

**Non-Latin queries, by script**

Hebrew: 3 clicks, 895 impressions, weighted position 28.3 (the 09-17 seven-day read was 82 at 50.3). The
merge family leads and ranks best: `איחוד קבצי pdf` 119 at 11.34, `איחוד pdf` 41 at 14.59, `איחוד קבצים`
27 at 10.93, `איחוד קבצים pdf` 23 at 13.61 (1 click), `מיזוג קבצי pdf בחינם` 20 at 12.45, `חיבור קבצי pdf`
14 at 12.57 (1 click). Sign phrasings sit at 17 to 72 (`איך חותמים על מסמך pdf` 70 at 24.76, `חתימה על
מסמך pdf חינם` 24 at 48.38), with one page-one row, `טופס לחתימה אונליין` 14 at 4.71. Compress phrasings
(`כיווץ`, `הקטנת`, `דחיסת`) at 10 to 84. `צירוף` rows (attach intent) are excluded from the merge read.
Full list in the script output; LOC-03 owns the read. Other scripts: 4 impressions in total.

---

## 4. The plan and its gates

Gates matter more than dates. A phase that starts before its gate is met spends crawl budget the domain
does not have. Status of each ticket is in section 1, not here.

| Window | Work | Gate to start |
| --- | --- | --- |
| Week 1 (Sep 10-16) | SEO-01, 02, 04, 05 - measure, then the free clicks. No new URLs. | none - **done** |
| Week 2 (Sep 17-23) | SEO-06, 07, 11, 12, **28** - the structural problems. | none - 07/11/12 done early; 06 and 28 open |
| Week 3 (Sep 24-30) | SEO-09, 10, 13, 17 (first new URL). SEO-08 done early. | SEO-09 must end with an indexing request, per section 2 |
| Week 4 (Oct 1-7) | SEO-14, 15, 18. **Re-measured 2026-10-08 (SEO-39).** | **Gate failed 2026-10-08:** none of the nine crawled, so no new URLs; effort goes to SEO-03 |
| Weeks 5-6 (Oct 8-21), on hold | SEO-19 (image compressor - the one new tool with measured demand; **shipped 2026-09-12 ahead of this gate**, see section 1), then SEO-20 (crop). One tool per week. | Week 4 gate passed |
| Weeks 7-8 (Oct 22 - Nov 4) | SEO-21's flattener code only (MOBI-02's export fix; the tool page is downgraded, see section 5), SEO-22 (extract images). | previous tool indexed |
| Week 9 onwards | SEO-23, 24, 16, then 25, 26, 27. SEO-21's page waits behind these on a Keyword Planner read. | re-order at every boundary |
| 2026-09-12 insert | SEO-33, 34, 35 - vocabulary on pages we already hold, no new URLs; decided from the three-instrument read in section 2. | none; the Week 4 gate is about new URLs and these add none |
| Throughout | SEO-03 external signals. The only work that moves the constraint; it does not live in this repo. | |

---

## 5. Reference: the competitive landscape (deep research, 2026-09)

Incumbents, for scale. None is a target.

| Platform | Monthly organic visits | Authority | Main audience | Top organic drivers |
| --- | --- | --- | --- | --- |
| ilovepdf.com | 163.7M | DR 83 | India 29.3%, Indonesia 12.8%, Brazil 6.8% | "i love pdf" 5.9M, "jpg to pdf" 4.8M, "pdf to word" 4.0M |
| smallpdf.com | 38.5-55.0M | AS 83 | India 17.8%, US 10.6%, Bangladesh 9.0% | "jpg to pdf" 6.12M, "pdf to word" 5.0M, "pdf compressor" 1.83M |
| pdf24.org | 12.3M | DA 59 | Germany, US, global | brand, "merge pdf", "compress pdf" |
| sejda.com | 10.3M | DR 81 | US, Western Europe | "edit pdf online", "pdf editor", "compress pdf" |
| pdfgear.com | 2.9M | DR 65 | US, East Asia | brand, "free pdf editor", "convert pdf" |

They rank on brand demand, task completion and age. Their shared weaknesses - upload to a server,
freemium behind "free", privacy asserted not demonstrable, the execution-specific long tail unserved -
are the basis of our positioning; section 7 turns them into claims we can evidence.

### The winning queries the research identified, and what we decided

**All "est. volume" figures below came from the deep-research pass, not Keyword Planner or Trends -
competitor-tool guesswork, not measurement.** SEO-21 checked its own row against Google Trends
(worldwide, past 12 months) and found `flatten pdf` at 1-2 relative interest against `compress pdf`
~55-70 and `merge pdf` ~90-100: not "smaller," noise-floor, nowhere near 20k-50k. That row's decision
and ticket are corrected below. Every other unmeasured row here (make pdf look scanned, grayscale,
extract images, crop) carries the same risk until it gets the same check; do not schedule build effort
off this table's volume column without one.

| Query | Est. volume | Who wins it now | Decision | Ticket |
| --- | --- | --- | --- | --- |
| compress pdf to 100kb / 200kb / 500kb | 280k-600k combined | smallseotools, PDNob, DocHub | `/compress/` already carries this h1 and the feature. **Rejected** the three doorway variants; fix CTR and write one honest guide. | SEO-05, SEO-17 |
| make pdf look scanned | 40k-90k | supertool, scanyourpdf, LookScanned | Build. One-stop-shop reasoning recorded in the ticket. | SEO-24 |
| grayscale pdf / black and white | 30k-80k | supertool, Cloudinary | Build, late; disclose that we rasterize. | SEO-23 |
| flatten pdf online | 20k-50k (Trends check 2026-09-12: ~1-2 relative interest, near-zero) | mytulify, toolspivot | Ship the shared flattener for Sign's export now (also closes MOBI-02); **downgrade the tool page to P3/longer-term** pending a Keyword Planner absolute-volume read. | SEO-21 |
| extract images from pdf | 40k-100k | digitalheroesco, toolscopilot | Build, late; zip-free per the PdfToImage precedent. | SEO-22 |
| crop pdf online | 30k-70k | launchvibe, toolslabpro, Sejda | Build; lossless CropBox, reuses the editor's box gesture. | SEO-20 |
| merge pdf online free no limit | 60k-140k | iLovePDF, supertool | Expand `/merge/`; the fact is in the FAQ, move it where it is read. | SEO-10 |
| permanently redact pdf | 15k-35k | Adobe, Sejda | Expand `/redact/`; the searched word plus a test the reader can run. | SEO-04 |
| sign pdf online without account | 25k-60k | DocHub, Smallpdf | Expand both pages. **Rejected** merging `/sign-pdf-no-signup/` into `/sign/`. | SEO-07 |
| compress pdf without losing quality | 45k-110k | supertool, DocHub | **Rejected** as a claim: we rasterize. Disclose instead. | SEO-05, SEO-25 |

### Rejected as architecturally impossible

| Query | Volume | Why not |
| --- | --- | --- |
| pdf to word / docx | 5M+ | Layout reconstruction into OpenXML needs a server-side engine. |
| pdf ocr / text from scanned pdf | 300k+ | 20MB+ language data per language; locks the UI thread on mobile. |
| e-sign with audit trail | 100k+ | Needs server PKI, a timestamping authority, tamper-evident logs. |
| ai chat / summarize pdf | 500k+ | External LLM endpoints; content leaves the device. |
| cloud batch compress 500mb | 50k+ | Exceeds per-tab heap. |

SEO-26 covers saying so on an existing page. Never a page targeting one of these.

---

## 6. Reference: the refresh procedure (SEO-02)

Monthly, plus after any ticket that claims a ranking or CTR change. Last: 2026-10-08 (SEO-39). Next: **2026-11-07**.

1. **Export.** Search Console, Performance -> Search results, Search type = Web, Date = Last 3 months,
   Export -> CSV, unzip. For indexing: Indexing -> Pages, export Coverage, and drill into any
   not-indexed category with 5+ pages for its URL list.
1b. **Also export Performance -> Generative AI features** (same date range) into its own folder; it
   carries impressions only and feeds SEO-04's AI-feature share.
2. **Run `node scripts/seo-refresh.mjs <export folder>`.** It prints the section 3.1 to 3.3 tables,
   and section 3.7 (by locale - LOC-06) in the same pass. Paste every table over the existing ones -
   replace, do not append.
3. **Crawl dates.** Export Indexing -> Pages -> Valid (its `Table.csv` has a `Last crawled` column for
   every indexed URL) and write the dates into `docs/seo-last-crawled.json`; a URL absent from it is
   not indexed, and only the Not-indexed export says whether it was crawled. Run
   `npm run seo:crawl-staleness`, update 3.4. The printed stale list is the reindex queue; submit each
   once (one URL per day may hit the quota).
4. **Before reading any CTR as a verdict**, check that the indexed SERP title matches the live one for
   that page (section 2, first lesson). A stale index makes a flat CTR mean "not yet crawled".
5. **Manual columns**: "Who is above us" in 3.5 from Shlomi's Google screenshots, with Bing/DuckDuckGo
   as a proxy for who competes only. Record the sampling date.
6. Update every "measured"/"exported"/"captured" date, the status board in section 1, and the next
   refresh date at the top of this section.

Known gap: `Queries.csv` omits low-volume queries (privacy filter), so cluster totals are a lower
bound and `Pages.csv` is the exact site-wide number. This hits section 3.7 hardest of all - see the
caveat there.

---

## 7. Reference: the positioning review protocol (SEO-11)

SEO-12 through SEO-16 are per-tool deep reviews, each run by its own agent with a real token budget.
This is the shared brief; each review ticket links here rather than restating it. SEO-12 is the worked
example, including for **a review that correctly concludes "no change"**.

### The four claims, and the evidence each needs

Every competitor says it is free, private, fast and easy. For us these are consequences of an
architecture, which means we can evidence them. **A review may lean on a claim only with its evidence.**

| Claim | What is actually true | What proves it | What we must never say |
| --- | --- | --- | --- |
| Free | No account, no cap, no watermark, no paid tier, none planned. Free because it costs almost nothing to run. | The product, and the absence of any upgrade path in it. | "Free tier". "Free forever" as a promise. Anything implying a paid version. |
| Private | Nothing is uploaded; there is no PDF backend. | Open devtools, go offline, watch it work. `/open-source-pdf-editor/` documents the test. | "Military-grade", "100% secure", "breach-proof". |
| Open source | MIT, auditable, public repository. | The repository and `/licenses/`. | Implying an audit that has not happened. |
| Works on any device | Mobile-first, installable, offline once provisioned. | Mobile ranks better than desktop in our own data (3.3). | "Works everywhere" without the browser constraints. |

Guarded by `scripts/check-never-say.mjs` (`npm run check:never-say`, part of `check:fast`); the banned list lives there.

Re-checked 2026-09-11: no `src/data/tools.js`, `.astro` or content-page entry uses a "never say" phrase
about our own product.

### The rule that will be tempting to break

Competitors being freemium in disguise, or unable to prove their privacy claims, is *true* and is *not
ours to say*. State our own fact so plainly that the comparison happens in the reader's head. "Your file
does not leave your device" does that; "unlike other tools, we don't upload your file" makes us sound
like everyone else. CLAUDE.md, voice principle 1.

### The per-tool method

Every review ticket (SEO-12 through SEO-16) follows this:

1. Pull the tool's queries out of the latest Search Console export (section 1). Rank them by
   impressions. These are the words real people use, and they outrank any keyword-volume estimate in
   section 3's research. **Check first that the cluster's queries actually land on the tool's own
   page** - cross-reference against the "By page" table. SEO-12 found that Sign's entire 58-query
   cluster ranks on the four OS guides, not on `/sign/` itself, which ranks on queries GSC withholds
   under its privacy filter. Running the top-ten analysis without this check means analysing the wrong
   page's SERP.
2. Read the top ten results for the three highest-impression queries. Record what each page leads with,
   what it claims, what it hides, and what its actual limits are behind the signup wall.
3. Compare against our page's current copy, word by word, including `seoTitle`, `seoDescription`, `h1`,
   `subhead`, `gridDescription`, the step copy and every FAQ answer in `src/data/tools.js`.
4. Name the differentiator this specific tool has that the competition structurally cannot match. Some
   have a strong one (Sign's language support; Redact's flattening being verifiable). Some have only the
   four general claims above, and a review that invents a fifth is doing harm.
5. Propose concrete copy, with the diff, and the evidence for each claim it makes.

**When step 1 has nothing to run on.** A page with zero Search Console impressions (SEO-15 hit this for
`/edit-pdf/`, `/image-to-pdf/` and `/pdf-to-image/`) has no queries to rank by impressions, so step 1
cannot run as written. Substitute, in this order: section 3's competitor-research volumes and named
players for the closest matching query; a WebSearch sweep of the phrasings competitors themselves target
for the tool's core operations (record engine and date, same as step 2 already requires); and an explicit
check of the full query export for anything adjacent in intent, even if it lands on a different page,
recorded as "checked, nothing found" if it turns up nothing rather than skipped silently. **State this
substitution plainly in the review, and do not let it read as equivalent to step 1's real evidence**: the
substitute describes what the competitive field does and does not say, not what our own visitors search
for or click, and a review built on it should hedge its confidence accordingly - a name-a-differentiator
finding from a real Search Console number (SEO-04, SEO-13, SEO-14) and one from this substitution (SEO-15)
are not the same strength of claim, even when both are written up with equal rigor.

### The worked example

SEO-12 (the Sign review) is the model for the other four: it names the specific advantage precisely
(real font embedding across eleven scripts, UAX#9 bidi, per-glyph shaped positioning, RTL boxes that
grow from a fixed right edge, comb-field detection), states the acceptance criteria in SEO-11's terms
(query list, top-ten analysis, word-by-word comparison, named differentiator, evidenced claims, no
competitor references), and is explicit about where the review should be sceptical of its own
enthusiasm ("supports 11 scripts" is a marketing sentence; "the letters come out in the right order in
the file you download" is the thing a person needed). Read it before starting SEO-13 through SEO-16.

**SEO-12 is also the model for a review that correctly concludes "no change."** It ran the method end
to end - real SERP samples for the three highest-impression queries, a full re-derivation of the query
list from the raw export rather than the cluster summary, a word-by-word comparison against the pages
that actually rank - and found that a prior ticket (SEO-07) had already shipped everything this one
would have proposed. It said so, with the evidence for each "already correct" verdict, rather than
inventing a copy change to have something to ship. The next four reviews should read this as permission
to reach the same conclusion where it is true.

---

## 8. Reference: SEO-03 venue list and outreach log

Kept here rather than in the ticket, per SEO-03's own acceptance line: this is a living list re-checked
at every refresh (like section 3), not a diagnosis with a shelf life (like a ticket's own narrative).
Update in place; do not append a new list each pass.

### Done (2026-09-11)

- **The GitHub repo itself.** Description rewritten from Merge-only to the full nine-tool suite;
  homepage corrected from the `pdkef.vercel.app` preview domain to `https://pdkef.com`; 15 topics added
  (there were none): `pdf`, `pdf-tools`, `pdf-editor`, `pdf-merge`, `pdf-signer`, `client-side`,
  `privacy`, `privacy-tools`, `offline-first`, `static-site`, `astro`, `preact`, `webassembly`,
  `open-source`, `pwa`. README's language paragraph corrected from naming 11 languages to the real 20
  (`src/data/tools.js`'s `languages.supported` array) - it had gone stale as scripts shipped and was
  undercounting the product's own strongest differentiator. Full change: [SEO-03](../backlog/tasks/SEO-03.md#implementation-2026-09-11).
- **Release history** - done. [v1.0.0](https://github.com/shlomsh/pdkef/releases/tag/v1.0.0)
  published 2026-09-11 19:54 UTC, tag at `038b5d7` on `main`, notes in
  [docs/archive/release-notes-v1.0.0.md](./archive/release-notes-v1.0.0.md) (nine tools, 20-language Sign, on-device
  drafts, Hebrew editions, CSP backstop). `package.json` went 0.1.0 to 1.0.0 in `054b8db`. The
  awesome-selfhosted four-month clock runs from the tag date: **eligible from 2027-01-12**.

### Candidate venues and outreach log

Entry criteria are checked against each venue's own stated contribution rules, not assumed - see the
awesome-selfhosted row below for why that check matters.

| Venue | Entry criteria | Met? | Status |
| --- | --- | --- | --- |
| pluja/awesome-privacy (19.7k stars) | Clear privacy/own-your-data policy; no third-party trackers beyond their approved Analytics list; open source preferred | Yes on policy and source; **borderline on trackers** - pdkef.com runs Vercel Web Analytics, which is not on their approved-analytics list and their own copy says to avoid "any private service" analytics. Submitted anyway (Shlomi's call, 2026-09-11): defensible in substance (anonymized, cookieless, same-origin) even if a reviewer could read the checklist literally. | **Submitted 2026-09-11**: [pluja/awesome-privacy#1103](https://github.com/pluja/awesome-privacy/pull/1103), added to the `Utilities` section (no dedicated PDF-tools category exists on this list). Awaiting review - their stated cadence is monthly batches. |
| awesome-selfhosted (awesome-selfhosted-data) | Requires a tagged GitHub release **more than 4 months old**; no such requirement was obvious from the README alone, found only by reading their actual `CONTRIBUTING.md` | **No** - PDkef has zero GitHub releases (only three `archive/*` branch tags). An immediate submission would get their own canned rejection reply. | Not submitted. `v1.0.0` was tagged 2026-09-11, so the four-month clock is running: **submit on or after 2027-01-12**, re-reading their `CONTRIBUTING.md` first in case the rule changed. |
| openalternative.co | Repository must have **at least 10 GitHub stars** (stated on the submit form itself, next to the Repository URL field) | **No** - repo had 4 stars at attempt time. Confirmed by the form's own hard block, not just a guess: *"This repository has fewer than 10 stars. Please come back once the project has gained more traction."* | **Attempted 2026-09-11, rejected by the form.** A second, independent confirmation (after awesome-selfhosted) that a star/traction floor is a real, common gate on these directories - check for one before drafting anything, don't assume a "free, open, no barrier" directory has none. Revisit once the repo clears 10 stars. |
| Lissy93/awesome-privacy (9.8k stars) | Not yet checked | Unknown | Not evaluated - a second, comparable privacy list; check its own contributing rules before submitting, don't assume they match pluja's |
| abhi18av/awesome-pdf (56 stars, active) | Standard awesome-list PR, no CONTRIBUTING.md or star gate found; has a dedicated "Online PDF Tools" section already listing near-identical competitors (PDFGem, abcdtools, Fluranto) | Yes | **Submitted 2026-09-11**: [abhi18av/awesome-pdf#68](https://github.com/abhi18av/awesome-pdf/pull/68), one line in Online PDF Tools. Note: two sessions worked this venue the same evening and a second, longer entry (with the 20-language Sign line) was drafted but not pushed once #68 was found open - one PR per venue; if #68 is asked for edits, that is the place to add the language line. |
| OneOffTech/awesome-pdf (30 stars, active) | Submission via GitHub issue (their "Add Entry" template), not a PR; "Creation and production" category already lists similar tools (BentoPDF, Stirling-PDF) | Yes | **Submitted 2026-09-11**: [OneOffTech/awesome-pdf#81](https://github.com/OneOffTech/awesome-pdf/issues/81), category Creation and production, authorship disclosed in the issue. Their contributing.md says a maintainer reviews and notifies; no cadence stated. |
| Astro Showcase (astro.build/showcase) | Post the site URL as a comment in [withastro/roadmap#521](https://github.com/withastro/roadmap/discussions/521); no stated star/traction gate | Yes - genuinely built with Astro | **Posted 2026-09-11** (19:34 UTC, the same parallel session as #68): one comment naming the islands split. The thread has 2,400+ comments and the showcase itself is curated by the Astro team from it, so there is no acceptance signal to watch; check astro.build/showcase at the monthly refresh. Do not post again. |
| PWA directories (pwa-directory.appspot.com "Gulliver", appsco.pe) | Valid web manifest over HTTPS; PDkef is a real installable PWA | Yes | Not yet checked in detail or submitted |
| AlternativeTo.net | Real, working product with a URL | Yes | Not yet listed |
| Product Hunt | Live product, real launch post | Yes | Not yet launched |
| r/privacy, r/opensource, r/selfhosted (Reddit) | Honest disclosure of authorship, no drive-by link | Yes, if posted as "I built this" rather than a plain link | Not yet posted |
| Hacker News (Show HN) | Working product, genuine "I built this" framing | Yes | Not yet posted |
| Privacy Guides community (discourse/forum) | On-topic privacy tool, disclosed authorship | Yes | Not yet posted |

### Referring-domain baseline (2026-09-11)

**Zero external mentions found.** Web searches for `pdkef.com` and `"pdkef"` (blocking pdkef.com's own
results) surface only our own pages, unrelated acronym collisions (a Wikipedia disambiguation, a
malware registry entry, word-unscrambler sites) and one coincidental Imgur album URL - nothing that is
actually about this product. Repo-side signal is consistent with that: 4 GitHub stars, 0 forks, 0
network dependents, domain registered/launched 2026-06-30 (about 10 weeks old at this measurement). This
matches the epic's own standing diagnosis - a new domain with no authority yet - and gives SEO-03 an
honest starting point: there is nothing to protect or build on, only somewhere to go up from.

**Method caveat, read before trusting this number at the next refresh.** This is a general web-search
proxy, not an authoritative backlink index - it can miss a real referring link that never got indexed
by this search tool, and it cannot enumerate a *count* of referring domains the way a proper link-graph
tool does. Search Console's own Links report (Shlomi's account) or Bing Webmaster Tools' free backlink
report would both be more precise; neither is accessible from this environment. Treat "zero found by web
search" as a floor, not a verified zero, until one of those is checked.

**Next measurement:** re-run the same two searches at the 2026-10-08 refresh (section 6) and record
whatever the venue outreach below produced by then. If a real backlink tool becomes available (Shlomi's
GSC/Bing access), prefer it over this proxy from that point on.
