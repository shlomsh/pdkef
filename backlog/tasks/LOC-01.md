---
id: "LOC-01"
title: "Measure non-English demand from outside Search Console: the gate for the second language"
status: "done"
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

## Evidence captured 2026-09-11 (research brief report)

[docs/localized-search-research-brief-report.md](../../docs/localized-search-research-brief-report.md)
committed, run against the brief with the tools reachable from this environment (no Trends comparison
UI, no Keyword Planner, no `hl`/`gl`-scoped SERPs — all recorded as "not checked" per the brief's own
rule rather than guessed). Its one clean, source-backed finding: Google's published
["Translated results"](https://developers.google.com/search/docs/appearance/translated-results)
language list covers Indonesian, Hindi, Bengali, Urdu and Arabic but **not** Hebrew, Malay, or
Filipino/Tagalog — so an English pdkef page is already machine-bridged to searchers in the first group
today, and never reaches the second group at all until we build something. That cuts the other way from
raw competitor-page counts: it weakens the case for Hindi/Bengali/Urdu (Google already covers the gap)
and strengthens the standing case for Hebrew (already decided) and reopens Malay/Filipino as worth a
real check despite thinner competitor build-out.

**Per-language verdict (criterion 1 / 2 / 3 against the decision rule above):**

| Language | 1. Trends share | 2. Weak incumbent to beat | 3. Reviewer available | Verdict |
| --- | --- | --- | --- | --- |
| Hebrew | **Measured (Shlomi's Trends screenshots, 2026-09-11):** small vs. English on all 4 anchor tasks — merge steadiest (~1/3), sign near-zero, compress/pdf-to-jpg sporadic spikes only. Does not clear "comparable share" by the letter of criterion 1. | Met — thin upload-site competition, no on-device/RTL claim (existing evidence) | Yes (in-house) | **Decided: pilot** (unchanged — criterion 1 was already "informative, not decisive" for Hebrew per the ticket) |
| Indonesian | **Measured (Shlomi's Trends screenshots, 2026-09-11):** compress and sign at or near parity with English (2 of 4 anchor tasks — clears the rule outright); merge ~half; pdf-to-jpg the weak spot (~1/5-1/4). Backed by iLovePDF's ~22% Indonesia traffic share (Similarweb) as a secondary signal. | **Measured (Shlomi's SERP screenshots, `hl=id&gl=ID`, all 4 anchor tasks): not met.** Every top-five result on every query is a mature global player (iLovePDF, Smallpdf, Adobe, PDF24, Canva) with a native-quality title and, on most, an `AggregateRating` snippet carrying review counts in the hundreds of thousands (Smallpdf: 511k-703k). No mixed-language or machine-translated incumbent found. The cloud-vs-device gap (PDF24 names its own German server; nobody claims on-device) still stands as a real opening, but it is not the "weak incumbent" criterion 2 asks for. | Not yet confirmed | **Pilot, but re-scoped** — carried by criterion 1 (cleared) and the honest device-privacy gap, not by a weak field; criterion 2 as originally written does not hold |
| Malay | **Measured (Shlomi's Trends screenshots, 2026-09-11): all 4 anchor tasks flat at 0** against a normal English line — no in-language search volume for compress/merge/sign/convert large enough for Trends to register. Cleanly fails criterion 1. | **Measured (Shlomi's SERP screenshots, `hl=ms&gl=MY`, all 4 anchor tasks): a second independent "no" signal.** Zero `AggregateRating` snippets on any of the four queries (vs. Indonesian's hundreds-of-thousands review counts) — no proxy for real engagement volume. On 2 of 4 queries (merge, sign) Google has no matching native Malay page from the top competitors and falls back to a translated Indonesian page or an untranslated English one, undercutting the "every major built the `/ms/` page" framing. AI Overviews and a few Malay-language videos appear, showing some informational curiosity, but not the volume a reviewed page needs. | Not evaluated (moot) | **No** — confirmed twice over: Trends volume and SERP engagement signal both point the same way |
| Hindi | **Measured (Shlomi's Trends screenshots, 2026-09-11): flat at 0 on all 4 anchor tasks**, for both Hinglish and Devanagari probes (16 non-English terms, phrasing lifted from Smallpdf/PDF24/iLovePDF's own Hindi pages and YouTube titles) against an English line at 35-100. **GSC India (source 3, same day): all English, zero Hinglish leakage** - unlike Indonesia's filter, which leaked `gabung pdf free online`. Two clusters: blur/redact and compress-to-100kb (SEO-17's audience, asking in English). | Not applicable - criterion 1 fails on two instruments | N/A | **No** - measured, not inferred; closes SEO-27's Hindi question |
| Filipino/Tagalog | Not measured; competitor titles code-switch (Filipino verb + English object) rather than reading as clean Tagalog | Not evaluated | Not evaluated | **Later** — not on Google's translated-results list either, so worth one real check |
| Urdu | Not measured; romanized query surfaced only Hindi pages, no Urdu-script evidence either way | Not evaluated | Not evaluated | **No evidence yet** — next step is Shlomi's GSC Pakistan filter (method source 3), not this report |
| Bengali | Not measured; romanized query surfaced zero Bengali-specific results | Not evaluated | Not evaluated | **No evidence yet**, weakest priority to re-check |
| Arabic | Not measured; deep native ecosystem on every major competitor for both compress and sign | Not met — competitors are native-quality already | Not yet confirmed | **On Google's translated-results list**, so marginal gain of our own edition is smaller than the competitor count suggests; not scoped as a pilot from this pass |

**Measurement is complete for every candidate this ticket named (2026-09-11).** Trends and SERPs are
in for Hebrew, Indonesian, Malay and Hindi; GSC by country is in for Israel, Malaysia, Indonesia and
India. Malay and Hindi are flat at 0 on every instrument. Hebrew is small but real and costs nothing to
review. Indonesian is the only language with real in-language volume, and it is also the one where the
SERP is owned end to end by iLovePDF, Smallpdf, Adobe, PDF24 and Canva with review counts in the
hundreds of thousands - a field this domain does not yet beat in *English* (`/merge/` sits at position
36 on its own query, per the findings doc). **What remains is a judgment, not a measurement:** whether a
paid-reviewed Indonesian edition, on a domain Google crawls slowly (SEO-06, SEO-28) and where Google
already serves our English page machine-translated to Indonesian searchers, can earn back its cost
against that field. See the ROI note below.

## ROI note (2026-09-11): the question this ticket hands on, not answers

Shlomi's read on seeing the Hindi and Malay zeros: "maybe there is ROI negative for this effort". The
evidence supports asking it seriously, and it is deliberately not answered here - it is
[LOC-07](LOC-07.md), for a fresh agent with the numbers in front of it rather than the person who
gathered them.

The shape of the question, so LOC-07 starts from the evidence and not from scratch:

- **Cost is the reviewer, and it is zero for exactly one language.** Hebrew is reviewed in-house; every
  other language is paid per page, and machine translation reviewed by nobody is the one version
  Google's spam policy names. So Hebrew's small volume can still be positive; Indonesian's larger
  volume has to clear a real cost.
- **The one language with volume is the one with the hardest field.** Indonesian's four SERPs are
  owned by iLovePDF, Smallpdf, Adobe, PDF24 and Canva, with `AggregateRating` counts of 300k-700k.
  This domain has not beaten that field in English: `/merge/` is at position 36.13 with 0 clicks on
  its own query (findings doc, section 3). A language edition does not carry more authority than the
  English original.
- **Google already bridges the gap for Indonesian.** It is on the translated-results list; an
  Indonesian searcher can already reach our English page machine-translated. Hebrew, Malay and
  Filipino are not on the list - which is an argument *for* Hebrew and irrelevant for Malay (no
  volume to bridge).
- **Crawl budget is the binding constraint on this domain.** Nine English pages have never been
  crawled (SEO-06) and the two best pages are recrawled least (SEO-28). Three more `/id/` pages join
  that queue.
- **What would change the answer.** (a) The Hebrew pilot (LOC-03) producing measurable in-language
  impressions - it is the calibration for what a localized page earns here. (b) An English tool page
  reaching page one for its own query, which would show the domain can compete with the same field.
  (c) A GSC "Translated results" reading showing Indonesian searchers are already arriving on the
  English page in numbers - that is the demand a native page would upgrade rather than create.

Status: this ticket is done - every measurement it scoped is in, with sources. LOC-04 now depends on
LOC-07 as well as LOC-03.
