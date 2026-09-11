---
paths:
  - "vercel.json"
  - "middleware.ts"
  - "src/pages/**"
  - "src/data/**"
  - "src/i18n/**"
  - "src/layouts/**"
  - "src/lib/markdownRender*"
  - "src/lib/acceptNegotiation*"
  - "public/robots.txt"
  - "src/lib/*elemetry*"
  - "docs/maintenance-telemetry.md"
  - "scripts/check-trailing-slash-redirects.js"
  - "scripts/verify-seo.js"
  - "scripts/runtime-license-inventory.mjs"
---


# Routes, redirects, trust pages, and Markdown negotiation

Loaded when adding or moving a page, editing `vercel.json`, or touching `middleware.ts`, the one
request-time piece of this codebase. Adding a route is a three-place change: the page, its non-slash →
slash redirect pair in `vercel.json`, and (for a tool) `src/data/tools.js`, which feeds the sitemap
and the Markdown twin automatically.

## Tool registry

All nine tools are implemented and indexed; `src/data/tools.js` is the registry (title, description,
FAQ, href), and `src/pages/sitemap.xml.js` generates `/sitemap.xml` from it. Retired routes stay as
redirects: `/protect` → `/unlock/` (one tool covers both intents by auto-detecting encryption),
`/remove-pages/` → `/edit-pdf/`, `/offline-pdf-form-filler/` → `/install-pdf-app/`.

**Definition of done for a new tool page, as one unit:** real `src/lib/` logic with no network calls;
the island calls it and downloads the result (mirror `PdfMergeTool.tsx`); a visible "How it works" +
FAQ section on the `.astro` page with a matching `<SeoSchema>` (FAQ schema only, no HowTo: Google
deprecated it in 2023, and structured data must match on-page content); no `noindex`; the entry in
`tools.js`; the redirect pair; `npm run build && npm run preview` for CSP/hydration.

## URL canonicalization (trailing slashes)

Astro's `build.format: 'directory'` emits `dist/sign/index.html`, so every canonical URL, sitemap entry
and internal link ends in a slash. Write internal links with the slash (`href="/licenses/"`); after a
build, `grep -rho 'href="/[a-z0-9-]\+"' dist/ --include='*.html'` must return nothing.

- **`vercel.json` lists one explicit redirect per real route** (`/<route>` → `/<route>/`,
  `permanent: true`) instead of the blanket `"trailingSlash": true`. The blanket setting redirects
  every extensionless path before Vercel checks it exists, so a fake path answered `308` instead of
  `404` to non-redirect-following agents and readiness scanners. Without the blanket, a real route with
  no entry serves its non-slash form as a duplicate `200`, which Search Console files as "Alternate page
  with proper canonical tag" and burns crawl budget.
- Guard: `scripts/check-trailing-slash-redirects.js` (`npm run test:redirects`, CI after build) reads
  `dist/` and fails by name on a real route missing its entry or pointing somewhere unexpected, and
  fails if `trailingSlash: true` ever returns. It skips routes already covered by a superseding
  redirect; do not add those by hand.
- Redirects apply before filesystem routing, so a superseded route's build output is dead weight and the
  redirect always wins. Every `destination` is slash-terminated. A retired route needs both a
  slash-terminated and a non-slash `source` entry: relying on `trailingSlash` to chain one into the
  other is how a redirect once shipped that never fired.

## Privacy invariants (what `/privacy/` may state)

- No `fetch`/XHR of file bytes, ever; no tracking of PDF content or user identity. The only integration
  is same-origin Vercel Web Analytics for page views.
- Anonymous usage/error telemetry is permitted for maintenance with an explicit allowlist and sanitized
  codes: no filenames, entered text, signatures, document/user IDs, or raw exception payloads
  ([docs/sign-tool-product-decisions.md](../../docs/sign-tool-product-decisions.md)). It must not block
  offline processing, and permission for it does not authorize content logging or user tracking.
- No cookies, no accounts, no PDF-processing backend. CSP `connect-src 'self'` is the browser-enforced
  backstop.

