---
id: "LOC-03"
title: "Read 2026-11-06 · Hebrew pilot: three tool pages, phrased the way Israelis actually search, reviewed in-house"
status: "blocked"
priority: "P2"
epic: "seo-awaiting-read"
phase: "near-term"
depends_on: ["LOC-02"]
legacy_state: "Open"
---

# LOC-03 · Read 2026-11-06 · Hebrew pilot: three tool pages, phrased the way Israelis actually search, reviewed in-house

*Re-filed 2026-09-12* from `localized-search` into `seo-awaiting-read`, status `open` to `blocked`, read date 2026-11-06: live; eight-week read of the three Hebrew tool pages via the per-locale table.

## Scope and acceptance

**Why Hebrew first, even though Israel is a small market.** Four reasons, none of which is "it is the
founder's language" on its own. The review requirement is satisfiable in-house, so it is the only
language where a full-quality edition costs a review pass rather than a translation contract. Israel
already converts at 40% CTR from English queries (findings doc 3.3), the best of any country. The
incumbents' Hebrew is visibly weak: Sejda's edition is machine-flavoured and laid out LTR, PDF24's is
better but still a translation of a German product's page, and the Sign tool's real RTL text support is
something none of them can say. And it is a right-to-left language, so it exercises the hardest path of
LOC-02 before an LTR language gets an easy pass.

**Three pages, not nine.** `compress`, `merge` and `sign`, chosen because LOC-01's brief targets them as
anchor tasks and because they cover both island kinds LOC-02 distinguishes (two small islands localized
in full, one editor kept English behind a notice). Add `split` only if LOC-01's Hebrew phrasing matrix
later shows it carries real volume. A page per tool is easy to add later; three good ones now is the pilot.

**Not gated on LOC-01.** The 2026-09-11 SERP captures in LOC-01 settled that Hebrew is worth three
reviewed pages; LOC-01's remaining output for Hebrew (the size of the query, the wider phrasing matrix)
refines copy if it lands in time and is folded in at the next refresh if not.

**Phrase from the SERPs, not from the dictionary.** As working hypotheses for the reviewer to confirm
or overturn, not as copy:

- Compress: `כיווץ קובץ pdf` and `כיווץ pdf` lead the title. LOC-01's SERP capture shows every
  incumbent titled with `דחיסה` while the typed word is `כיווץ`, and Google already treats them as
  synonyms, so saying the user's own word is the cheapest differentiation on the page. `דחיסת pdf`
  and `הקטנת קובץ pdf` go in the intro so the page covers all three. Size targets (`ל-100kb`,
  `ל-200kb`) are probably searched, as in English.
- Merge: `מיזוג קבצי pdf`, `איחוד קבצי pdf`, `חיבור קבצי pdf`; one leads the title, the others
  appear in the intro.
- Sign: `חתימה על pdf`, `לחתום על קובץ pdf`, `מילוי טופס pdf`. The `מילוי טופס pdf חינם` SERP is
  split between "edit PDF" and "fill PDF" pages, and none of the five mentions Hebrew text or RTL;
  the language card is the unclaimed fact here. **`חתימה דיגיטלית` is a trap**: in
  Hebrew it usually means certificate-based signing, which the tool does not do; the design record
  already flags the electronic-versus-certificate distinction in English, and Hebrew must keep it.

**Title, description and H1 per page** written in the plain register the voice rules require, leading
with one honest fact: the file stays on the device (`הקובץ נשאר אצלכם במכשיר`), free with no account,
works offline. For Sign, lead with the right-to-left editor and real Hebrew fonts: the fill-a-form SERP shows
nobody on page one says it, and it is the one thing an upload site cannot copy. LOC-01's section D
will say whether people search for it; the claim belongs on the page either way. No em dashes; Hebrew typography (maqaf, geresh) checked by the reviewer.

**Acceptance.**

- Three `src/content/localized-tools/he/*.yaml` entries published with `reviewer`, `reviewedAt`,
  `reviewNotes` and a verified `sourceHash`; the island message catalogues for Compress and Merge
  reviewed in the same pass; Sign's notice text reviewed.
- Rendered in a real browser at desktop and mobile widths, RTL, with the switcher, and screenshots
  attached to this ticket; `e2e/` gets one guardrail for the RTL shell (jsdom has no layout).
