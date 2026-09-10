---
id: "SEO-08"
title: "The four OS how-to guides rank between 44 and 58, and one of them is our best-read page"
status: "open"
priority: "P2"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["SEO-07"]
legacy_state: "Open"
---

# SEO-08 · The four OS how-to guides rank between 44 and 58, and one of them is our best-read page

## Scope and acceptance

**The guides are drawing real impressions and converting essentially none of them.**
`/how-to-sign-a-pdf-on-android/`: 130 impressions, 1 click, position 44.18.
`/how-to-sign-a-pdf-on-windows/`: 46 at 48.57, no clicks. `/how-to-sign-a-pdf-on-iphone/`: 39 at 46.82,
no clicks. `/how-to-sign-a-pdf-on-mac/`: 4 impressions at position 9.00, which is a different animal
entirely and worth understanding rather than averaging away.

The query detail underneath is unambiguous about intent. Around thirty distinct phrasings of "how to
sign a pdf on android / iphone / pc / phone / laptop", all between positions 43 and 66. And five
variants of **"how to sign on pdf file sent through whatsapp"** (19 impressions, positions 48-50) -
which is PDkef's own story, already named in `/sign/`'s subhead and its aboutLead, and we are losing it.

Position 44-58 is not a snippet problem, unlike SEO-04 and SEO-05. It is a page that Google has decided
is roughly the fiftieth-best answer. So the question this ticket has to answer honestly is which of
three things is true, and the evidence for it:

1. **The pages are fine and the domain is too young.** Then the fix is SEO-03 and time, and this ticket
   should say so and close rather than churn the copy.
2. **The pages are competing with the OS vendors' own documentation and losing on a fair comparison.**
   Apple, Google and Microsoft all document this. Then the pages need to be about what those pages are
   not about - which is what happens when the built-in tool stops being enough - and the `compare`
   block the content schema already provides is exactly the right shape for it.
3. **Four near-identical pages are splitting one topic four ways.** Then the answer is consolidation,
   and it has a cost worth stating: four indexed URLs become one, on a domain where getting indexed is
   the hard part.

Do the comparison before choosing. Read what actually ranks in the top ten for
`how to sign a pdf on android` and record what those pages do that ours does not.

**The WhatsApp thread is worth pulling separately.** Nineteen impressions on a phrasing we already
write about, at position 48, on a query no incumbent is targeting. If any single sub-topic here is
winnable on merit, it is that one.

**Acceptance.**

- The top ten for `how to sign a pdf on android` is recorded here with what each result offers, before
  any edit.
- One of the three diagnoses above is chosen explicitly and argued from that evidence. "Do all three" is
  not an answer.
- If consolidation wins: redirects are slash-terminated on both sides per CLAUDE.md's URL
  canonicalization section, which has shipped broken once before, and the surviving page absorbs the
  content rather than dropping it.
- If the pages stay: each names, specifically, where the built-in tool stops - and the claims are
  verified against the current OS versions, not repeated from the existing copy.
- The WhatsApp phrasing is addressed deliberately, and where it landed is recorded.
- `npm run test:seo` passes; positions for the guide cluster tracked in the SEO-02 table.