## Trust-anchor pages (/about/, /contact/, /privacy/)

Real, indexed static pages that agents and cautious humans check before trusting a site.
`src/data/staticPages.js` is their single source (title, description, h1, prose in the same
`<strong>`/`<a href>` dialect content pages use, rendered by `renderInline()` from
`src/lib/contentMarkup.ts`), consumed by the three `.astro` pages and their Markdown twins; they share
`src/styles/staticPage.css` and are linked from `Footer.astro` and each other.

- `/contact/` points at GitHub Issues and Discussions; there is no support inbox and inventing one
  would be worse than none. The site-wide `Organization` JSON-LD (`src/data/organizationSchema.js`,
  rendered by `OrganizationSchema.astro` from `BaseLayout`) follows suit: a `ContactPoint` with
  `contactType` and the Issues URL, no `email`/`telephone`, no `address` until a publishable one exists.
  `organizationSchema.test.js` pins the ContactPoint; `verify-seo.js` fails any page without the schema.
- `/privacy/` states only what the invariants above say. It makes no legal claim ("GDPR compliant") the
  project cannot back.

## Markdown content negotiation (Accept: text/markdown)

The only request-time code in the repo. It never sees a PDF byte; it inspects the `Accept` header on a
marketing page and picks a prebuilt file. Readiness checks expect the *same* URL to answer
`Accept: text/markdown` with `Content-Type: text/markdown; charset=utf-8`, `Vary: Accept` on every
negotiated response, and a real `406` when nothing is acceptable; a static site cannot do that, and
`output: 'server'` for the whole marketing surface was rejected in favour of Vercel's Routing
Middleware, which is unrelated to Astro's own (SSR-only, inactive here) middleware.

- `src/lib/markdownRender.js` renders Markdown from the same structured data every other renderer
  reads (`tools.js`, the `contentPages` collection, `staticPages.js`, `homeContent.js`), never from
  `dist/*.html`, so it cannot disagree with the HTML or the FAQ JSON-LD.
- `src/pages/[slug].md.ts`, `index.md.ts`, `404.md.ts` are prerendered endpoints producing `/sign.md`,
  `/about.md`, `/index.md`, `/404.md` and so on, one per tool page, content-pages entry and trust page,
  with no registry to sync. `/licenses/` has no twin and gets the Markdown `404` fallback.
- `middleware.ts` (project root, Edge runtime) decides with the unit-tested `acceptQuality()` and
  `negotiateRepresentation()` in `src/lib/acceptNegotiation.js` (RFC 9110 precedence: exact type >
  `type/*` > `*/*`; Markdown only on a *strict* preference, because curl's `*/*` once got Markdown).
  On a canonical URL it fetches the `.md` sibling and re-wraps it; a missing twin or a nonexistent path
  gets `/404.md` with a `404`. Everything else passes through `next()` with `Vary: Accept,
  Accept-Encoding` added. A non-slash URL is not served Markdown: a real route's redirect must fire
  first, and `markdownRoute()` tells that case from a nonexistent path by reading `vercel.json`'s
  redirect sources, which is what scanners probe with `curl .../some-path` (no slash).
- `@vercel/functions` supplies `next()` only; it is a `BUILD_ONLY_CLOSURES` root in
  `scripts/runtime-license-inventory.mjs` because it runs on Vercel's Edge Runtime, never the browser.
- **Nothing local runs this**: not `npm run dev`, not `build && preview`, not CI. Verify on a real
  deployment: `curl -s -o /dev/null -w "%{http_code} %{content_type}\n" -H "Accept: text/markdown"
  https://pdkef.com/sign/` must print `200 text/markdown; charset=utf-8`; the same without the header
  must print the HTML type with `Vary: Accept, Accept-Encoding`; a fake path with the header → `404`
  Markdown; `Accept: application/json` with no `*/*` → `406`.

## CI guard

`verify-seo.js` (`npm run test:seo`): exactly one `<h1>` per page; title, meta description, canonical,
OG/Twitter present; JSON-LD validates; FAQ schema matches on-page content; Organization schema and its
ContactPoint present on every page.
