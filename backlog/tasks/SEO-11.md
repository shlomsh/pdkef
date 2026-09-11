---
id: "SEO-11"
title: "The positioning review protocol: what we may claim, and what proves it"
status: "done"
priority: "P1"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["SEO-02"]
legacy_state: "Done 2026-09-11"
---

# SEO-11 · The positioning review protocol: what we may claim, and what proves it

## Scope and acceptance

**SEO-12 through SEO-16 are per-tool deep reviews, each intended to be run by its own agent with a real
token budget.** Five agents reviewing five tools against five private notions of what PDkef stands for
will produce five incompatible voices. This ticket is the shared brief they all start from. It is
written once, here, and every review ticket references it.

**The four claims, and the evidence each needs.** Every competitor in this market says it is free,
private, fast and easy. Three of those four are, for them, marketing. For us they are consequences of
an architecture, which means we can evidence them and they cannot. A review may lean on a claim only
with its evidence attached.

| Claim | What is actually true | What proves it | What we must never say |
| --- | --- | --- | --- |
| Free | No account, no cap, no watermark, no paid tier, and none planned. It is free because it costs almost nothing to run. | The product itself, and the absence of any upgrade path anywhere in it. | "Free tier". "Free forever" as a promise. Anything implying a paid version is coming. |
| Private | Nothing is uploaded. There is no PDF backend to upload to. | A visitor can open devtools, go offline, and watch the tool work. `/open-source-pdf-editor/` already documents that test. | "Military-grade", "100% secure", "breach-proof". Security theatre in place of the demonstration. |
| Open source | MIT, auditable, the repository is public. | The repository and `/licenses/`. | Implying an audit has been performed that has not. |
| Works on any device | Mobile-first, installable, works offline once provisioned. | Mobile ranks better than desktop in our own Search Console data. | "Works everywhere" without naming the browser constraints that exist. |

**The rule that keeps this honest, and it is the one that will be tempting to break.** Competitors being
freemium in disguise, or being unable to prove their privacy claims, is *true* and is *not ours to say*.
CLAUDE.md's first voice principle is explicit: explain, do not compete; no "unlike [Competitor]"
framing; the tools registry had competitor references removed deliberately and they are not going back.
The correct move is to state our own fact so plainly that the comparison happens in the reader's head.
"Your file does not leave your device" does that work. "Unlike other tools, we don't upload your file"
does it worse and makes us sound like everyone else.

**The per-tool method**, which every review ticket follows:

1. Pull the tool's queries out of the latest Search Console export. Rank them by impressions. These are
   the words real people use, and they outrank any keyword-volume estimate in the research doc.
2. Read the top ten results for the three highest-impression queries. Record what each page leads with,
   what it claims, what it hides, and what its actual limits are behind the signup wall.
3. Compare against our page's current copy, word by word, including `seoTitle`, `seoDescription`, `h1`,
   `subhead`, `gridDescription`, the step copy and every FAQ answer in `src/data/tools.js`.
4. Name the differentiator this specific tool has that the competition structurally cannot match. Some
   have a strong one (Sign's language support; Redact's flattening being verifiable). Some have only the
   four general claims, and a review that invents a fifth is doing harm.
5. Propose concrete copy, with the diff, and the evidence for each claim it makes.

**Acceptance.**

- The table above and the method live in [docs/seo-competitive-findings.md](../../docs/seo-competitive-findings.md)
  as a section the review tickets link to, not only in this ticket file.
- Every claim in the table has its evidence recorded and re-checked as still true at the time of writing.
- One worked example exists, so the next agent has a model rather than a description: SEO-12 is it.
- The no-competitor-framing rule is stated in the protocol in the form a reviewer will actually hit it -
  as the sentence-level rewrite above, not as an abstract principle.

## Progress (2026-09-11)

**Shipped:** the table, the no-competitor-framing rule, and the per-tool method now live as
[section 7 of docs/seo-competitive-findings.md](../../docs/seo-competitive-findings.md#7-reference-the-positioning-review-protocol-seo-11) (section 6 at the time; renumbered 2026-09-11 when the doc was restructured),
not only in this ticket file, so SEO-12 through SEO-16 can link a stable section instead of copying the
protocol into each ticket. Every claim in the table was re-checked against the current site: no
`src/data/tools.js`, `.astro` page, or `content-pages` entry uses any of the banned phrases about our
own product ("free tier" appears once, in `sign-pdf-no-signup.yaml`, describing why *competitors* need
accounts, not claiming one for us); `/open-source-pdf-editor/` still documents the devtools-offline
test; `/licenses/` still exists. SEO-12 is named as the worked example - it already follows the method
end to end in its own scope section, so no changes were needed there.

**Not done here, on purpose:** SEO-12 through SEO-16's actual per-tool reviews. This ticket is the
protocol only; those are separate P1/P2/P3 tickets with their own token budgets, per the scope note
above.
