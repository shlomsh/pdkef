---
id: "SEO-03"
title: "External signals: the work that moves the constraint and does not live in this repo"
status: "open"
priority: "P2"
epic: "search-acquisition"
phase: "longer-term"
depends_on: []
legacy_state: "Open"
---

# SEO-03 · External signals: the work that moves the constraint and does not live in this repo

## Scope and acceptance

**Every other ticket in this epic optimises pages on a domain nobody links to.** The measured
constraint is authority: incumbents sit at DR 59-83 and PDkef launched around 2026-06. On-page work
can take a page from position 11 to position 6; it cannot take a new domain into a head term, and no
amount of it will.

This ticket exists because that work is invisible to a code backlog and therefore never gets done. It
is tracked here precisely because it is not a code change.

**What is genuinely on-topic**, in rough order of fit. Nothing here is a link scheme; each is a place
where an MIT-licensed, no-upload, no-account PDF suite is a legitimate answer to something a real
person asked:

- The GitHub repository itself: topics, a README that reads as a project rather than a landing page,
  and a release history. It is the most natural citation source we have and it is under our control.
- Open-source and privacy-tool directories and awesome-lists where the entry criteria are actually met.
- Communities where "I need to sign a PDF without uploading it" is asked and answered honestly, with
  disclosure of authorship. A drive-by link is worse than nothing.
- The language-support story (SEO-12, SEO-18), which is genuinely novel and is the one thing here that
  a writer might cover on its own merits rather than as a favour.

**What is out of scope and must stay that way:** paid links, reciprocal-link arrangements, mass
directory submission, comment links, and anything requiring us to describe the product in words the
voice rules forbid. A link that costs the honesty of the positioning is a bad trade, because the
positioning is the product.

**Acceptance.**

- A working list of candidate venues, each with its entry criteria and whether we meet them, kept in
  the findings doc rather than in someone's head.
- Every outreach attempt recorded with its date and outcome, successes and refusals alike. A venue that
  said no is information; losing that is how the same venue gets asked twice.
- Referring-domain count measured at the start and at each monthly refresh (SEO-02), so the effect is
  visible next to the ranking table rather than asserted.
- No ticket in this epic blocks on this one; it runs in parallel and permanently.

## Implementation (2026-09-11)

**Repo-side work: done, the part fully under our control.**

- GitHub repo description rewritten from Merge-only ("Merge PDF files online, free and private...") to
  the full nine-tool suite, matching what README already says the product is. Homepage URL corrected
  from the `pdkef.vercel.app` preview domain to `https://pdkef.com` (matches `astro.config.mjs`'s `site`
  and every other reference in this repo). 15 topics added where there were previously none: `pdf`,
  `pdf-tools`, `pdf-editor`, `pdf-merge`, `pdf-signer`, `client-side`, `privacy`, `privacy-tools`,
  `offline-first`, `static-site`, `astro`, `preact`, `webassembly`, `open-source`, `pwa`.
- README's language paragraph was stale and undercounting: it named 11 languages/scripts while the Sign
  tool supports 20 (`src/data/tools.js`'s `languages.supported` array - Chinese, Telugu, Tamil, Punjabi,
  Korean, Dari/Farsi, Pashto, Malayalam and Turkish were all missing). Rewritten to name all 20 and keep
  the RTL-native framing, since SEO-12 named this exact language story as the product's strongest,
  least-copyable differentiator - a stale README was quietly underselling the one thing this ticket says
  "a writer might cover on its own merits."
- README otherwise already met the bar section 2's SEO-08 lesson sets (a visible project with a founder
  voice, explicit architectural constraints, real technical detail - not a landing page), so no
  structural rewrite was needed.
- Release history (the third repo-side lever named above): not started. No git tags or GitHub releases
  exist yet (`git tag` lists only three `archive/*` branches-as-tags; `gh release list` is empty). Next
  increment.

