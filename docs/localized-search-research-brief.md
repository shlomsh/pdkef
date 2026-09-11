# Localized search demand: research brief

A self-contained prompt for a research agent (human or otherwise). Written for
[LOC-01](../backlog/tasks/LOC-01.md), the gate for the `localized-search` epic. **This document
produces a per-language demand and phrasing matrix, not a translation.** Nothing here authorises
publishing a page; that is decided ticket by ticket from the evidence this brief returns.

Paste everything from "## The prompt" down into the research agent, unchanged.

---

## The prompt

You are researching search demand for a small, privacy-first PDF tool site, **pdkef.com**, to decide
whether to publish localized editions of its tool pages and in which languages. Your output is a
demand and phrasing matrix with evidence, not a recommendation to translate everything.

### What the site is, so you do not propose things that already exist

- Nine browser-only PDF tools at `pdkef.com/<tool>/`: `sign` (fill and sign), `merge`, `split`,
  `compress`, `edit-pdf` (reorder, rotate, delete pages), `pdf-to-image`, `image-to-pdf`, `unlock`
  (unlock and protect), `redact`. Files never leave the device; there is no server.
- The site is **English only** today. Eight Hebrew translations of its how-to guides exist as
  unpublished drafts, and there is routing infrastructure for `/he/...`, `/hi/...`, `/ms/...`,
  `/ar/...`, `/zh-hans/...` and others. **No tool page is localized.**
- One genuine product differentiator relevant to this research: the Sign tool embeds real fonts for
  Hebrew, Arabic, Persian, Pashto, Devanagari, Bengali, Gurmukhi, Tamil, Telugu, Thai and CJK, lays
  out right-to-left text correctly, and refuses characters it cannot draw rather than exporting
  boxes. Competitors are Latin-centric here. Whether *searchers* ask for this is unknown.
- Traffic today (Search Console, last 3 months): India by a wide margin, then the United States,
  Israel (small but 40% CTR), Malaysia, Indonesia, the Philippines, Pakistan, Bangladesh, South
  Africa, the UAE, the UK. **Every query in that data is English, and that is a blind spot, not a
  finding**: an English-only site never gets an impression on a Hebrew or Indonesian query, so Search
  Console cannot measure this demand at all. That is exactly why you are being asked.

### The question, precisely

For each language below, and for each of the nine tools: **do people in the relevant countries type
the query in that language rather than in English, at what relative volume, in which exact phrasing,
and who ranks for it today with what quality of page?**

Languages to cover, in this order of priority:

1. **Hebrew** (Israel). Suspected: strong in-language search habit for this category. Known example:
   the query `כיווץ מסמך pdf` returns `tools.pdf24.org/he/compress-pdf` first.
2. **Indonesian** (Indonesia). Suspected: the largest market where this category is searched
   in-language (`kompres pdf`, `gabungkan pdf`). iLovePDF reports ~13% of its traffic from Indonesia.
3. **Malay** (Malaysia, Singapore). Suspected: mixed; many searches in English. Distinguish Malay
   from Indonesian; do not treat them as one.
4. **Hindi** (India). Suspected: tool-shaped queries are typed in English or romanised "Hinglish"
   (`pdf ko chota kaise kare`), not Devanagari. Test that assumption; do not assume it.
5. **Filipino/Tagalog** (Philippines), **Urdu** (Pakistan), **Bengali** (Bangladesh), **Arabic**
   (UAE, wider): one pass each, lighter depth, mainly to say "in-language demand exists / does not"
   with one piece of evidence.

### What to produce, per language

**A. Language share.** For 3 to 4 anchor tasks (compress, merge, sign, pdf-to-jpg), the relative
volume of the native-language query versus the English one *within that country*. Best sources, in
order of trust:

- Google Trends, region set to the country, comparing the native phrase against the English phrase
  as search terms (not topics). Report the ratio, the 12-month trend, and the URL of the comparison.
- Google Keyword Planner, filtered to the country and to the language, if you have access.
- Third-party volume tools (Ahrefs, Semrush, Similarweb) for the same country filter.
- Google autocomplete with `hl=<language>&gl=<country>`, as a signal that the phrase is common.

State which source each number came from. **Never invent a volume.** "Unknown, autocomplete suggests
it is common" is an acceptable answer; a made-up number is not.

**B. Phrasing matrix.** For every one of the nine tools, the actual query variants in that language,
ranked by evidence of use. Hebrew, for example, has several verbs for compress (`כיווץ`, `דחיסה`,
`הקטנה`) and merge (`מיזוג`, `איחוד`, `חיבור`); which one people type matters more than which one is
grammatically best. Include: how "PDF" itself is written (Latin `PDF` inside the native sentence, or
transliterated), whether the query is a noun phrase or an imperative, common modifiers (`בחינם`,
`online`, `gratis`, `tanpa aplikasi`, size targets like `200kb`), and mobile-flavoured phrasings
(`באייפון`, `di hp`).

**C. Who wins today.** For the top 2 to 3 phrasings per tool, the top 5 organic results in that
country and language (`hl` and `gl` set). For each incumbent, record:

- Is the page a dedicated localized URL (`/he/compress-pdf`) or the English page shown to a local user?
- Translation quality in one line: native, competent, or visibly machine-translated. Note mixed
  language (native headline, English buttons and labels), which is common and is a weakness we can beat.
- For RTL languages: is the page actually laid out right-to-left, or LTR with RTL text poured in?
  Sejda's Hebrew edition, for instance, is LTR with translated text; PDF24's is closer to correct.
- Whether Google shows a "Translated results" badge (Google machine-translating an English page for the
  user). Where Google does this for a language, the marginal gain of our own edition is smaller. Record
  which languages on this list currently get translated results in Google Search.
- Whether the SERP has AI Overviews, "People also ask", or video results in that language.

**D. The differentiator check.** For Hebrew and Arabic specifically: do people search for the language
capability itself (`חתימה על pdf בעברית`, `מילוי טופס pdf בעברית`, `توقيع pdf بالعربي`), or only for
the task? This decides whether the Sign tool's RTL and font support is a search asset or only a
product asset.

**E. Recommended SERP text per tool per language**, only for languages where A shows real in-language
demand. A `<title>` (under 60 characters), a meta description (under 155), and an H1, written in the
phrasing B found people actually use, in a modest and plain register: no "100% secure", no
"best", no competitor names. The three facts the site can honestly claim, and the copy should lead
with one of them: the file stays on the device, it is free with no account, and it works offline once
loaded. For the Sign tool in RTL languages, the fact that the editor writes right-to-left with real
fonts may be the lead if D says people ask for it. Mark every string as a draft for native review;
none of it is publishable as returned.

### Rules

- Cite a URL or a screenshot description for every claim about a SERP or a volume. Say "not checked"
  rather than guessing.
- Do not recommend machine translation, IP-based redirects, or one page per country with the same
  content. Google's spam policies name unreviewed automated translation at scale as spam; localized
  pages with `hreflang` and reviewed copy are the ordinary, unpenalised practice.
- Do not treat "the big competitors do it" as evidence of demand for us; they translate into 25+
  languages because their cost per language is near zero. Our cost is a native reviewer per page.
- Keep Indonesian and Malay separate, Hindi and Hinglish separate, Arabic dialect notes brief.
- Report the awkward facts: if Hebrew volume is tiny, say so with the number. The site would rather
  publish two good editions than ten thin ones.

### Output format

One Markdown document with: a one-page summary table (language, in-language share for the anchor
tasks, strongest tool, incumbent quality, translated-results status, recommendation: pilot / later /
no), then the per-language sections A to E. Keep the evidence beside the claim, not in an appendix.
