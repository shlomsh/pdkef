# Localized search demand: research report

Produced against [docs/localized-search-research-brief.md](./localized-search-research-brief.md) for
[LOC-01](../backlog/tasks/LOC-01.md). Hebrew's incumbent check (source 2 of the ticket's method) was
already done by Shlomi's screenshots and is not repeated here; this report adds Hebrew's remaining
criterion-1 gap and covers the languages LOC-01 still needs: Indonesian, Malay, Hindi (the
decision-gating trio), then lighter passes on Filipino, Urdu, Bengali, Arabic.

**A hard limitation, stated once here rather than per line:** this environment cannot fetch real
Google SERPs with `hl`/`gl` set, and has no access to Google Trends' comparison UI or Keyword Planner
(both are JS-rendered/authenticated and returned empty shells on the one attempt made). Every claim
below comes from one of: (a) a web search tool without country/language targeting (US-biased, not a
substitute for a real SERP), (b) direct fetches of specific competitor URLs (real content, but not
proof of ranking position), (c) Google's own published documentation. Nothing here should be read as
"this is what ranks in Israel/Indonesia/etc." — that still needs Shlomi's screenshots, exact query
lists given below. This report's job is to narrow which queries are worth screenshotting and to supply
the one fact this environment *could* establish cleanly: which languages Google already auto-translates
search results into.

## The one clean finding: Google's "Translated results" language list

Fetched directly from [Google Search Central](https://developers.google.com/search/docs/appearance/translated-results).
Current, complete list: **Arabic, Bengali, English, French, German, Gujarati, Hindi, Indonesian,
Kannada, Korean, Malayalam, Marathi, Persian, Portuguese, Spanish, Tamil, Telugu, Thai, Turkish, Urdu,
Vietnamese.**

**Hebrew, Malay, and Filipino/Tagalog are not on it.** Indonesian, Hindi, Bengali, Urdu, and Arabic are.
This cuts against the brief's implicit assumption that "no in-language page" means "no reachable
content" for those five languages — Google already machine-translates our English titles/snippets (and
the page itself, on click) for a searcher in Indonesian, Hindi, Bengali, Urdu, or Arabic, without us
doing anything. Per the brief's own rule (part C), that makes the *marginal* gain of our own edition in
those languages smaller than it looks from competitor counts alone, and it is a reason the decision
rule leans on incumbent *quality* (criterion 2) rather than presence: a same-quality machine
translation of our page is not much worse than a page we'd have to pay to build. For Hebrew, Malay, and
Filipino, there is no such backstop — an English pdkef page is genuinely invisible to those searchers
until they read English, which is the strongest argument in this whole report for those three staying
in scope even where raw volume looks small.

## Summary table

| Language | Anchor-task in-language share | Strongest tool (this pass) | Incumbent quality | Google translated-results? | Recommendation |
|---|---|---|---|---|---|
| Hebrew | **Measured**: small vs. English on all 4 anchor tasks — merge steadiest (~1/3, sustained), sign near-zero | Sign / fill-form | 5 localized incumbents per query, all upload-site translated copy, none native-quality per ticket's existing screenshots | **No** | Decided already (ticket): pilot, LOC-02/03 underway |
| Indonesian | **Measured**: compress and sign at/near parity with English (2 of 4 tasks); merge ~half; pdf-to-jpg weak (~1/5). Also: iLovePDF gets 22.2% of its global traffic from Indonesia | Sign (Mekari Sign is an Indonesia-only native competitor) / Compress | Native-quality on the majors (Smallpdf, PDF24); at least one aggregator claims on-device processing already (needs verification) | Yes | **Pilot** — criterion 1 cleared outright |
| Malay | **Measured: all 4 anchor tasks came back flat at 0** — no in-language search volume large enough for Trends to plot, while English held its normal line | Sign (richer native ecosystem than compress/convert, but see Trends result) | Mixed: sign pages read native, but organic demand signal for convert/compress in Malay looks thin | No | **No** — the Trends zero settles what the thinner qualitative signal only suggested |
| Hindi | **Measured: flat at 0 on all 4 anchor tasks** for both Hinglish and Devanagari probes (16 terms) against a dominant English line; GSC India shows zero Hinglish leakage | None — English wins every task in India | Split: Adobe and Smallpdf ship real Devanagari pages; Canva and a "Pi7" competitor only exist as Google-Translate proxy URLs, i.e. no native page at all | Yes | **No** — measured, not inferred; closes SEO-27's Hindi question |
| Filipino/Tagalog | Not measured | PDF-to-JPG / general convert | Adobe and PDFSimpli ship pages, but titles code-switch heavily ("Paano Mag-convert ng PDF sa JPG" — Filipino verb, English object) | No | **Later** — real demand looks code-switched rather than absent; a Tagalog page would itself be a mixed-register page, which is unlike every other language here and needs a native call, not a volume number |
| Urdu | Not measured; romanized-query search surfaced only Hindi-Devanagari competitor pages, no Urdu-script results | Unclear | No evidence of a dedicated Urdu tool page from any major competitor found this pass | Yes | **No** for now — thinnest evidence of any language checked; revisit if Shlomi's Pakistan GSC country filter (source 3 of the ticket) shows anything |
| Bengali | Not measured; romanized-query search returned zero Bengali-specific results at all | Unclear | No competitor Bengali tool page surfaced | Yes | **No** — weakest signal of the set, though the query wasn't tried in native script, which is a real gap in this pass, not a confirmed absence |
| Arabic | Not measured directly | Sign and Compress both have deep native ecosystems | Every major (Adobe, Smallpdf, iLovePDF, PDF24, Sejda, LightPDF) ships a full native Arabic page for both tools | Yes | **Pilot-worthy on demand, but see D below** — RTL/font-support is not something anyone is marketing, same pattern as Hebrew |

