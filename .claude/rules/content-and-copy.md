---
paths:
  - "src/content/**"
  - "src/content.config.ts"
  - "src/data/**"
  - "src/i18n/**"
  - "src/pages/**"
  - "src/components/*.astro"
  - "src/lib/contentMarkup*"
  - "src/lib/gitLastModified*"
  - "public/robots.txt"
  - "README.md"
  - "docs/seo-*"
  - "docs/localized-*"
  - "backlog/tasks/SEO-*"
  - "backlog/tasks/LOC-*"
  - "scripts/seo*"
  - "scripts/localizedSeoChecks.mjs"
---

# Content, copy, voice, and search acquisition

Loaded when writing or editing user-facing text, SEO pages, or structured data. The voice in five
lines (warm, modest, first person welcome, plain facts, no em dashes, no competitor naming) is in
CLAUDE.md; this is the whole brand voice plus the SEO rules and the content-collection mechanics.
Home-page-specific positioning is in `home-page.md`.

## The SEO landing pages are a content collection, not eight page files

The eight standalone SEO pages (four OS how-to guides, four long-tail landing pages) are **not** `.astro`
files. Each one is a YAML entry in `src/content/content-pages/`, validated by the Zod schema in
`src/content.config.ts` and rendered by the single dynamic route `src/pages/[contentPage].astro`. They
were eight near-identical `.astro` files; the duplication was the small problem, and the big one was
that nothing checked the copy - a page missing a FAQ answer, or linking to `/sign` without the trailing
slash, was a perfectly valid `.astro` file. `verify-seo.js` caught a subset of it after the fact, from
the built HTML. Now it is a build error that names the file and the field.

Things to know before touching them:

- **The entry id is the URL.** `how-to-sign-a-pdf-on-mac.yaml` renders at `/how-to-sign-a-pdf-on-mac/`.
  These pages rank, so the loader sets `generateId` explicitly rather than letting Astro slugify, and
  renaming a file renames a live URL - add the redirect in `vercel.json` (slash-terminated, both sides).
- **Two registries, cross-checked at build time.** The collection owns what a page *says*;
  `src/data/contentPages.js` still owns where it *sits* (hub tool, cross-link card, sitemap entry).
  Neither derives from the other, so `getStaticPaths` fails the build if a slug appears in one and not
  the other - a content file with no registry entry is an orphan page, a registry entry with no content
  file is a 404 in the sitemap. Both used to be possible.
- **Body copy is a two-tag dialect, and content files never carry a class.** `<strong>` and
  `<a href="...">`, nothing else; `src/lib/contentMarkup.ts` validates it (unsupported tag, unbalanced
  tag, bare `&`, internal link without its trailing slash, external link without
  `rel="noopener noreferrer"`) and puts the design system's classes back on at render. Everything else -
  card spacing rhythm, step numbering, the class strings themselves - is derived by the route template,
  so a card cannot get the wrong rhythm because someone copied classes from a different page.
- **Adding a *kind* of content means editing the schema and the route.** Adding a page, or rewording
  one, means editing one YAML file and nothing else.
- **The "Last updated" date in the header is git-derived, never authored (SEO-29).**
  `src/lib/gitLastModified.js` dates a page by the commit history of its YAML plus the route template
  (a localized edition by its own translation file), and the sitemap's `<lastmod>`, the header line and
  the page's Markdown twin all read that one function, so they cannot disagree. Do not add a date field
  to the YAML. A commit to `[contentPage].astro` re-dates every English page at once, which is honest
  (they all changed) but worth knowing before reading the dates as per-page freshness.
- **One accepted cost:** all eight pages share one route, so they share one CSS bundle, and
  `CompareTable.astro`'s scoped styles now inline on all eight rather than the four that render a
  table (+~320 brotli bytes on those four; duplication factor 9.73x → 9.79x against the 9.85x ratchet).
  Two root-level dynamic routes would collide, and splitting by URL prefix would hard-code the guides'
  slugs into routing, so this is the price of one template.


## Product, voice & copy (read before writing or editing any user-facing text)

*This section absorbed the former `PRODUCT.md`. It is the whole brand voice, not a summary.*

### Who it is for

Privacy-conscious users who need to manipulate PDFs (merge, split, compress, rotate, sign, extract
pages, convert formats) without uploading files to a server. They trust their own device more than
cloud services and prioritize keeping personal or sensitive documents offline.


