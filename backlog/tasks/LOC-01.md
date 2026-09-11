---
id: "LOC-01"
title: "Measure non-English demand from outside Search Console: the gate for the second language"
status: "open"
priority: "P2"
epic: "localized-search"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# LOC-01 · Measure non-English demand from outside Search Console: the gate for the second language

## Scope and acceptance

**Why this exists.** The site's traffic is led by India, then the US, Israel, Malaysia, Indonesia, the
Philippines, Pakistan and Bangladesh (findings doc 3.3), and every query in the Search Console export
is English. [SEO-27](SEO-27.md) read that as "people in these countries search this category in
English". That reading is wrong in a specific way: **an English-only site never gets an impression on a
non-English query, so its Search Console can only ever show English queries.** The absence is the blind
spot, not a measurement of it. Competitors do get those impressions: `כיווץ מסמך pdf` returns
`tools.pdf24.org/he/compress-pdf` first, and Sejda, iLovePDF and PDF24 all publish per-language tool
pages with a language switcher. Whether that demand is worth our (native-reviewed, not machine)
translation cost is what this ticket measures, before anyone builds a page.

**The method: three outside sources, since GSC is structurally blind here.**

1. **The research brief.** Run [docs/localized-search-research-brief.md](../../docs/localized-search-research-brief.md)
   through a research agent. It returns, per language, the in-language share of the anchor tasks
   (Google Trends by country, Keyword Planner or a third-party tool where available), the phrasing
   matrix per tool, the incumbents and their page quality (native / machine / mixed-language / LTR-only
   RTL), whether Google already serves "Translated results" for that language, and draft SERP text.
2. **Shlomi's SERP screenshots.** Google blocks scripted fetches from this environment (findings doc,
   section 2), so the incumbent check for the top phrasings per language comes from real screenshots
   with `hl`/`gl` set, the same way SEO-04 and SEO-12 were done. Hebrew first: `כיווץ קובץ pdf`,
   `מיזוג קבצי pdf`, `חתימה על pdf`, `pdf ל jpg`. Indonesian second: `kompres pdf`, `gabungkan pdf`,
   `tanda tangan pdf`, `pdf ke jpg`.
3. **One GSC check that is not blind.** Performance, filter Country = Israel, Queries tab. The 20
   Israeli impressions are English queries by construction, but *which* English queries an Israeli
   types tells us whether the Hebrew-speaking visitor arrives via English at all, or only the
   English-speaking one does. Same for Indonesia and Malaysia.

**Hebrew is decided and does not wait for this ticket (2026-09-11).** The evidence section below was
enough: five localized incumbents on every Hebrew query, two of them small upload sites holding page
one, no result claiming on-device processing or Hebrew/RTL support, and a reviewer in-house. What this
ticket would add for Hebrew is the size of the query, which changes nothing about whether three
reviewed pages are worth a review pass. LOC-02 and LOC-03 start now; this ticket gates **LOC-04**, the
second language, where a reviewer costs money and the choice is open.

**Decision rule for the second language, written before the data so it is not fitted to it.** A
language goes to a pilot when all three hold: the native phrasing carries at least a comparable share to the English
one in Google Trends for two of the four anchor tasks in that country; at least one incumbent on the
top phrasing is a mixed-language or machine-translated page (so a native, correctly-laid-out edition
has something to beat other than authority); and a native reviewer is available for the page-level
review `src/content.config.ts` already requires. Indonesian is the expected candidate (see the two
in-language queries below). Hindi is expected to fail the first (Devanagari
tool queries are rare against English and Hinglish), and if it does, that closes SEO-27's Hindi
question with evidence rather than inference.

**Acceptance.**

- The research agent's report committed under `docs/` next to the brief, with its sources intact.
- A per-language verdict table in this ticket: pilot / later / no, with the evidence line for each of
  the three criteria, and the top phrasing per tool for any language marked pilot.
- SEO-27's "every India query is in English" lesson corrected in `docs/seo-competitive-findings.md`
  section 2 (one line, linking here), and the findings doc's status board carrying a row for this epic.
- No page built here; LOC-02 and LOC-03 build, in parallel with this. **The findings doc's Week 4 gate does not apply to this
  epic.** That gate exists to stop the *English* effort adding low-value pages to a domain Google is
  slow to crawl; it was written without the multilingual case in view. A reviewed Hebrew tool page is a
  different asset from a fourth compress-to-N-kb doorway, and Shlomi has said so explicitly
  (2026-09-11). The crawl-budget concern still argues for three pages rather than nine, which LOC-03
  already does.

## Evidence captured 2026-09-11 (Shlomi's screenshots)

**GSC per country, 3 months, Queries tab.** Israel: four queries, all English (`blur pdf`,
`pdf blur online`, `blur pdf online`, `how to sign pdf android`), 7 impressions in total. Malaysia:
19 queries, all English, blur and extract vocabulary. Indonesia: 50-impression `blur pdf online` lead,
then English blur variants, and **two in-language queries on an English page**: `gabung pdf free
online` and `pdf combine gratis` (1 impression each). That is the blind spot showing its edge: Google
matched an Indonesian verb to our English page once; an Indonesian page would be matched routinely.
Israel shows nothing of the kind because Hebrew and English share no vocabulary, so the Hebrew
searcher never reaches us at all. This is source 3 of the method above, done.

**Hebrew SERPs, `hl=he`, desktop.**

| Query | Top five | Read |
| --- | --- | --- |
| `כיווץ מסמך pdf` | PDF24 (`דחיסת PDF - חינם 100% ואונליין`, 4.9 stars from 14,952), freepdfconvert, AvePDF, Adobe; AI Overview citing PDF24 and freepdfconvert | Google treats `כיווץ` and `דחיסה` as synonyms: the typed word is `כיווץ`, every title says `דחיסה`. A title that says the word the user typed is an open slot. |
| `מיזוג קבצי pdf` | PDF24, freepdfconvert, AvePDF, Sejda, Adobe | Uniform `מיזוג` vocabulary. |
| `מילוי טופס pdf חינם` | PDF24 edit-pdf, Sejda pdf-editor, PDF24 fill-out-pdf, Adobe, AvePDF | Intent split between "edit" and "fill"; nobody on the page says anything about Hebrew text or RTL. |

Three things follow. **The competition is thin**: freepdfconvert and AvePDF are small upload sites
holding page one on all three queries, which an English SERP would not allow; criterion 2 of the
decision rule is met for Hebrew by inspection. **Every incumbent is an upload site with translated
copy**; no result says the file stays on the device, and none mentions Hebrew or right-to-left, so the
two facts we can honestly lead with are unclaimed. **PDF24 carries review stars on every query**, the
same `AggregateRating` we declined in SEO-04; we still decline it. What remains open for Hebrew is
criterion 1, the in-language share against English in Israel, which needs Trends or Keyword Planner
from the research brief; the SERPs above show the demand is real enough to have five localized
incumbents, not how large it is. For Hebrew that number is informative, not decisive, per the paragraph
above; it is decisive for Indonesian.
