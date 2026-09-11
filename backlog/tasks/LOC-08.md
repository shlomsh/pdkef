---
id: "LOC-08"
title: "Tamil and Telugu demand check: reopening LOC-07 Part 2 for India's other major languages"
status: "done"
priority: "P3"
epic: "localized-search"
phase: "later"
depends_on: ["LOC-07"]
legacy_state: "Done 2026-09-12"
---

# LOC-08 · Tamil and Telugu demand check: reopening LOC-07 Part 2 for India's other major languages

## Scope and acceptance

**Why this exists.** [LOC-07](LOC-07.md) closed the Indonesian question negative and declined to open
Part 2 (the six untouched Indian languages - Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam) on
the reasoning that a harder-to-verify language isn't worth measuring once the clearest-demand one
already failed on competitive field. Shlomi's read: India is this domain's single best-converting
country (36 clicks / 813 impressions at position 12.66, per the findings doc) and "we have many users
from there" - worth checking its other languages directly rather than closing the door on the strength
of Indonesian's result alone. **This is a different question from LOC-01's Hindi measurement**, which
is closed and not being reopened: Hindi came back flat at zero on 16 probes across two scripts, with
zero Hinglish leakage in GSC despite India being the top country. That result stands. Tamil, Telugu,
Marathi, Gujarati, Kannada and Malayalam were never tested at all - LOC-01 named them and stopped.

**Method.** Same as [LOC-01](LOC-01.md): verify phrasing off competitors' own localized pages first
(this environment can fetch specific URLs directly, just not real Google Trends or `hl`/`gl` SERPs),
then hand Shlomi ready-to-click Trends comparison links (five terms per chart: English, two
romanized/code-switched, two native-script) and SERP links for him to screenshot from his own browser.
One language at a time, Tamil and Telugu first by speaker count, per LOC-07's instruction.

**Decision rule.** Unchanged from LOC-01: a language goes to a pilot when the native phrasing carries
at least a comparable share to English in Trends for two of the four anchor tasks, at least one
incumbent on the top phrasing is mixed-language or machine-translated, and a native reviewer is
available. LOC-07's finding on Indonesian stands as a warning even where this rule clears: passing it
does not by itself justify a page if the domain hasn't shown it can rank against whatever field is
actually on the SERP - re-check position 36/`/merge/` logic before greenlighting a pilot here too.

## Incumbent check, done 2026-09-11 (direct URL fetches, not `hl`/`gl` SERPs - see caveat below)