- Indexing requested once for each of the three URLs, and the request date recorded here, per the
  findings doc's "a copy ticket is not done until it is recrawled" rule.
- **Success criteria, written now**: within eight weeks of the recrawl, Hebrew queries appear in
  Search Console for these pages (any impression at all is the first proof the blind spot was real),
  and at least one of the three target phrasings is in the top 20 for Israel. Record the outcome in the
  findings doc either way; a pilot that finds no demand is a finished pilot, and it closes LOC-04
  rather than expanding it.

## Progress 2026-09-11: copy drafted and mechanism completed, review still pending

Draft (unreviewed, `status: 'draft'`, `noindex` preview) content shipped for all three tools, phrased
per this ticket's SERP-derived hypotheses and the "translated, not re-authored" FAQ rule:
`src/content/localized-tools/he/{merge,compress,sign}.yaml`. Merge's draft carried over from LOC-02
unchanged. Compress mirrors merge's pattern exactly (island localized, `hebrewCompressMessages` added
to `src/i18n/toolMessages.ts`). Sign is the harder case and needed real mechanism work, not just copy:

- **The route never actually rendered Sign.** `src/pages/[locale]/[tool].astro` had branches for merge
  and compress only; added the `PdfSignTool` import, the `editorFonts.css` import (needed so a Hebrew
  signer's own typed text renders with the right bundled font, even though the editor chrome stays
  English), and the render branch.
- **The language-purity guard (`scripts/localizedSeoChecks.mjs`) had never been measured against a
  page whose editor stays English on purpose.** It failed `/he/sign/` outright (0.270 against the 0.5
  floor) - not because of the editor (its SSR output is empty; `PdfSignTool` renders nothing before
  hydration) but because `ToolLanguagesCard`'s 20-language deep-dive table is structural, not in
  `TOOL_SOURCE_FIELDS`, and stayed English. Rather than ship it untranslated (exactly the "Hebrew
  headline over English tool" pattern the guard exists to catch) or hand-translate 20 technical
  font/script claims without native+technical review in one sitting, the card is now English-edition-only
  (`ToolPageLayout.astro`); the RTL/Hebrew-font differentiator this ticket asks Sign to lead with instead
  lives in the translated subhead, aboutLead and the Hebrew-specific FAQ item. Also added a
  `data-tool-controls-english` marker and an `excludeIsland` option to the purity check itself, for the
  general case (any future tool whose island stays English disclosed via the notice), with a sabotage
  test pair in `src/lib/localizedSeoChecks.test.js`.
- **`vercel.json`** gained the three routes' non-slash → slash redirect pairs (`/he/compress`,
  `/he/merge`, `/he/sign`), verified against a real "as if published" build (see below) rather than
  guessed - `npm run test:redirects` only checks routes that exist in `dist/`, so this was invisible
  until publishing was actually simulated.

**Verified, not just written**: full `npm test` (2196 tests), `test:seo`, `test:css` (both the ordinary
build and a temporary local-only "as if published" build - not committed - to catch what only shows up
once these are real), `test:csp`, `test:redirects`, `test:weight`, `test:fonts`, the `e2e/localized/`
Playwright RTL/CSP guardrail, and real-browser screenshots at desktop and mobile widths for all three
pages (RTL mirroring, switcher, localized islands for merge/compress, the English-editor notice on
sign). No English copy or `tools.js` touched.

**What is deliberately not done here, and why:**

- **No native review.** `reviewer`/`reviewedAt`/`reviewNotes` are unset and status stays `'draft'` on
  purpose - this ticket's whole premise is that the review is satisfiable in-house (Shlomi), and an
  agent self-attesting a human review would defeat the point of requiring one. The draft renders as a
  noindex preview only (`PDKEF_DOCS_PREVIEW=1` build); it changes nothing on the live site as committed.
- **No indexing requests.** Nothing is published or deployed yet; a GSC indexing request needs a live,
  published URL.
- **The Sign language card stays English** on this pass (see above) - a follow-up once it has its own
  reviewed translation, not blocking this pilot's core hypothesis test.
