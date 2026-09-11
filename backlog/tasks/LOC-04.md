---
id: "LOC-04"
title: "Indonesian: the one large market where the category is searched in-language, gated on LOC-01 and the Hebrew pilot"
status: "open"
priority: "P3"
epic: "localized-search"
phase: "later"
depends_on: ["LOC-01", "LOC-03"]
legacy_state: "Open"
---

# LOC-04 · Indonesian: the one large market where the category is searched in-language, gated on LOC-01 and the Hebrew pilot

## Scope and acceptance

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