Checked all four anchor tools (`compress`, `merge`, `sign`, `pdf to jpg`) at each major's own `/ta/`
and `/te/` locale routes, by HTTP status, `<html lang>` attribute, and rendered `<title>`/`<h1>` - not
by ranking position, which this environment cannot fetch (same limitation as LOC-01's report).

| Competitor | Tamil (`/ta/`) | Telugu (`/te/`) |
| --- | --- | --- |
| **PDF24** | `200`, but `lang="en"` and English title/H1 on all four tools - the route exists and resolves, but silently falls back to English. Not a real Tamil page. | **Real.** `200`, `lang="te"`, native titles on all four: compress "PDF ను కుదించు", merge "PDF విలీనం", sign "PDF పై సంతకం చేయండి", pdf-to-jpg "PDF ను JPG గా మార్చండి". |
| **Sejda** | `200`, `lang="ta"` tag present, but the rendered title/H1 ("Compress PDF online" / "Compress PDF") and the entire page body are English - checked by scanning for non-ASCII characters in the raw HTML and finding none. A mislabeled route, not real Tamil content. Its own language switcher lists Hindi, Hebrew, Arabic, Thai, Russian and others but not Tamil at all. | Not checked (Sejda's Tamil result already showed no real localization; Telugu was deprioritized in favor of PDF24's confirmed real page). |
| **Smallpdf** | `404` on `/ta/compress-pdf`. | `404` on `/te/compress-pdf`. |
| **iLovePDF** | `404` on `/ta/compress_pdf`. | `404` on `/te/compress_pdf`. |
| **Canva** | `403` (bot-blocked; not informative either way). | `403` (bot-blocked). |
| **Adobe** | Connection blocked from this environment (`000`); not checked. | Not checked. |

**Read.** Telugu has one real native incumbent (PDF24) and no others found; Tamil has **zero** real
native incumbents among the majors checked - PDF24 and Sejda both serve English at Tamil-tagged URLs
rather than translating. This is a materially different starting shape from every language LOC-01
measured: Hebrew, Indonesian, Malay and Hindi all had at least PDF24 (and usually several others) with
a genuine localized page to evaluate for quality. Here the honest reading is "no incumbent has bothered
to build a Tamil page at all," which could mean thin demand (consistent with Hindi's flat result) or an
open field (no one to out-quality), and Trends is what tells the two apart.

**A general-web pass for Tamil phrasing** (since no competitor page exists to lift terms from) found
real, if thin, Tamil-language discourse about PDF tools, and it code-switches rather than using a
native verb: "PDF-ஐ compress செய்வதற்கான பல வழிகள் உள்ளன" ("there are many ways to compress a PDF") -
"compress" stays in Latin script inside a Tamil sentence, the same pattern LOC-01 found for Filipino
(Filipino verb + English object). One Tamil-specific tool, `pdftamil.in`, surfaced in search results
advertising "PDF Compress, Merge, Split இலவசம்" (`இலவசம்` = free; compress/merge/split themselves stay
English) but returned `404` when fetched directly - dead or unreachable, not usable as evidence either
way. No equivalent code-switching check was run for Telugu; PDF24's real native verbs (see table above)
were evidence enough to build Telugu's Trends terms directly.

**Caveat, same as LOC-01's report:** none of this is a real ranking position. It narrows which phrasing
is worth testing; it does not say who wins a Tamil or Telugu SERP. That still needs Shlomi's `hl`/`gl`
screenshots, below.

## For Shlomi: Trends charts and SERP links, ready to open

**Telugu - four Trends comparisons, terms grounded in PDF24's real titles above** (native terms 2 and 3
per chart are PDF24's actual title text and one constructed variant; the two romanized terms are
constructed by pattern, not observed on any page, and should be read as the weaker half of each chart,
same caveat LOC-01 applied to Hindi's Hinglish probes):

- Compress: [`compress pdf` / `pdf కుదించు` / `pdf సైజు తగ్గించు` / `pdf kudinchadam ela` / `pdf size thaggincha ela`](https://trends.google.com/trends/explore?date=today%2012-m&geo=IN&q=compress%20pdf,pdf%20%E0%B0%95%E0%B1%81%E0%B0%A6%E0%B0%BF%E0%B0%82%E0%B0%9A%E0%B1%81,pdf%20%E0%B0%B8%E0%B1%88%E0%B0%9C%E0%B1%81%20%E0%B0%A4%E0%B0%97%E0%B1%8D%E0%B0%97%E0%B0%BF%E0%B0%82%E0%B0%9A%E0%B1%81,pdf%20kudinchadam%20ela,pdf%20size%20thaggincha%20ela&hl=en)
- Merge: [`merge pdf` / `pdf విలీనం` / `pdf కలపడం` / `pdf merge cheyadam ela` / `pdf files join cheyadam`](https://trends.google.com/trends/explore?date=today%2012-m&geo=IN&q=merge%20pdf,pdf%20%E0%B0%B5%E0%B0%BF%E0%B0%B2%E0%B1%80%E0%B0%A8%E0%B0%82,pdf%20%E0%B0%95%E0%B0%B2%E0%B0%AA%E0%B0%A1%E0%B0%82,pdf%20merge%20cheyadam%20ela,pdf%20files%20join%20cheyadam&hl=en)
- Sign: [`sign pdf` / `pdf పై సంతకం` / `pdf సంతకం చేయడం` / `pdf santhakam ela` / `pdf sign cheyadam ela`](https://trends.google.com/trends/explore?date=today%2012-m&geo=IN&q=sign%20pdf,pdf%20%E0%B0%AA%E0%B1%88%20%E0%B0%B8%E0%B0%82%E0%B0%A4%E0%B0%95%E0%B0%82,pdf%20%E0%B0%B8%E0%B0%82%E0%B0%A4%E0%B0%95%E0%B0%82%20%E0%B0%9A%E0%B1%87%E0%B0%AF%E0%B0%A1%E0%B0%82,pdf%20santhakam%20ela,pdf%20sign%20cheyadam%20ela&hl=en)
- PDF to JPG: [`pdf to jpg` / `pdf jpg గా మార్చు` / `pdf jpg రూపంలోకి మార్చడం` / `pdf jpg marchadam ela` / `pdf to jpg ela cheyali`](https://trends.google.com/trends/explore?date=today%2012-m&geo=IN&q=pdf%20to%20jpg,pdf%20jpg%20%E0%B0%97%E0%B0%BE%20%E0%B0%AE%E0%B0%BE%E0%B0%B0%E0%B1%8D%E0%B0%9A%E0%B1%81,pdf%20jpg%20%E0%B0%B0%E0%B1%82%E0%B0%AA%E0%B0%82%E0%B0%B2%E0%B1%8B%E0%B0%95%E0%B0%BF%20%E0%B0%AE%E0%B0%BE%E0%B0%B0%E0%B1%8D%E0%B0%9A%E0%B0%A1%E0%B0%82,pdf%20jpg%20marchadam%20ela,pdf%20to%20jpg%20ela%20cheyali&hl=en)

**Telugu SERPs** (`hl=te&gl=IN`) on the primary native term per task, to see who actually shows up
against PDF24 once Google is asked in Telugu rather than crawled by URL guess:

- Compress: [`pdf కుదించు`](https://www.google.com/search?q=pdf%20%E0%B0%95%E0%B1%81%E0%B0%A6%E0%B0%BF%E0%B0%82%E0%B0%9A%E0%B1%81&hl=te&gl=IN)
- Merge: [`pdf విలీనం`](https://www.google.com/search?q=pdf%20%E0%B0%B5%E0%B0%BF%E0%B0%B2%E0%B1%80%E0%B0%A8%E0%B0%82&hl=te&gl=IN)
- Sign: [`pdf పై సంతకం`](https://www.google.com/search?q=pdf%20%E0%B0%AA%E0%B1%88%20%E0%B0%B8%E0%B0%82%E0%B0%A4%E0%B0%95%E0%B0%82&hl=te&gl=IN)
- PDF to JPG: [`pdf jpg గా మార్చు`](https://www.google.com/search?q=pdf%20jpg%20%E0%B0%97%E0%B0%BE%20%E0%B0%AE%E0%B0%BE%E0%B0%B0%E0%B1%8D%E0%B0%9A%E0%B1%81&hl=te&gl=IN)

**Tamil - reconnaissance first, not full Trends charts yet.** Because no competitor page and no live
Tamil tool site gave a verified native phrasing to test (see incumbent check above), spending a full
five-term Trends chart per task on constructed phrasing risks measuring guesses rather than demand -
exactly what the brief's own rule warns against ("never invent a volume"). Before building Tamil Trends
charts, please run these four SERP checks (`hl=ta&gl=IN`) using the one real, code-switched pattern
found in the wild, and note what Google's autocomplete suggests when you start typing `pdf` + each task
word into the Tamil-language search box - that suggestion list is itself a demand signal and costs
nothing extra to capture while you're there:

- Compress: [`pdf ஐ compress செய்வது எப்படி`](https://www.google.com/search?q=pdf%20%E0%AE%90%20compress%20%E0%AE%9A%E0%AF%86%E0%AE%AF%E0%AF%8D%E0%AE%B5%E0%AE%A4%E0%AF%81%20%E0%AE%8E%E0%AE%AA%E0%AF%8D%E0%AE%AA%E0%AE%9F%E0%AE%BF&hl=ta&gl=IN)
- Merge: [`pdf ஐ merge செய்வது எப்படி`](https://www.google.com/search?q=pdf%20%E0%AE%90%20merge%20%E0%AE%9A%E0%AF%86%E0%AE%AF%E0%AF%8D%E0%AE%B5%E0%AE%A4%E0%AF%81%20%E0%AE%8E%E0%AE%AA%E0%AF%8D%E0%AE%AA%E0%AE%9F%E0%AE%BF&hl=ta&gl=IN)
- Sign: [`pdf ஐ sign செய்வது எப்படி`](https://www.google.com/search?q=pdf%20%E0%AE%90%20sign%20%E0%AE%9A%E0%AF%86%E0%AE%AF%E0%AF%8D%E0%AE%B5%E0%AE%A4%E0%AF%81%20%E0%AE%8E%E0%AE%AA%E0%AF%8D%E0%AE%AA%E0%AE%9F%E0%AE%BF&hl=ta&gl=IN)
- PDF to JPG: [`pdf ஐ jpg ஆக மாற்றுவது எப்படி`](https://www.google.com/search?q=pdf%20%E0%AE%90%20jpg%20%E0%AE%86%E0%AE%95%20%E0%AE%AE%E0%AE%BE%E0%AE%B1%E0%AF%8D%E0%AE%B1%E0%AF%81%E0%AE%B5%E0%AE%A4%E0%AF%81%20%E0%AE%8E%E0%AE%AA%E0%AF%8D%E0%AE%AA%E0%AE%9F%E0%AE%BF&hl=ta&gl=IN)

If those four SERPs turn up a real Tamil-native competitor phrase or a consistent autocomplete
suggestion this ticket didn't anticipate, that becomes the verified term to run through a proper
five-term Trends comparison next; if they turn up nothing (empty results, only English pages, no
Tamil autocomplete suggestions), that is itself the answer for Tamil and this ticket can close it
without ever needing a Trends chart, the same way LOC-01 closed Hindi.

## Telugu evidence, 2026-09-12 (Shlomi's Trends and SERP screenshots)

**Trends, all four charts (12 months, `geo=IN`, five terms each): every term at zero.** Compress,
merge, sign and pdf-to-jpg alike, native script and romanized alike, none of the eight Telugu
probes registered against the English line. Same shape as Hindi and Malay in LOC-01, and one step
flatter than Hindi, whose English line at least sat at 35-100 while the probes read zero. (If the
English term itself also read zero the chart did not load, which changes nothing here: the eight
Telugu terms carrying no share is the reading criterion 1 asks about.)

**SERPs, `hl=te&gl=IN`, desktop, all four anchor queries.** What Google actually serves when asked
in Telugu:

| Query | What the top ten are | Read |
| --- | --- | --- |
| `pdf కుదించు` (compress) | pdf2go, Smallpdf, freepdfconvert, Canva, PDFAid, Dpdf, bigpdf/11zon - every one of them carrying Google's own "అనువదించబడింది · ఒరిజినల్‌ను చూడండి (English)" badge (translated by Google, see original). PDF24 is the only native Telugu page. iLovePDF ranks with its English title and a "translate this page" link. AI Overview in Telugu at position 2. | Google fills the Telugu SERP by machine-translating English pages on the fly. One real native page (PDF24) in ten. |
| `pdf విలీనం` (merge) | Smallpdf, pdf2go, Adobe, freepdfconvert, Sejda, Jotform, all Google-translated; PDF24 native at 8; iLovePDF English at 10; a Japanese site (rakko.tools) with a Telugu title dated four days ago. AI Overview at 2. | Same shape. A four-day-old Japanese page reaching the top ten says the native field is close to empty. |
| `pdf పై సంతకం` (sign) | AI Overview first, then PDF24 native, then DigiSigner, Adobe, Lumin, PrintFriendly, RAD PDF, Signer.Digital, Canva, Smallpdf, every one Google-translated. | Same shape. |
| `pdf jpg గా మార్చు` (pdf to jpg) | iLovePDF, Smallpdf, Pdf2Jpg.net, Canva, TinyWow, Adobe, pdf2go, CloudConvert, all served in **English** with a "translate this page" link; PDF24 native at 2; AI Overview at 4. The "people also search for" block is entirely English (`JPG to PDF`, `PDF to JPG online free`, `Compress PDF to JPG 100 KB online free`). | Here Google does not even bother translating: it serves English pages to a Telugu query, and the related searches it has seen from these users are all English. |

**Against the decision rule:**

| Language | 1. Trends share | 2. Weak incumbent to beat | 3. Reviewer available | Verdict |
| --- | --- | --- | --- | --- |
| Telugu | **Measured: flat at 0 on all 4 anchor tasks**, 8 native and romanized probes, phrasing lifted from PDF24's real Telugu titles. Cleanly fails criterion 1, same as Hindi and Malay. | **Met by the letter and hollow in substance.** Nearly every incumbent on every query is machine-translated, but the translating is Google's, not the site's: Telugu is on Google's translated-results list, so any English page (ours included) is already served to these searchers in Telugu. A native edition would not be beating a sloppy incumbent, it would be competing with Google's own translation of the same competitors, plus PDF24's real page. Related searches being all English says the searchers themselves query in English. | Not evaluated (moot) | **No.** Zero in-language volume on Trends, and a SERP Google has to backfill with translations and English pages. Closes Telugu on this pass. |

The rakko.tools result is worth one line beyond the table: a Japanese utility site published a Telugu
merge page four days before this screenshot and reached the top ten immediately. That is what an
empty native field looks like from the outside, and it is not an opening. It is the absence of
searchers to compete for.

## Tamil evidence, 2026-09-12 (Shlomi's reconnaissance SERPs, `hl=ta&gl=IN`, desktop)

All four code-switched queries (`pdf ஐ compress செய்வது எப்படி` and siblings) returned the same shape:

| Query | What the top ten are | Read |
| --- | --- | --- |
| compress | AI Overview, then a **video block of three YouTube how-tos** (two titled in English with "in Tamil" appended: "How to Compress PDF file size with HiPDF in Tamil", "how to reduce pdf file size in tamil"), then Adobe, pdf2go, Sejda, Smallpdf, freepdfconvert, iLovePDF blog, APITemplate.io, PDF24 - **every web result Google-translated** ("Google மொழிபெயர்த்தது · ஒரிஜினலைக் காட்டு (English)"), PDF24 included, which confirms the incumbent table above: its `/ta/` route is not a Tamil page. | Zero native Tamil web pages. The only Tamil-language content Google can find is YouTube, and even those are titled in English. |
| merge | AI Overview, three "in Tamil" YouTube videos, then Adobe, Smallpdf, iLovePDF blog, Sejda, pdf2go, Jotform, PDF24, PDFgear, all Google-translated. | Same. |
| sign | AI Overview, then Certinal blog, iLovePDF blog, Lumin, Docusign blog, pdfAssistant.ai blog, Adobe, Smallpdf, Canva, all Google-translated, and one YouTube video ("how to add digital signature in pdf in tamil") at 10. | Same, thinner: half the results are vendor blog posts rather than tool pages. |
| pdf to jpg | AI Overview, then Adobe, Smallpdf, freepdfconvert, pdf2go, Canva, iLovePDF blog, PDF Techno, FreeConvert, PDFgear, all Google-translated. No video block. | Same. |

Forty results across four queries, and not one native Tamil web page from anyone. The Tamil demand
that exists is served by YouTube creators, and they title their videos in English with "in Tamil" as
a suffix, which is the code-switching pattern the general-web pass above found and is itself the
answer to "what phrasing would a Trends chart test": there is no native phrase to lift, because the
people asking do not use one. No competitor phrase and no autocomplete suggestion surfaced that would
justify building a five-term Trends chart, so per the acceptance clause this closes Tamil as "no
signal found", the way LOC-01 closed Hindi.

| Language | 1. Trends share | 2. Weak incumbent to beat | 3. Reviewer available | Verdict |
| --- | --- | --- | --- | --- |
| Tamil | **Not chartable:** the reconnaissance SERPs produced no verified native phrasing to measure, and the only Tamil-language results are English-titled YouTube videos. Not run, by design (see "reconnaissance first" above). | **Met by the letter and hollow in substance**, same as Telugu: all forty results are Google's own translations of English pages. Nobody, PDF24 included, has a Tamil page, and Google backfills the whole SERP itself. | Not evaluated (moot) | **No.** No native field, no native phrasing, and Google already serving every English page (ours included) translated. Closes Tamil on this pass. |

## Verdict (2026-09-12): both no, and the list stops here

Telugu fails criterion 1 outright (zero on all four Trends charts). Tamil could not even be given a
chart, because no native phrasing exists to test. Both SERPs share a feature that LOC-01 only saw on
Arabic and that reshapes criterion 2 for any language on Google's translated-results list: the SERP
is full of "machine-translated incumbents", but the translator is Google, applied to every English
page equally, so a native edition would compete with Google's translation of iLovePDF, Smallpdf and
Adobe, not with a sloppy competitor. That makes "an incumbent is machine-translated" a signal of thin
native demand rather than an opening, and the rule should be read that way from now on (findings doc,
section 2).

Marathi, Gujarati, Kannada and Malayalam stay unmeasured. With Hindi, Telugu and Tamil (India's three
largest languages after English) all flat, and the GSC India filter showing every query in English,
nothing here argues for continuing down the list. The GSC re-check for Tamil/Telugu-script
queries (below) came back empty the same day, so all three instruments agree.

**GSC check (source 3 of the method), done 2026-09-12.** India, last 28 days, Queries tab, 50 rows:
every query in English, not one containing a Tamil or Telugu character and no transliteration of
either (nothing like `kudinchu`, `santhakam`, `surukku`). Same two clusters LOC-01 saw in the 3-month
window: compress-to-100kb (`file compressor to 100kb` 4 clicks / 100 impressions, `reduce file size to
100kb` 0 / 52, plus `110 kb` and `80 kb to 100kb` variants) and blur/blackout (`blur pdf` 1 / 43,
`pdf blur` 2 / 15). India's searchers reach this domain in English, for SEO-17's page and for
`/redact/`, and the script filter that LOC-01 did not isolate turns up empty. Loose end closed.

## Acceptance

- Telugu's four Trends screenshots and SERP screenshots reviewed against the decision rule above,
  verdict recorded here (pilot / later / no) with evidence, same format as LOC-01's table.
- Tamil's four reconnaissance SERPs run; either a verified phrase to build real Trends charts from, or
  a documented "no signal found" closing Tamil on this pass.
- If either language clears the decision rule: before recommending a pilot, re-run LOC-07's field
  check (real `hl`/`gl` SERP quality, review-count scale, and whether this domain has beaten anything
  like that field in English) - passing the demand gate was not sufficient for Indonesian and should
  not be treated as sufficient here either.
- Findings doc status board updated with the outcome either way.
- Marathi, Gujarati, Kannada, Malayalam remain unmeasured and out of scope for this ticket - queue a
  follow-up only if Tamil or Telugu's result argues for continuing down the list.
- No page built here.