### Origin (the story the copy draws on)

PDkef began with a real errand. My partner needed to download all her course slides into a single PDF
before an exam, and separately to sign a summer-camp consent form that had arrived over WhatsApp. We
went looking for tools. One capped the number of pages. One wanted a paid subscription plus a Windows
install. One just felt like a place you would not want to send personal documents. So I built the tool
I wanted for myself, and named it PDF + *kef* ("fun" in Hebrew) = PDkef.

The motivation is the point, not the effort. I believe simple tools like these should be free and
accessible to everyone, everywhere, on any device. I wanted this for myself, and then I wanted to share
it, so it saves other people the same time and hassle instead of sending them to a paywall or a sketchy
upload site. Every messaging decision traces back to that belief.

**Do not frame PDkef around how little time it took ("a weekend project", "built in a weekend").** It
minimizes the work, ages badly, and misses the actual reason the tool exists.

### Brand personality

- **Tone:** warm, personal, modest. A builder sharing something useful, not a company selling a product.
- **Three words:** generous, honest, capable.
- **Emotional goal:** "Oh, I can just do this, for free, and my files stay with me." Relief and a small
  delight, not a security lecture.
- **Founder voice is an asset.** First person ("I built this because...") is welcome and
  differentiating. Most tools in this space hide behind a faceless brand; PDkef does not have to.

### Anti-references (what this must never resemble)

Slick SaaS onboarding with dark patterns ("upgrade now"); signup walls or account creation; vague
privacy policies or hidden tracking; gratuitous animations that slow down workflows; overcomplicated
UIs with features users don't need; heavy branding that competes with the actual tools.

### Voice & messaging principles

The market is crowded and most competitors sound salesy. PDkef wins by sounding like a person who made
something and wants to share it.

1. **Explain, don't compete.** State why the tool exists and how it works. Do not argue against named
   competitors or take an us-vs-them tone. "Your file stays on your device" carries itself and needs no
   "unlike [Competitor]" attached. (`src/data/tools.js` FAQs no longer name competitors; do not add that
   framing back.)
2. **Lead with discovery, not fear.** The strongest hook is telling people something genuinely useful
   they may not know, for example "you can fill and sign a PDF without printing and scanning." That is a
   gift, not a pitch. Privacy is a reason to trust the tool, not the headline.
3. **Plain facts over intensifiers.** "Runs on your device. Free. Open source." reads as more true than
   "100% secure, instant, zero-limit." Pick the one honest word. Overselling reads like the paywalled
   sites we are not.
