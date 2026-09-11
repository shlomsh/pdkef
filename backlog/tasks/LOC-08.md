---
id: "LOC-08"
title: "Tamil and Telugu demand check: reopening LOC-07 Part 2 for India's other major languages"
status: "open"
priority: "P3"
epic: "localized-search"
phase: "later"
depends_on: ["LOC-07"]
legacy_state: "Open"
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

**GSC check (source 3 of the method, unchanged):** the India Queries filter is already pulled
(LOC-01, 2026-09-11) and showed every query in English with zero Hinglish leakage - worth re-checking
for Tamil/Telugu-script leakage specifically (a query containing Tamil or Telugu characters, or an
obvious transliteration), which wasn't isolated in that pass.

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
