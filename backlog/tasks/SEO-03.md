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
Six candidate venues listed, entry criteria checked, none yet approached - outreach (a submission, a
post, a PR) is a separate action from this pass's repo-metadata work and needs its own go-ahead before
posting anything under Shlomi's name. Referring-domain baseline also not yet captured; needs a tool
picked and run at the next monthly refresh.