- **Found, not caused, and flagged rather than fixed silently:** the working tree had an uncommitted
  `vercel.json` top-level `"build": { "env": { "PDKEF_DOCS_PREVIEW": "1" } }` block that predates this
  session's edits and isn't part of this diff - if committed as-is it would make every production
  Vercel build include every draft page (this ticket's three included) on the live site. Left in place
  rather than removed unilaterally; flagged to Shlomi before anyone commits.

**Next step**: Shlomi reviews the three YAML files (and the two message catalogues) for wording,
maqaf/geresh typography, and the `חתימה דיגיטלית` trap; flips `status` to `'published'` with
`reviewer`/`reviewedAt`/`reviewNotes`; deploys; requests indexing for the three URLs and records the
date here.

## Status 2026-09-11: published, indexing not yet requested

Shlomi reviewed all three YAML files and both message catalogues the same day (`reviewer`,
`reviewedAt` 2026-09-11, `status: 'published'`, commit `71ca953`); the shell, cross-link cards and
switcher were translated on review (`82a88c2`, `5a1af03`). `/he/compress/`, `/he/merge/` and
`/he/sign/` are live, indexable (no `noindex`) and in the sitemap - confirmed against the deployed site.
**The eight Hebrew guides are still `draft`** (noindex, not built); that is [LOC-05](LOC-05.md).

**One step left before this is done: request indexing for the three URLs in Search Console and record
the date here.** Per the findings doc, a copy ticket is not done until it is recrawled, and the
eight-week success read (and [LOC-07](LOC-07.md)'s calibration) counts from that request, not from
the deploy.

**Indexing requested 2026-09-11** for `/he/compress/`, `/he/merge/` and `/he/sign/` (Shlomi, Search
Console URL Inspection). The eight-week success read counts from this date: first check at the
2026-10-08 refresh, through LOC-06's per-locale table; the eight-week mark is 2026-11-06.

## Interim read 2026-09-17: first Hebrew data, seven weeks early

Not the eight-week read (2026-11-06), but the first real numbers, from Shlomi's 2026-09-17 exports
(Performance, last 7 days, 2026-09-09 to 09-15; Coverage -> Valid). All three tool pages were crawled
and indexed on 2026-09-11, the day of their requests; four of the seven Hebrew guides (the OS ones)
followed on 09-13, and `install-pdf-app`, `open-source-pdf-editor` and `sign-pdf-no-signup` are not
indexed yet.

| Page | Clicks | Impressions | CTR | Position | English sibling |
| --- | ---: | ---: | ---: | ---: | --- |
| `/he/merge/` | 0 | 67 | 0% | 27.34 | `/merge/`: 0 / 5 at 5.80 |
| `/he/sign/` | 2 | 49 | 4.08% | 47.63 | `/sign/`: 1 / 9 at 6.11 |
| `/he/compress/` | 0 | 11 | 0% | 52.64 | `/compress/`: 7 / 309 at 9.64 |

Hebrew queries in `Queries.csv`: 48 rows, 82 impressions, 0 clicks, weighted position 50.3 (a lower
bound, privacy filter). Merge phrasings sit best: `צירוף קבצים` at 9, `קיבוץ pdf` at 35, the
`איחוד`/`מיזוג`/`חיבור` family at 25 to 46. Sign phrasings are all at 46 to 79 (`חתימה דיגיטלית חינם
pdf`, 7 impressions at 64, is the largest). Compress phrasings (`כיווץ`, `הקטנת`, `דחוס`) at 39 to 67.
Israel site-wide: 9 clicks on 145 impressions at 32.12. Search appearance "Translated results": 59
impressions, 1 click, which is the machine-translation effect LOC-07 described, now measured.

Read: `/he/merge/` is drawing more impressions than `/merge/` itself, on the phrasing the ticket
predicted, while ranking on page three; Sign is page five and worse. Nothing to change before 11-06.

### Hebrew merge SERPs, captured 2026-09-17

Shlomi ran the two merge phrasings by hand (signed-in browser, Google's footer says results are
personalised, so positions here are indicative and GSC's are the record).

**`צירוף קבצים`** (GSC: 5 impressions at 9): PDF24 (5.0 stars, 24,060) first, **PDkef second**, then
FreePDFConvert, AvePDF, Adobe, lexa.co.il, Sejda, Aspose, itspdf. Our displayed title is the `seoTitle`
as shipped, `מיזוג קבצי PDF בחינם - ישירות בדפדפן, בלי העלאה | PDkef`, and the snippet is the steps copy.

**`איחוד קבצי pdf`** (GSC: 1 impression at 40): PDF24, FreePDFConvert, AvePDF, Adobe, Sejda,
mypdf.co.il, itspdf, lexa.co.il, Microsoft Store. **We are not on page one.** Every page-one result
carries `מיזוג` in its title; the three that also carry `איחוד` (mypdf, itspdf, lexa) are small local
sites, which is the thin native field LOC-11 said to look for. "People also search for" mixes both
verbs (`מיזוג pdf בחינם`, `איחוד קבצי pdf אונליין חינם`, `חיבור קבצים לקובץ אחד`).

**The gap is the title.** `src/content/localized-tools/he/merge.yaml` already says `איחוד` in the h1
and subhead but the `seoTitle` says only `מיזוג`; GSC has the `איחוד` family at 25 to 46 and the
`מיזוג` family at 37 to 43, both below the `צירוף` row. This is the Hebrew edition of SEO-35's
"combine" move: add `איחוד` to the `seoTitle`, nothing else, and let 11-06 read it. Shlomi reviews
Hebrew copy, so it ships only with his wording. Shipped the same day, next section.

## 2026-09-17: seoTitle gains איחוד, pending Shlomi's Hebrew wording approval

Per this ticket's own "Hebrew merge SERPs, captured 2026-09-17" section: `/he/merge/`'s h1 and subhead
already say איחוד, but `seoTitle` said only מיזוג, and Google's page one for `איחוד קבצי pdf` is titles
that carry איחוד while we are absent there (present for `צירוף קבצים`). `seoTitle` changed from
`'מיזוג קבצי PDF בחינם - ישירות בדפדפן, בלי העלאה | PDkef'` to
`'מיזוג ואיחוד קבצי PDF בחינם - ישירות בדפדפן, בלי העלאה | PDkef'` on branch
`claude/he-merge-title-ichud`. No other field changed: `sourceHash` hashes the normalized English
`tools.js` source, which is untouched, so it did not need updating; `reviewNotes` already sat at 597 of
its 600-character schema max with no room for a new dated entry, so it was left as-is rather than
trimming the existing history. `status` stays `'published'` and `reviewedAt` stays `2026-09-12`, matching
how earlier unreviewed AI-drafted copy in this file was handled: shipped, not re-approved. This title
wording is pending Shlomi's review the same way; flip `reviewedAt`/add a `reviewNotes` line once he signs
off on the Hebrew.

*Landed 2026-09-17:* Shlomi read the old and new title side by side and said to proceed. Reads at 11-06 with the rest of the pilot.

## 2026-09-17, later: איחוד leads, and צירוף is not a merge query

Two corrections from Shlomi, a native speaker, with a Trends check behind them (Israel, past 12
months, web: `מיזוג pdf` averages about 60, `איחוד pdf` about 52, `צירוף pdf` flat at zero):

- **איחוד is how Israelis say merge; מיזוג is the word the incumbents' translated titles use.** Both
  are searched at near parity, so the page carries both, and the native word leads: title
  `איחוד ומיזוג קבצי PDF בחינם - ישירות בדפדפן, בלי העלאה | PDkef`, h1 `איחוד קבצי PDF בחינם: מיזוג
  קבצים ישירות בדפדפן`, tool name / card / aria / schema `איחוד PDF`, headings and body verbs
  (אחדו, האיחוד, מאחדים) throughout the merge edition, the home description and privacy line, and the
  merge island's Hebrew strings. מיזוג stays once in the title, h1 and description. LOC-01's note that
  "מיזוג PDF is the market term" was read off competitor titles, which are translations; corrected.
- **צירוף means attach, not merge.** `צירוף קבצים` was our best-ranking Hebrew query (5 impressions
  at position 9) with zero clicks: attach-a-file intent landing on a merge page. It leaves the merge
  cluster and should not count toward this ticket's read.

Shipped the same day; reviewedAt on the merge and home files is 2026-09-17.
