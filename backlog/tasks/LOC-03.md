---
id: "LOC-03"
title: "Hebrew pilot: three tool pages, phrased the way Israelis actually search, reviewed in-house"
status: "open"
priority: "P2"
epic: "localized-search"
phase: "near-term"
depends_on: ["LOC-02"]
legacy_state: "Open"
---

# LOC-03 · Hebrew pilot: three tool pages, phrased the way Israelis actually search, reviewed in-house

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
