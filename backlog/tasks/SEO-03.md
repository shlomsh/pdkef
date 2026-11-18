---
id: "SEO-03"
title: "External signals: the work that moves the constraint and does not live in this repo"
status: "open"
priority: "P1"
epic: "search-and-languages"
horizon: "now"
order: 1
depends_on: []
---

# SEO-03 · External signals: the work that moves the constraint and does not live in this repo

*Re-filed 2026-09-12* from `search-acquisition` into `english-base`: the only lever on authority, which every read above says is the binding constraint; raised to P1.

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

**Third pass, 2026-09-11 (evening): the two PDF awesome-lists submitted, release history started.**

- **OneOffTech/awesome-pdf** - submitted via their "Add Entry" issue template, per their
  `contributing.md`: [OneOffTech/awesome-pdf#81](https://github.com/OneOffTech/awesome-pdf/issues/81),
  category Creation and production, authorship disclosed in the body.
- **abhi18av/awesome-pdf** - already submitted by a parallel session sixteen minutes earlier:
  [abhi18av/awesome-pdf#68](https://github.com/abhi18av/awesome-pdf/pull/68), from the same
  `shlomsh:add-pdkef` fork branch. This session had forked, drafted a longer line (adding the
  20-language Sign fact, in the list's own `–` style) and was about to push when the fork's existing
  branch rejected the push as behind. Left #68 as-is: one PR per venue, and a force-push over another
  session's open PR is worse than a shorter entry. Lesson for parallel agents: **check
  `gh pr list --author shlomsh` on the venue repo before forking**, the same way we now check a
  venue's own gates before drafting.
- **Release history** - `package.json` bumped 0.1.0 to 1.0.0 (`054b8db` on `main`), notes drafted at
  [docs/archive/release-notes-v1.0.0.md](../../docs/archive/release-notes-v1.0.0.md). `git tag` and
  `gh release create` were both refused by the agent sandbox's permission classifier, so the tag and
  the GitHub release are Shlomi's to run:

  ```bash
  git tag -a v1.0.0 054b8db -m "PDkef 1.0.0" && git push origin v1.0.0
  gh release create v1.0.0 --title "PDkef 1.0.0" --notes-file docs/archive/release-notes-v1.0.0.md
  ```

  Chose `1.0.0` over tagging the existing `0.1.0`: a 0.x tag on a product ten weeks live with nine
  working tools reads as "not ready" in exactly the directories this ticket submits to. The
  awesome-selfhosted four-month clock starts at the tag date, so the tag should not wait.
- **Astro Showcase** - also already posted by the parallel session, 19:34 UTC, in
  [withastro/roadmap#521](https://github.com/withastro/roadmap/discussions/521). Found by reading the
  thread's last comments before drafting (the check the abhi18av entry above recommends); not posted
  again.
- **Release published** - Shlomi ran `gh release create` from the main checkout:
  [v1.0.0](https://github.com/shlomsh/pdkef/releases/tag/v1.0.0), 2026-09-11 19:54 UTC, tag at
  `038b5d7` (main had moved past `054b8db` by then, which is fine - the release includes the notes file
  itself). awesome-selfhosted eligible from 2027-01-12.
- Still queued from the second pass: the PWA directories, Lissy93/awesome-privacy (rules unchecked).

## 2026-10-01 board cleanup

- Status in_progress -> open: this is a permanent background ticket, not active work.

## 2026-10-08: the effort moves here

SEO-06's Week 4 gate failed (none of the nine crawled, all fifteen Discovered URLs still N/A), so new-URL
work stops and this ticket is the work that can move the constraint. Horizon set to now. The same read
saw the domain re-weighed without any change of ours: `/merge/` went from position 36 to 7.3 and
`/compress/` held page-one boundary on four times the impressions (SEO-39).

## 2026-10-23: outreach read

- The Astro Showcase comment worked: `pdkef.com.yml` landed in withastro/astro.build on 2026-09-15, the
  first external link. Web search never surfaced it; `gh search code "pdkef.com"` did, so the
  referring-domain method now runs both.
- pluja #1103, abhi18av #68 and OneOffTech #81: open, no replies. OneOffTech had a duplicate, #80, from
  the parallel session; closed with a pointer to #81.
- PWA directories: the two named here are dead (Gulliver 404, appsco.pe 503). findPWA and pwa.directory
  are live, free and met; both forms need screenshots and a short description, so they are Shlomi's to
  send.
- Lissy93/awesome-privacy requires a human-written entry and PR body, so it is Shlomi's to write.
- 9 stars: openalternative.co reopens at 10.

Table and counts: [findings doc section 8](../../docs/seo-competitive-findings.md#8-reference-seo-03-venue-list-and-outreach-log).

## 2026-11-04: pluja closed, venue withdrawn

- pluja closed [pluja/awesome-privacy#1103](https://github.com/pluja/awesome-privacy/pull/1103) on
  2026-11-02 in a backlog sweep: "still too new or too small for the list", with an invitation to open
  a new PR once that changes. Their
  [bar](https://github.com/pluja/awesome-privacy/blob/main/misc/Contributing.md#what-makes-a-good-entry)
  asks for at least 6 months of age and a real user base.
- Shlomi's call: withdrawn, no resubmit. The point of a list like this is to give a young project a
  stage. Once PDkef stands on its own, the list needs it more than it needs the list, so waiting to
  qualify is a waste of time.
- [Withdrawal posted on the PR](https://github.com/pluja/awesome-privacy/pull/1103#issuecomment-6618100165)
  on 2026-11-04 with that reason.

## 2026-11-17: community pilot, plan and baseline

Shlomi asked for a pilot that earns brand mentions and links by giving real value, with the name and link
alongside. Research by three agents and checks in his Chrome, same day.

**What shapes it**

- Accounts with history: LinkedIn and Product Hunt. X is dormant. No Reddit, Hacker News or Stack Exchange
  history, and those sites quietly filter new accounts, so they wait for a warm-up.
- Hacker News: "Don't post generated text or AI-edited text"
  ([guidelines](https://news.ycombinator.com/newsguidelines.html), read 2026-11-17). A Show HN is Shlomi's
  own words; the agent prepares facts only. Treat any venue whose AI rule is unknown the same way.
- Quora allows answers about one's own product with the affiliation disclosed
  ([policy](https://help.quora.com/hc/en-us/articles/360055133711-What-is-Quora-s-policy-on-disclosing-affiliations-in-answers)).
- Reddit, Stack Exchange and Quora block scripted research; their rules and live threads are read in
  Shlomi's Chrome.
- Wikipedia is out: a tool maker's own pages fail its reliable-source and external-links rules.
- What each action can produce, stated up front: AlternativeTo links are nofollow (brand and discovery);
  LinkedIn and X bring traffic and stars, not links Google counts; outreach to a page that keeps a resource
  list is the one route to a counted link.
- Never ask anyone to vote, anywhere.

**Baseline, 2026-11-17**

- Repo: 9 stars (openalternative.co opens at 10).
- GitHub code search for `pdkef.com` outside the repo: withastro/astro.build only (three unrelated junk hits).
- abhi18av/awesome-pdf#68 and OneOffTech/awesome-pdf#81: open, no comments.
- AlternativeTo: not listed. findPWA: live but its database section errors; low priority.
- LinkedIn: Shlomi posted before the pilot started.
- Still needed: a Search Console Links export and the `pdkef` brand-query impressions, from Shlomi.

**The pilot (two weeks from 2026-11-17)**

1. AlternativeTo listing, then suggest PDkef on the pages of the tools people compare it with. Shlomi creates
   the account; the agent fills the forms, Shlomi approves each submit.
2. Two outreach emails, drafted by the agent, sent by Shlomi: The Eclectic Light Company (it tested Preview's
   redaction in 2020; invite a test of Redact, pointing at the blur vs blackout guide) and SIUE ITS
   ("Free PDF Tools", 2023; suggest PDkef for a future ITSpotlight post rather than an edit of a dated post).
3. Keyword alerts (F5Bot) on the strongest tools' questions; Reddit warm-up by answering without links for
   two to three weeks before PDkef is ever mentioned.
4. Show HN in week two, in Shlomi's own words, from a fact sheet
   ([docs/show-hn-fact-sheet.md](../../docs/show-hn-fact-sheet.md), checked against the code 2026-11-17).
5. Hebrew: communities Shlomi is already a member of (to be named by him).

Claims checked before any redaction post: Blackout, Whiteout and Blur flatten the marked page into one image
(the guide says so and `applyPageEdits.js` does it), and every export drops `/Thumb`, `/PieceInfo` and XMP
thumbnails (`documentTraces.js`). Whether a weak blur can be read back from its pixels is untested; no post
claims it cannot.

Read: 2026-12-01, against the baseline above, logged in [findings doc section 8](../../docs/seo-competitive-findings.md#8-reference-seo-03-venue-list-and-outreach-log).

**Outreach log**

- 2026-11-17 22:12, The Eclectic Light Company (Howard Oakley): email from Shlomi's Gmail, in his voice, inviting a
  test of Redact's export; links `/redact/` and the repo. His contact page says he does not answer paid or
  commercial promotion. Waiting for a reply.
- SIUE ITS: dropped 2026-11-17 (Shlomi). The only route is the campus help desk queue.
- 2026-11-17, Reddit: Shlomi's existing account (3 years old, 1 karma, no posts or comments) set up for
  the warm-up: display name, a bio that names pdkef.com (so later mentions are disclosed), a PDkef link,
  history visible. Joined r/pdf, r/software, r/privacy, r/opensource. Answers carry no PDkef link until
  about 2026-12-08. The Chrome extension blocks reddit.com, so Shlomi pastes threads in and posts himself.
  First comment the same day, on an r/pdf launch post for a free mobile PDF app: congratulations, and a
  question on whether its Redact removes the text under the box or only covers it. No link, no PDkef.
- 2026-11-17, Reddit drafting automated: a desktop scheduled task (`reddit-reply-drafts`, daily 09:09, Auto
  mode) reads new F5Bot alerts in Gmail through Chrome, keeps real questions, and drafts replies in Shlomi's
  voice from the fact sheet; Shlomi approves and posts. HN and Lobsters matches are only listed, never
  drafted (HN bans AI-written comments). Test run the same night reached Gmail unattended (no alerts yet).
- 2026-11-18, GitHub topics: added pdf-redaction, pdf-compression, rtl, hebrew (19 of 20).
- 2026-11-18, PWA Store (pwastore.io): listed after its install check passed; details taken from the manifest.
- 2026-11-18, awesome lists, authorship disclosed in both PRs:
  [hemanth/awesome-pwa#640](https://github.com/hemanth/awesome-pwa/pull/640) (Tools and Utilities) and
  [diegoleme/awesome-open-source-alternatives#99](https://github.com/diegoleme/awesome-open-source-alternatives/pull/99)
  (Adobe Acrobat). Its rules warn that very new projects may be asked to come back later.
- OpenAlternative: not submitted 2026-11-18. Its guidelines ask for 250+ stars under 6 months old, 50+
  after (PDkef: 9). Shlomi has an account; submit once the repo is past 6 months and 50 stars.
- 2026-11-18, Bing Webmaster Tools: pdkef.com imported from Search Console (Shlomi signed in with Google
  and granted read-only access; only pdkef.com was imported). The import carried no sitemap because
  Google holds it on the domain property, so `https://pdkef.com/sitemap.xml` was submitted to Bing by
  hand. Bing's index also serves DuckDuckGo and others. Check its Sitemaps and Search Performance pages
  at the 2026-12-01 read.
- 2026-11-18, GitHub social preview: a 1280x640 card (logo, the home H1, "Nothing is uploaded. No
  account. Open source.", pdkef.com) uploaded in the repo settings, so shared repo links show it.
- Later, around 2026-12-30: Lissy93/awesome-privacy (human-written PR text, rules on AI-generated
  projects), Shlomi's to write. Not pluja/awesome-privacy: withdrawn with no resubmit on 2026-11-04. SaaSHub asks for a human
  submitter, also Shlomi's. Skipped: Privacy Guides (community proposals only), py-pdf/awesome-pdf (50 stars,
  5 contributors).
- 2026-11-17, Hacker News: Shlomi created an account for the Show HN; a comment or two on other stories
  before 2026-11-24 so it is not brand new on the day.
- Hebrew communities (pilot step 5): dropped 2026-11-17. Shlomi is not a member of any Israeli group, and
  joining one cold to post a link reads as spam.
- 2026-11-17, AlternativeTo: PDkef listing submitted from Shlomi's account to the free review queue (no paid
  priority). Free, open source (MIT), Online; English and Hebrew; tags pdf-editor, merge-pdf, split-pdf,
  compress-pdf, sign-pdf, pdf-redaction, privacy-focused, offline-access; "No Tracking" left unticked
  (anonymous usage counts); release date July 2026; reviewer note discloses authorship. Links are nofollow.
  Seven alternatives suggested the same night: Smallpdf, iLovePDF, Stirling PDF, PDF24 Tools, Sejda,
  BentoPDF, PaperKnife. The $15 priority review was declined; the listing page is visible only to Shlomi
  until reviewed, so don't share its link yet.
- 2026-11-17, F5Bot (Reddit, Hacker News, Lobsters listening, emails Shlomi within 2 hours): five alerts, the
  free plan's cap, whole words: redact pdf, blur pdf, compress pdf to 100kb, reduce pdf size for upload, sign
  pdf in hebrew. "merge pdf without uploading" left out for the cap. Phrases match literally, so the long ones
  may stay quiet; swap them for shorter ones if they show no hits by the 2026-12-01 read.
- LinkedIn (Hebrew, origin story): posted about four months before the pilot, about 5,200 impressions; its
  first comment links `pdkef.vercel.app`, which redirects to pdkef.com.
