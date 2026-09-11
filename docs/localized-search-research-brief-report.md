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
| Hebrew | Not measured (Trends/Keyword Planner inaccessible here) | Sign / fill-form | 5 localized incumbents per query, all upload-site translated copy, none native-quality per ticket's existing screenshots | **No** | Decided already (ticket): pilot, LOC-02/03 underway |
| Indonesian | Not measured directly; iLovePDF gets 22.2% of its global traffic from Indonesia (cited source below) — strong indirect signal | Sign (Mekari Sign is an Indonesia-only native competitor) / Compress | Native-quality on the majors (Smallpdf, PDF24); at least one aggregator claims on-device processing already (needs verification) | Yes | **Pilot** — evidence in this pass supports the ticket's expectation |
| Malay | Not measured; every major has a `/ms/` page but a Malaysian consumer blog (ecentral.my, wiser.my) recommends the *English* tools rather than a Malay-native one, and "pdf ke jpg" in Malay returned zero Malay-specific results | Sign (richer native ecosystem than compress/convert) | Mixed: sign pages read native, but organic demand signal for convert/compress in Malay looks thin | No | **Later** — thinner than Indonesian on this pass; worth one real SERP check before deciding |
| Hindi | Not measured; strong qualitative signal that real typed queries are Hinglish/Latin script, not Devanagari (YouTube titles, tutorial-site titles) | Compress (only because it's the most-searched task generally, not because Hindi-script demand is proven) | Split: Adobe and Smallpdf ship real Devanagari pages; Canva and a "Pi7" competitor only exist as Google-Translate proxy URLs, i.e. no native page at all | Yes | **No** (matches the ticket's stated expectation) — the Hinglish pattern held up |
| Filipino/Tagalog | Not measured | PDF-to-JPG / general convert | Adobe and PDFSimpli ship pages, but titles code-switch heavily ("Paano Mag-convert ng PDF sa JPG" — Filipino verb, English object) | No | **Later** — real demand looks code-switched rather than absent; a Tagalog page would itself be a mixed-register page, which is unlike every other language here and needs a native call, not a volume number |
| Urdu | Not measured; romanized-query search surfaced only Hindi-Devanagari competitor pages, no Urdu-script results | Unclear | No evidence of a dedicated Urdu tool page from any major competitor found this pass | Yes | **No** for now — thinnest evidence of any language checked; revisit if Shlomi's Pakistan GSC country filter (source 3 of the ticket) shows anything |
| Bengali | Not measured; romanized-query search returned zero Bengali-specific results at all | Unclear | No competitor Bengali tool page surfaced | Yes | **No** — weakest signal of the set, though the query wasn't tried in native script, which is a real gap in this pass, not a confirmed absence |
| Arabic | Not measured directly | Sign and Compress both have deep native ecosystems | Every major (Adobe, Smallpdf, iLovePDF, PDF24, Sejda, LightPDF) ships a full native Arabic page for both tools | Yes | **Pilot-worthy on demand, but see D below** — RTL/font-support is not something anyone is marketing, same pattern as Hebrew |

## A. Language share

Not independently measurable from this environment — Google Trends' comparison UI and Keyword Planner
are both inaccessible (JS-rendered / authenticated; one direct fetch attempt on Trends returned an
empty app shell, confirming rather than working around the limitation). The one indirect volume signal
obtained:

- **iLovePDF**, via Similarweb (fetched via search, not logged into the tool): Indonesia is **22.2%** of
  `ilovepdf.com`'s traffic (behind India at 22.2% also cited, so effectively tied for largest), and its
  `.com.cn` property separately shows Indonesia at 22.89%, Malaysia at 3.1%. That is not a query-level
  Trends comparison, but it is a real, cited number that the market for this category in Indonesian is
  large — consistent with the ticket's existing GSC finding (`gabung pdf free online`, `pdf combine
  gratis` already leaking through on an English-only page). Source:
  [Similarweb: ilovepdf.com](https://www.similarweb.com/website/ilovepdf.com/),
  [Similarweb: ilovepdf.com.cn](https://www.similarweb.com/website/ilovepdf.com.cn/).
- No equivalent number found for Malay, Hindi, Filipino, Urdu, Bengali, or Arabic in this pass.

**This section is the biggest gap in this report and the one Shlomi's tool access can close directly.**
Recommended next step: run the four anchor tasks (compress, merge, sign, pdf-to-jpg) through Google
Trends' own comparison UI, native-language term vs. English term, region set per country, for Hebrew,
Indonesian, and Malay specifically — those three are the ones this report's other evidence can't settle
on its own (Hindi and the four light-pass languages already have a directional answer from B/C below).

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

**Verdict: pilot, matching the ticket's expectation.** Criterion 2 (a mixed/machine incumbent to beat)
is only partly met — the majors' Indonesian pages are good, not weak — but the *cloud-vs-device* framing
is open (PDF24 says outright it uploads to a German server) and the market size signal (iLovePDF's
~22% Indonesia traffic share) is real and cited.

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

**Verdict: later, not no.** This is thinner than Indonesian on every signal gathered here, but "every
major built the page anyway" (cheap-to-translate, as the brief itself notes competitors do regardless
of demand) is not itself evidence of absence. Malay and Filipino are also both missing from Google's
translated-results list, which is the one structural argument for revisiting this with a real Trends
check before settling on "later" for good.

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

**Verdict: no, as the ticket expected**, closing SEO-27's Hindi question with this pass's evidence: real
tool-shaped queries are typed in Hinglish/Latin script or plain English, not Devanagari, and building a
Devanagari page would target a register people don't appear to type in for this task.

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