4. **Privacy at human altitude.** Frame it the way a normal person would ("I would not want to upload a
   consent form to a random site"), not with corporate security language ("military-grade, breach-proof").
5. **Free because it should be, not as a funnel.** Avoid "free tier" framing that implies a paid tier is
   coming. It is free because it costs almost nothing to run and because access to this should not be gated.
6. **For everyone, on any device.** Mobile-first and global reach are true and underused. Say them plainly.
7. **A little kef is fine.** The name is a pun; the voice can be light and human. Modest and warm, never
   corporate, never hype. **No em dashes** (use spaced hyphens, commas, or split the sentence).

All copy lives in `.astro` / `src/data/tools.js` / `src/content/content-pages/*.yaml` (the eight SEO
landing pages - see "The SEO landing pages are a content collection" above), rendered at build time and
never injected client-side (see SEO invariants below).

### Design principles

1. **Privacy by default.** Visible, transparent proof that files never leave the device. Every page
   surface should reinforce this without being preachy.
2. **One tool, one job.** Each tool does exactly one thing well. No feature creep or bundling.
3. **Fast and predictable.** Minimal clicks to completion. Clear visual feedback at every step.
4. **Accessible to everyone.** No gatekeeping on ability.

### Accessibility & inclusion

WCAG 2.1 AA minimum. Keyboard navigation and screen-reader support. Contrast of 4.5:1 for body text and
3:1 for large text. No motion or flashing that could trigger vestibular issues. Clear error messages and
status feedback.


## SEO invariants (don't regress these)

- Primary keyword ("pdf merge online free", "split pdf", etc.) stays in `<title>`, the single `<h1>`, and meta description for each specific tool page.
- Only one `<h1>` per page.
- All marketing/how-to/FAQ content stays build-time rendered - in `.astro` files, or in the `contentPages` collection the eight SEO landing pages are authored as - and is never moved into the Preact island. The rule is "static HTML a crawler sees without running scripts", not "must be an `.astro` file".
- `robots.txt` (a static file in `public/`) and `/sitemap.xml` (generated by `src/pages/sitemap.xml.js` from `src/data/tools.js` - see "URL canonicalization" below) must stay reachable and accurate; `astro.config.mjs`'s `site` must match the real deployed domain (currently `https://pdkef.com`).
- Canonical URL, Open Graph + Twitter Card tags (`BaseLayout.astro`) must stay present.
- JSON-LD (`SeoSchema.astro`: `SoftwareApplication` with `Person` author, `FAQPage`) must stay valid — verify with Google's Rich Results Test after edits. `HowTo` schema was intentionally removed (Google deprecated HowTo rich results in 2023); don't re-add it.
- Target Lighthouse SEO + Performance ≥ 95 — keep the island lean, lazy-load thumbnails, avoid layout shift.


## Search acquisition (SEO work beyond the invariants above)

**The SEO memory is one file: [docs/seo-competitive-findings.md](../../docs/seo-competitive-findings.md).**
Read it before any search-related work; it holds the status board, the lessons, the dated standings,
the plan with its gates, and the reference material (competitor research, refresh procedure, review
protocol). Task state lives in the `SEO-*` tickets under `backlog/tasks/`, epic `search-acquisition`.

**What goes where, so the memory stays focused.** The findings doc says *what is true now*; a ticket
says *how we found out*. A ticket owns its diagnosis, SERP captures, before/after tables and dead ends
at whatever length the work needed. The doc gets one status row per ticket and, if the ticket learned
something that outlives it, one line in its "What we know" section with a link back - never a
re-explanation. Standings in the doc are replaced at each refresh, not appended; git is the timeline.
If a section of the doc starts narrating, move the narrative to the ticket. Do not create a second
SEO document; extend the one that exists.

Four standing rules, each learned the expensive way (evidence in the doc's section 2):

- **Verify any external audit against `src/data/tools.js` and `src/lib/` before accepting its gap
  list.** The report that started the epic proposed building target-size compression that had
  already shipped.
- **No template-swapped doorway pages.** A new content page must teach something verifiable and
  disclose the awkward fact; three pages differing by a number are rejected on sight. New long-tail
  pages go through the content-pages collection, never new `.astro` files.
- **A copy change is not done until the page is recrawled.** "Indexed" is not "current": Google served
  a two-week-old title for `/redact/` while the live page had the new one. A copy ticket ends with an
  indexing request, and no CTR reading is a verdict until the indexed snippet matches the live one.
- **Google blocks scripted SERP fetches from this environment.** Real Google SERPs come from Shlomi's
  screenshots; ask rather than guess. Bing/DuckDuckGo show who competes, never our Google position.
  Autocomplete does answer (`node scripts/seo-autocomplete.mjs <hl> <gl> <seed...>`): use it to find
  the phrasings a locale actually types before asking for Trends or SERP screenshots, seeding
  verb-first and without the word "pdf" (LOC-11 has the method and the 2026-09-12 sweep).

**Localization is an ongoing programme with one record: the languages page.** It lives at
https://claude.ai/code/artifact/0758819e-6104-460e-8cf0-05bc3ee84e78 and is the source of truth for
every language's stage (candidate, measured, decided, building, live, reviewed, read in the field),
the Hebrew edition's surface-by-surface coverage and review state, and for each held or declined
language the measured evidence (Trends ratios, SERP field, GSC by country), the verdict against the ROI
gate, and the date it comes back. `docs/i18n-status/` holds its source (`index.html`) and a snapshot of
its data (`data/i18n-status.json`); the page edits itself (its Publish writes a new version of the data
file), so after a decision changes there, sync the snapshot into the repo with the page's Copy JSON
button, or read the artifact's `data/i18n-status.json` with the Artifact tool. Fifteen languages were
measured in 2026-09; the mechanism (`/he/` editions, `src/i18n/`, the review and freshness gates)
stays; no generic tool page gets localized into a new language while every native SERP is the same
field this domain loses to in English. The findings doc's section 2 has the three-part lesson, LOC-10
the decision, LOC-11 the evidence and the ROI gate (native demand of the order of the English page's
own traffic in that country, plus an English page of ours already in the top ten on the same kind of
query), LOC-12 the re-check due 2026-11-12. A new language proposal starts from the page and that gate,
not from a hunch, and ends by updating the page.