**Venue list and outreach log:** kept in the findings doc per this ticket's own acceptance line (a
living, refresh-checked artifact rather than ticket narrative) -
[docs/seo-competitive-findings.md §8](../../docs/seo-competitive-findings.md#8-reference-seo-03-venue-list-and-outreach-log).
Referring-domain baseline captured the same day: zero external mentions found by web search (proxy
method, not an authoritative link-graph count - see the doc's caveat), consistent with 4 GitHub stars /
0 forks on a ~10-week-old domain. Re-check at the next monthly refresh, and prefer a real backlink tool
over the search proxy if one becomes accessible.

**First outreach, 2026-09-11: submitted, one found ineligible.**

- **awesome-selfhosted** - checked its actual `CONTRIBUTING.md` before drafting anything, not just its
  README: it requires a tagged GitHub release more than 4 months old, and PDkef has none (only
  `archive/*` branch tags). Would have hit their canned rejection reply. Not submitted; this is what
  makes "release history" (this ticket's other open item) a real prerequisite for this specific venue,
  not just a nice-to-have.
- **pluja/awesome-privacy** (19.7k stars) - submitted:
  [pluja/awesome-privacy#1103](https://github.com/pluja/awesome-privacy/pull/1103), added under
  `Utilities` (their existing sections don't have a PDF-tools category; "Office" is full office suites,
  "File Management and Sharing" is file transfer, neither fits). One entry-criteria wrinkle, decided by
  Shlomi rather than assumed: their checklist requires no trackers beyond their approved Analytics list,
  and pdkef.com's Vercel Web Analytics isn't on it. Submitted as-is without calling it out in the PR -
  defensible in substance (anonymized, cookieless, same-origin) even if a reviewer reads the checklist
  literally. Their stated review cadence is monthly batches; check back for the outcome rather than
  re-pinging.
- **Lissy93/awesome-privacy** (9.8k stars) - a second, comparable list, not yet evaluated. Check its own
  contributing rules before submitting; don't assume they match pluja's.
- AlternativeTo.net, Product Hunt, Reddit (r/privacy, r/opensource, r/selfhosted), Show HN, Privacy
  Guides community - still not approached.

**Second pass, 2026-09-11: openalternative.co rejected, four more candidates researched and queued.**

- **openalternative.co** - Shlomi filled out the submit form (project name, website, repo URL,
  "alternative to" field) and it hard-rejected at submit time: *"This repository has fewer than 10
  stars. Please come back once the project has gained more traction."* The requirement is stated right
  on the form next to the Repository URL field, so this was findable before attempting, and next time
  should be checked the same way awesome-selfhosted's `CONTRIBUTING.md` was - by reading the actual
  submission surface, not assuming an "open directory" has no gate. Logged as the second confirmed
  traction gate; re-attempt once the repo passes 10 stars (currently 4).
- **abhi18av/awesome-pdf** (56 stars, active, last push 2026-08-14) and **OneOffTech/awesome-pdf** (30
  stars, active, last push 2026-07-26) - both PDF-specific curated lists, the closest topical fit found
  so far. abhi18av has a dedicated "Online PDF Tools" section already listing near-identical competitors
  (PDFGem, abcdtools, Fluranto); standard PR, no CONTRIBUTING.md or star gate found. OneOffTech's
  "Creation and production" category lists similar tools (BentoPDF, Stirling-PDF); submission is via
  their "Add Entry" GitHub issue template, not a PR. Neither yet submitted.
- **Astro Showcase** - genuinely on-topic (the site is actually built with Astro). Submission is posting
  the URL as a comment in [withastro/roadmap#521](https://github.com/withastro/roadmap/discussions/521);
  no stated requirements or gate found. Not yet posted.
- **PWA directories** (pwa-directory.appspot.com "Gulliver", appsco.pe) - PDkef is a real installable
  PWA, so this is a legitimate fit; neither directory's exact submission flow has been checked in detail
  yet.
- Checked and **rejected as candidates**: `feross/awesome-pwa` (dead since 2021, 4 stars, not worth
  pursuing); `py-pdf/awesome-pdf` (161 stars but stale since 2024, and scoped specifically to Python
  libraries - off-topic for an end-user web app).
