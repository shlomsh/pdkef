---
id: "LOC-04"
title: "Indonesian: the one large market where the category is searched in-language, gated on LOC-01 and the Hebrew pilot"
status: "retired"
priority: "P3"
epic: "localized-search"
phase: "later"
depends_on: ["LOC-01", "LOC-03", "LOC-07"]
legacy_state: "Retired 2026-09-11"
---

# LOC-04 · ~~Indonesian: the one large market where the category is searched in-language, gated on LOC-01 and the Hebrew pilot~~

**Retired 2026-09-11, by [LOC-07](LOC-07.md).** LOC-01 cleared this ticket's own demand gate for
Indonesian (Trends parity on compress and sign), but LOC-07's ROI judgment found the second gate -
"at least one incumbent is mixed-language or machine-translated" - does not hold against the real
`hl=id&gl=ID` SERP: every top-five result on all four anchor queries is iLovePDF, Smallpdf, Adobe,
PDF24 or Canva, native-quality, most carrying 300k-700k-review `AggregateRating` snippets. That is the
same field this domain already loses to in English (`/merge/`, position 36.13, 0 clicks), and a
translated page inherits the domain's authority, not the competitors'. Indonesian is also on Google's
translated-results list, so the marginal gain over an auto-translated English page is unmeasured and
likely small. Full case, both directions, in LOC-07. Read there before reopening.

**Do not reopen speculatively.** Reopen only alongside one of the two signals LOC-07 named: the Hebrew
pilot ([LOC-03](LOC-03.md)) producing measurable in-language impressions (the one calibration this
domain has for what a localized page earns), or an English tool page reaching page one for its own
head-term query (evidence the authority gap against this exact competitive field is closing). Reopening
on demand alone repeats the mistake this ticket made the first time - demand cleared and it still
wasn't the right call.

## Original scope and acceptance (superseded, kept for record)

**Why Indonesian and not Hindi, Malay or Tagalog.** Indonesia is already fourth by impressions on
English queries alone, iLovePDF reports about 13% of its traffic from there, and the category is
searched in Bahasa (`kompres pdf`, `gabungkan pdf`, `pdf ke jpg`, with size targets like `200kb`
common). It is the one country on our list where the suspected in-language share is high *and* the
market is large. The other candidates each fail one side: Hindi is expected to fail the share test
(tool queries are typed in English or Hinglish, and Google already serves "Translated results" to
Hindi users, which shrinks the marginal gain); Malay is mixed with English and much smaller; the
Philippines searches in English. LOC-01 tests all of that; this ticket assumes it holds for
Indonesian and is closed without work if it does not.

**Two gates before any page.** LOC-01's Indonesian verdict is "pilot", and LOC-03's success criteria
were met for Hebrew, so the mechanism is proven to produce impressions on in-language queries before
it is paid for in a language that needs an external reviewer.

**The reviewer is the cost.** Unlike Hebrew, this needs a native Indonesian reviewer per page; the
`reviewer` field in the frontmatter gate is not a formality. Budget it before starting. Machine
translation reviewed by nobody is the one version of this Google's spam policy names, and the
schema is built to make it inconvenient on purpose.

**Scope.** Same three pages as LOC-03 (`compress`, `merge`, `sign`), phrased from LOC-01's Indonesian
matrix, with the same island rules and the same success criteria and eight-week window. Malay is
explicitly *not* a copy of this edition; if LOC-01 ever marks it "pilot", it gets its own ticket and
its own reviewer.

**Acceptance.** As LOC-03, for `id`. Outcome recorded in the findings doc; the decision for the next
language (or to stop) recorded there with the evidence.