## A. Language share

Not independently measurable from this environment — Google Trends' comparison UI and Keyword Planner
are both inaccessible (JS-rendered / authenticated; one direct fetch attempt on Trends returned an
empty app shell, confirming rather than working around the limitation). **Update 2026-09-11: Shlomi ran
the comparisons himself and sent screenshots** (region-locked, past 12 months, Web Search category) —
this closes the gap for Hebrew and Indonesian below. Malay is still pending, in progress.

- **iLovePDF**, via Similarweb (fetched via search, not logged into the tool): Indonesia is **22.2%** of
  `ilovepdf.com`'s traffic (behind India at 22.2% also cited, so effectively tied for largest), and its
  `.com.cn` property separately shows Indonesia at 22.89%, Malaysia at 3.1%. That is not a query-level
  Trends comparison, but it is a real, cited number that the market for this category in Indonesian is
  large — consistent with the ticket's existing GSC finding (`gabung pdf free online`, `pdf combine
  gratis` already leaking through on an English-only page). Source:
  [Similarweb: ilovepdf.com](https://www.similarweb.com/website/ilovepdf.com/),
  [Similarweb: ilovepdf.com.cn](https://www.similarweb.com/website/ilovepdf.com.cn/).

### Google Trends, read from Shlomi's screenshots (Israel and Indonesia, past 12 months)

**Hebrew (Israel).** Read off the "Average" bars, native term against English term, all four anchor
tasks:

| Task | Hebrew term | English term | Read |
| --- | --- | --- | --- |
| Compress | `כיווץ קובץ pdf` | `compress pdf` | Near-zero baseline, sporadic spikes to ~25-45 roughly every 6-8 weeks; average maybe 5-10% of the English line. A four-way comparison adding `דחיסת קובץ pdf` and `חינם דחיסת pdf` shows both other Hebrew synonyms at the same low, spiky level — no Hebrew phrasing for compress clears meaningful volume against English, confirming the ticket's existing SERP-side read (thin competition, but also thin raw demand by this measure). |
| Merge | `מיזוג קבצי pdf` | `merge pdf` | The strongest Hebrew showing of the four: a **steady**, non-spiky line at roughly a third of the English line's height throughout the whole 12 months, not an intermittent pulse like compress. Real, sustained demand, just smaller. |
| Sign | `חתימה על pdf` | `sign pdf` | Weakest of the four — the Hebrew line is essentially flat at zero for the entire 12 months, with one small uptick only in the last few weeks of the window. |
| PDF to JPG | `pdf ל jpg` | `pdf to jpg` | Small, intermittent spikes (~15-20) against a steady English line around 65-100 — similar pattern to compress. |

**Read against the decision rule:** none of Hebrew's four anchor tasks show a native term at a share
"comparable" to English by the letter of criterion 1 — merge comes closest (steady ~1/3) and sign comes
closest to zero. This matches the ticket's own framing that for Hebrew this number is "informative, not
decisive" (criterion 2 and 3 already carried the decision). It also explains *why* the SERP is thin
(freepdfconvert/AvePDF holding page one): raw query volume for the Hebrew phrasing is real but small,
which is consistent with a market few competitors have bothered building deep, reviewed pages for.

**Indonesian.** Same read, same four tasks:

| Task | Indonesian term | English term | Read |
| --- | --- | --- | --- |
| Compress | `kompres pdf` | `compress pdf` | **Near parity, and the Indonesian line is often at or above the English one** — the two track each other closely for the full 12 months, with `kompres pdf`'s average bar reading slightly taller than `compress pdf`'s. This is the clearest "comparable share" result in the whole report. |
| Merge | `gabungkan pdf` | `merge pdf` | English leads (~80 vs ~43 on the average bars), but Indonesian is a real, steady ~half, not a spike pattern. |
| Sign | `tanda tangan pdf` | `sign pdf` | Close to parity for most of the window (both in the 25-50 band), with `sign pdf` spiking above it twice; Indonesian is competitive, not marginal. |
| PDF to JPG | `pdf ke jpg` | `pdf to jpg` | The one weak spot, same as Hebrew's pattern — Indonesian holds a small but steady ~18-25% share against a dominant English line. |

**Read against the decision rule:** Indonesian clears criterion 1 outright — compress and sign are at or
near parity, which is two of the four anchor tasks the rule asks for. This is the strongest evidence in
the report for treating Indonesian as the pilot candidate, now backed by an actual Trends comparison
rather than the indirect Similarweb signal alone.

**Malay.** Shlomi ran the same four comparisons (`mampatkan pdf`, `gabungkan pdf`, `tandatangan pdf`,
`tukar pdf ke jpg`, each against its English counterpart, geo=MY). **All four came back flat at 0** —
Google Trends registered no measurable volume for any of the Malay terms over the past 12 months, while
the English terms held their usual line. This is a cleaner, more decisive result than Hebrew's (which at
least showed a real, if small, signal on merge): for Malay, on this pass, there is no in-language search
behavior for any of the four anchor tasks large enough for Trends to plot at all. It matches the weaker
qualitative read from section B/C below (Malay blogs recommending English tool brands by name, `pdf ke
jpg` finding zero native competitor pages) rather than contradicting it, and it settles the "later vs.
no" question the earlier draft of this section left open: **no**, not a candidate on this evidence.
Every `/ms/` page the majors built (section B/C) looks like the cheap-to-localize case the brief warned
about — competitors translating because it costs them nothing, not because Malay-language demand asked
for it.

**Hindi (India).** Shlomi ran all four anchor tasks with five terms per chart (Trends' maximum): the
English term, two Hinglish (Latin-script Hindi) variants, and two Devanagari variants, so one chart
answers both "do Indians type this in Hindi script?" and "do they type it in Hinglish?" against the
English baseline. Phrasing was lifted from real pages (Smallpdf's `पीडीएफ कम्प्रेस करे`, PDF24/SodaPDF's
`PDF मर्ज करें`, iLovePDF/PDF24's `PDF पर हस्ताक्षर करें`, YouTube titles for `pdf merge kaise kare` and
`pdf me sign kaise kare`), except PDF-to-JPG, where no Hindi-language page exists to lift from.

| Task | English | Hinglish probes | Devanagari probes | Read |
| --- | --- | --- | --- | --- |
| Compress | `compress pdf` at 55-100 all year | `pdf compress kaise kare`, `pdf ka size kam` | `पीडीएफ कम्प्रेस`, `पीडीएफ साइज कम` | **All four non-English lines flat at 0.** |
| Merge | `merge pdf` at 60-100 | `pdf merge kaise kare` | `pdf मर्ज`, `पीडीएफ मर्ज`, `pdf जोड़ें` | **All four flat at 0.** |
| Sign | `sign pdf` at 35-100 | `pdf sign kaise kare`, `pdf me sign kaise kare` | `pdf पर हस्ताक्षर`, `pdf साइन` | **All four flat at 0.** |
| PDF to JPG | `pdf to jpg` at 65-100 | `pdf to jpg kaise kare`, `pdf ko jpg kaise banaye` | `पीडीएफ को जेपीजी`, `pdf से jpg` | **All four flat at 0** (phrasing unverified for this task, so weakest of the four). |

**Read against the decision rule:** the Malay pattern, not the Hebrew one — sixteen non-English probes
across four tasks, none registering. One caveat on the Hinglish side: Trends matches search *terms*, so a
four-word Hinglish phrase is structurally disadvantaged against a two-word English one, and a flat line
there is weaker evidence than a flat Devanagari line. Two things close that gap. The two-word probes
(`pdf ka size kam`, `pdf मर्ज`, `pdf साइन`) are also flat, and the GSC India pull (below) shows **zero
Hinglish queries reaching an English page**, where Indonesia's filter did leak `gabung pdf free
online`. Hindi's "no" is now measured on two independent instruments rather than inferred from
tutorial titles.

**GSC, Country = India, 3 months, Queries tab (Shlomi, 2026-09-11).** All English, no exceptions, and
no Hinglish (`kaise`, `ka`, `ko`) anywhere in the list. Two clusters: **blur/redact** (`pdf blur online`
35 impressions / 3 clicks, `blur pdf` 49 / 1, `blur pdf online` 49 / 1, `blur text in pdf` 24 / 0, plus a
long tail of `blackout`/`pixelate` variants) and **compress-to-a-portal-limit** (`file compressor to
100kb` 95 / 4, `reduce file size to 100kb` 41 / 0, `compress pdf to 100kb free` 17 / 0, `compress pdf
110 kb` 9 / 0, and a dozen more 100kb/110kb phrasings). India is where the size-limit query lives -
this is SEO-17's audience - and it is asked entirely in English.

No Trends number exists yet for Filipino, Urdu, Bengali, or Arabic; those four weren't measured this
way at all.

## B/C. Phrasing and incumbents, by language

### Hebrew

Already covered by the ticket's own evidence section (2026-09-11 screenshots): `כיווץ`/`דחיסה`
synonym gap on compress, uniform `מיזוג` vocabulary on merge, edit/fill intent split on forms. This
pass adds one query, the differentiator check (section D below), and confirms Hebrew is **not** on
Google's translated-results list — the strongest structural argument for Hebrew independent of volume.

### Indonesian

Every major competitor ships a full native `/id/` page for compress, merge, and sign, and the copy
reads as natively written, not machine-translated:

- `smallpdf.com/id/mengompres-pdf` — H1 "Kompres PDF Gratis"; idiomatic phrasing ("Seret dan lepas" for
  drag-and-drop); claims "Kurangi ukuran PDF hingga 99%", auto-delete after 1 hour, ISO 27001 — a
  cloud-processing privacy story, not an on-device one.
- `tools.pdf24.org/id/kompres-pdf` — H1 "Kompres PDF"; native idiom ("Jebakan langganan" for
  "subscription traps"); explicit server location claim ("Server berlokasi di Jerman") — i.e. PDF24
  is honest that it uploads to Germany, which is a real opening for an on-device claim if Indonesian
  searchers weigh it, untested here.
- Sign-specific: a genuine local player, **Mekari Sign**, exists alongside the generalist tools and
  markets itself on Indonesian legal compliance, not just as a translated generic tool. One aggregated
  summary (not independently re-verified) described a competitor claiming local, on-device processing
  for signing already — this needs a direct re-check before being used as a claim in a ticket, flagged
  here as unverified rather than dropped.

Phrasing observed: `kompres pdf` (not a second synonym set the way Hebrew has `כיווץ`/`דחיסה`/`הקטנה`),
`gabungkan pdf` / `gabung pdf` (both used, `gabungkan` on the majors' own titles, `gabung` in casual
queries — matches the ticket's own GSC finding of `gabung pdf free online`), `tanda tangan pdf`. "PDF"
itself stays Latin/untransliterated in every case, as expected. Modifier `gratis` is near-universal;
`online` is kept as a loanword rather than translated.

**Update 2026-09-11 — real SERPs (Shlomi's screenshots, `hl=id&gl=ID`), all four anchor tasks:**

| Query | Top five | Read |
| --- | --- | --- |
| `kompres pdf` | iLovePDF, Smallpdf (4.5★, 511,392 reviews), **Telkom University** (`stage-pdf.telkomuniversity.ac.id`), Adobe (4.6★, 281,831 reviews), PDF24 | An `.ac.id` university domain holding a page-one slot for a commercial-intent query is unusual and worth noting, but doesn't change the competitive picture: every other result is a mature global player. |
| `gabungkan pdf` | iLovePDF, Smallpdf (4.8★, 703,341 reviews), PDF24 (5.0★, 24,054), PrintFriendly, CamScanner | CamScanner (a mobile scanning app) also competing here is new information — a different incumbent shape than the pure-PDF-tool field. |
| `tanda tangan pdf` | iLovePDF, PDF24 (4.9★, 3,251), Smallpdf (4.6★, 35,846), PDFgear (4.9★, 10,143), a Google Play app listing | |
| `pdf ke jpg` | iLovePDF, Smallpdf (4.6★, 323,280 reviews), Canva, PDF24 (5.0★, 4,925), Adobe | |

**This is the opposite competitive shape from Hebrew.** Hebrew's top five (existing ticket evidence)
were thin: two small upload sites (freepdfconvert, AvePDF) holding page one alongside the majors, no
review data shown. Indonesian's top five, on all four queries, are **every major global player**
(iLovePDF, Smallpdf, Adobe, PDF24, Canva), each with a fully native-Indonesian title and snippet, and
most carrying `AggregateRating` star snippets with review counts in the hundreds of thousands
(Smallpdf: 511k-703k reviews across these four queries alone). Nothing in these five results, on any of
the four queries, reads as mixed-language or machine-translated. **Criterion 2, read against what the
SERP actually shows rather than the earlier direct-fetch sample, is not clearly met.** The two openings
identified from direct page fetches still stand — PDF24 names its own German server (a cloud-vs-device
opening) and no result claims on-device processing — but "a weak incumbent to beat" is not an accurate
description of this SERP; it is the same `AggregateRating` pattern this project already declined to
adopt for Hebrew (SEO-04), now at a much larger scale (hundreds of thousands of reviews, not thousands).
Recommend re-reading this against criterion 2 explicitly before LOC-04 commits: the case for Indonesian
now rests on criterion 1 (which cleared cleanly) and the honest device-privacy gap, not on facing a weak
field.

**Verdict: pilot, but on criterion 1 and the device-privacy gap — not on a weak incumbent.** Criterion 2
as originally written ("at least one incumbent is mixed-language or machine-translated") does not hold
up against the real SERP: every top-five result across all four queries is native-quality, and most
carry large review counts. The market-size case (criterion 1, cleared) and the honest gap (no incumbent
claims on-device processing) still argue for a pilot, but going in should not assume a thin field the
way Hebrew's is.

### Malay

Every major competitor also ships a `/ms/` page for sign, compress, and convert, but two independent
signals suggest the underlying organic demand is thinner than Indonesian's:

- A Malaysian consumer tech blog (`sinarbestari.sinarharian.com.my`) and two "how do I" sites
  (`ecentral.my`, `wiser.my`) discussing PDF size problems all **recommend iLovePDF/Smallpdf by name in
  English**, rather than pointing to a Malay-native tool page — i.e. real Malay-speaking writers,
  writing for a Malay-speaking audience, reach for the English brand and (implicitly) the English or
  generic tool.
- `"pdf ke jpg"` / `"tukar pdf ke jpg"` (the Malay convert phrasing) returned **zero** Malay-specific
  competitor pages in this pass — every result was an English or Indonesian page. Compare this against
  Indonesian's `pdf ke jpg`-equivalent queries, which surfaced native pages every time.
- `"tandatangan pdf"` (sign), by contrast, did surface a full set of native `/ms/` and `/my_ms/` pages —
  so the signal is task-dependent, not uniformly absent.

**Update 2026-09-11 — real SERPs (Shlomi's screenshots, `hl=ms&gl=MY`), all four anchor tasks:**

| Query | Top results | Read |
| --- | --- | --- |
| `mampatkan pdf` | iLovePDF, Smallpdf (ms-MY), Adobe, freepdfconvert, rightpdf.com, a Google Play app, Xodo, pdf2go.com, compress2go, a Chrome extension | Full native ecosystem, no AI Overview shown, **no star-rating snippet on any result** — unlike every Indonesian query, which carried `AggregateRating` counts in the hundreds of thousands. |
| `gabungkan pdf` | iLovePDF (native), freepdfconvert, Smallpdf (ms-MY), Xodo, **an AI Overview** ("Anda boleh menggabungkan fail PDF dengan pantas menggunakan perkhidmatan percuma seperti iLovePDF atau Smallpdf"), Adobe, pdf2go, EasePDF, and a **second iLovePDF result lower down marked "Terjemahkan halaman ini"** (translate this page) whose snippet reads "Layanan gratis" — Indonesian, not Malay. | Google is reaching into iLovePDF's *Indonesian* page as a fallback result on a Malaysia SERP and offering to translate it. That is a direct, visible sign that Malay-specific content is thin enough for Google to blur the Malay/Indonesian boundary rather than that competitors haven't tried. |
| `tandatangan pdf` | iLovePDF (native), three video results (YouTube, TikTok, YouTube — real Malay-language video content responding to this exact task), Smallpdf (ms-MY), Adobe, pdf2go, an AI Overview, and **PDF24's result marked "Sign PDF - 100% free & online" with "Terjemahkan halaman ini"** — i.e. PDF24 has no Malay-specific sign page indexed here; Google is offering to translate its English one. | Same fallback pattern as merge, on a different competitor. Video results are a genuine engagement signal, but neither of the two things that would prove deep, monetizable demand (reviews, a complete native competitor set) is present. |
| `tukar pdf ke jpg` | iLovePDF, Smallpdf (ms-MY), an AI Overview, Adobe, freepdfconvert, Xodo, DeftPDF, a Google Play app, pdf2go | Fully native this time, no translate-page fallback visible — this is the one query where Malay coverage looks complete. |

**This sharpens rather than reverses the Trends-based "no."** Two things stand out against Indonesian's
SERPs. First, **zero `AggregateRating` snippets across all four Malay queries** — Indonesian carried
star ratings with hundreds of thousands of reviews on almost every result; Malay carries none, on any
query. Review count is a real proxy for transaction/engagement volume, and its total absence here is a
second, independent signal pointing the same direction as the Trends zero. Second, **on two of the four
queries Google itself doesn't have a matching native page to show** and falls back to a differently
localized page (Indonesian) or the English original with a translate offer — undercutting the earlier
light-pass framing that "every major built the `/ms/` page anyway": that's true of the brand's site
existing, not of every task having complete Malay-specific coverage. The AI Overviews and video results
show *some* real informational demand exists (people are asking "how do I sign a PDF" in Malay), but
none of the signals that would justify a reviewed page investment — comparable Trends volume, review
counts, complete native competitor coverage — are present. **Verdict: no**, now on two independent
measures rather than Trends alone.

### Hindi

This is the one language where the qualitative signal was unusually consistent and matches the ticket's
stated expectation exactly:

- Every "how do I compress a PDF" query surfaced **YouTube tutorial titles and Hindi blog titles typed
  in Latin script**: "PDF Size 100KB Se Kam Kaise Kare", "pdf ka size kaise kam kare", "PDF का size
  100% फ़्री में छोटा करें" (this last one is Adobe's own H1, and it's itself half Latin: "PDF" and
  "size" stay untransliterated inside a Devanagari sentence — a mixed-register pattern, not two
  separate registers).
- Two competitors — Canva and a tool called "pi7" — have **no native Hindi page at all**; the only
  Hindi-language result found for them was a `translate.google.com/translate?u=...` proxy URL, meaning
  Google is auto-translating their English page for a Hindi searcher rather than the competitor having
  built one. That is the translated-results mechanism from the top of this report, observed directly
  rather than just cited from documentation.
- Adobe (`adobe.com/in_hi/...`) and Smallpdf (`smallpdf.com/hi/...`) did build real Devanagari pages, so
  it isn't that nobody bothers — but the Adobe H1 above shows even a fully-invested localization keeps
  "PDF" and "size" in English inside the sentence, which is exactly the code-switched register the brief
  asked about, not a clean Devanagari phrase competing against a clean English one.

**Verdict: no, now measured.** The qualitative read above (tool-shaped queries typed in Hinglish or
English, not Devanagari) held up against real instruments: section A's four Trends charts show every
Hinglish and Devanagari probe flat at 0 against a dominant English line, and the GSC India filter shows
zero Hinglish leakage onto our English pages. A Devanagari page would target a register people don't
type for this task, and even the Hinglish register doesn't register at Trends scale. This closes
SEO-27's Hindi question with evidence rather than inference.

### Filipino/Tagalog (light pass)

`"pdf sa jpg"` / `"pag-compress ng pdf"` surfaced Adobe's `ph_fil` page ("Paano Mag-convert ng PDF sa
JPG" — a Filipino verb phrase wrapped around the English object "PDF sa JPG") and PDFSimpli's Filipino
page ("I-convert PDF sa JPG sa ilang Saglit", "LIBRENG PDF Editor Online" — also code-switched, "LIBRENG"
Filipino for "free" next to "PDF Editor Online" untranslated). Every other result was plain English.
**Read:** real demand likely exists but in a code-switched register close to English, which fits how
Filipino web content generally reads. Not on Google's translated-results list, so the "Google already
bridges this" argument doesn't apply here either. **Verdict: later** — worth a real screenshot pass
before either building or dropping.

### Urdu (light pass)

Romanized-script queries ("pdf ka size kam", "pdf compress karein") returned **only Hindi-Devanagari
competitor pages** (Adobe `in_hi`, Smallpdf `hi`) plus generic English tools — no Urdu-script result and
no competitor page targeting Pakistan specifically surfaced. This pass could not tell whether that's
because Urdu-script queries are genuinely rare for this task, or because a Latin/romanized query (the
only kind tried here) doesn't reach them the way it would reach Hinglish. **Verdict: no evidence found
either way strong enough to call it** — recommend Shlomi's GSC Pakistan country filter (source 3 of the
ticket's method) as the next actual signal, since this pass's web search couldn't target Pakistan or
Urdu script directly.

### Bengali (light pass)

Both romanized attempts ("pdf compress korbo", "pdf size komano") returned **zero Bengali-specific
results** — every link was a generic English tool. This is the weakest signal in the report, but it
carries the same caveat as Urdu: the query was romanized, not native Bengali script, so this is "not
checked" more than "confirmed absent." **Verdict: no evidence either way; lowest priority to re-check.**

### Arabic (light pass)

Both compress and sign queries, run in Arabic script this time, surfaced a **full native ecosystem**:
Adobe (`mena_ar`), Smallpdf (`ar`), iLovePDF (`ar`), PDF24 (`ar`), Sejda (`ar`), LightPDF (`ar`) all have
dedicated Arabic pages for both tasks, reading as native Arabic in the search-result titles themselves
(e.g. "ضغط ملفات PDF مجانًا - تقليل حجم ملف PDF عبر الإنترنت"). This is a deep, mature market —
comparable to or larger than Hebrew's — and, per the top-of-report finding, Arabic **is** on Google's
translated-results list, so an English pdkef page already reaches some fraction of these searchers via
machine translation today; a native Arabic page's marginal gain is smaller than the raw competitor count
suggests.

## D. The differentiator check (Hebrew and Arabic)

Neither language's SERP, on the queries tried (`חתימה על pdf בעברית` / `מילוי טופס pdf בעברית` for
Hebrew; `توقيع pdf بالعربي` / `التوقيع على pdf` for Arabic), surfaced a single result mentioning
Hebrew/Arabic-specific font support, RTL correctness, or any language-capability claim at all. Every
result was a generic "how to sign a PDF" page in that language. This matches the existing memory note
that the Sign tool's RTL/font advantage is "a strongest differentiator... no language-intent queries
exist in GSC yet" — this pass adds that **no competitor is marketing it either**, so there is no
existing search behavior asking for it by name. **Conclusion unchanged from before this report: the RTL
font-shaping work is a real product asset, but it is not yet something to lead SERP copy with, because
nobody is searching for it.** It can still appear as a secondary trust signal on the page (a screenshot
or one line noting correct RTL layout) rather than the headline.

## E. Draft SERP text

Per the brief's own rule, drafts are provided only where this pass found real in-language demand:
Indonesian (pilot-supported) and Hebrew (already decided). Malay, Filipino, Hindi, Urdu, Bengali, and
Arabic are withheld — Hindi and the four light-pass languages didn't clear the bar this pass, and Malay
and Filipino need the real SERP check before copy is worth drafting. **All strings below are drafts for
native review; none are publishable as returned**, per the brief's rule and this project's standing
"no machine-translated copy" rule.

### Indonesian — Compress (`/id/kompres-pdf/`, draft slug)

- `<title>` (draft, needs native count-check against 60 chars): `Kompres PDF Online Gratis, Tanpa Upload`
- Meta description (draft): `Kompres file PDF langsung di browser Anda. File tidak pernah diunggah ke
  server, gratis tanpa akun, dan tetap berfungsi offline setelah dimuat.`
- H1 (draft): `Kompres PDF, Gratis dan Tanpa Upload`
- Lead fact: on-device processing — this is the one honest claim none of the majors made outright
  (PDF24 says the opposite: it names its own server location).

### Indonesian — Sign (`/id/tanda-tangani-pdf/`, draft slug)

- `<title>` (draft): `Tanda Tangan PDF Online, File Tetap di Perangkat Anda`
- Meta description (draft): `Isi dan tanda tangani PDF langsung di browser. Gratis, tanpa akun, dan file
  Anda tidak pernah meninggalkan perangkat.`
- H1 (draft): `Tanda Tangani PDF, Gratis Tanpa Akun`

### Hebrew — Compress (`/he/כיווץ-pdf/` or ASCII slug, draft)

- `<title>` (draft): `כיווץ PDF בחינם, בלי להעלות לשרת`
- Meta description (draft): `כווצו קובצי PDF ישירות בדפדפן. הקובץ לא עוזב את המכשיר, בחינם וללא
  הרשמה, ופועל גם ללא אינטרנט.`
- H1 (draft): `כיווץ PDF, בחינם ובלי להעלות אותו לשרת`
- Note: use `כיווץ` (the typed word per the ticket's own SERP evidence), not `דחיסה` (what every
  incumbent's title uses) — this is the one open slot the ticket already identified.

## What Shlomi's screenshots should check next

Mirroring the Hebrew pattern already in the ticket (`hl`/`gl` set, desktop, top five + AI Overview):

- **Indonesian** (already flagged in the ticket, repeated here for completeness): `kompres pdf`,
  `gabungkan pdf`, `tanda tangan pdf`, `pdf ke jpg`.
- **Malay** (new, to settle "later" vs "no"): `mampatkan pdf`, `gabungkan pdf` (Malay reuses the
  Indonesian spelling here per the fetched competitor pages), `tandatangan pdf`, `tukar pdf ke jpg`.
- **Google Trends**, region-locked, native term vs. English term, for the four anchor tasks: Hebrew
  (Israel), Indonesian (Indonesia), Malay (Malaysia) — this closes the biggest gap in section A above,
  since this environment could not reach Trends' comparison UI at all.

## Sources consulted

- [Google Search Central — Translated results](https://developers.google.com/search/docs/appearance/translated-results) (fetched directly)
- [Similarweb — ilovepdf.com](https://www.similarweb.com/website/ilovepdf.com/), [ilovepdf.com.cn](https://www.similarweb.com/website/ilovepdf.com.cn/)
- Direct fetches: `smallpdf.com/id/mengompres-pdf`, `tools.pdf24.org/id/kompres-pdf`
- Search-tool results (not country/language-targeted; used only to surface which competitor URLs
  exist and how their titles read) for: `kompres pdf`, `gabungkan pdf`/`gabung pdf`, `tanda tangan pdf`
  (Indonesian); `mampatkan pdf`/`mampat pdf`, `tandatangan pdf`, `pdf ke jpg` (Malay); `pdf ka size kam
  kaise kare` and variants (Hindi); `pdf sa jpg`/`pag-compress ng pdf` (Filipino); `pdf ka size kam`/`pdf
  compress karein` (Urdu, romanized only); `pdf compress korbo`/`pdf size komano` (Bengali, romanized
  only); `ضغط ملف pdf مجانا`, `توقيع pdf بالعربي` (Arabic, native script); `חתימה על pdf בעברית` (Hebrew,
  native script, differentiator check only).
- One attempted fetch of Google Trends' comparison UI, which returned an empty JS shell — recorded as
  "not checked" rather than guessed, per the brief's own rule.
