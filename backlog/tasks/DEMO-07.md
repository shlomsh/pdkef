---
id: "DEMO-07"
title: "Lead with blur where the traffic actually lands"
status: "open"
priority: "P1"
epic: "landing-story-demo"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# DEMO-07 · Lead with blur where the traffic actually lands

## Scope and acceptance

**Blur is one of the strongest search drivers into this product, and the home page mentions it once.** `src/data/tools.js` carries 21 occurrences, `src/content/content-pages/blur-vs-blackout-vs-delete-pdf.yaml` is a whole page about it, and `src/pages/index.astro` has a single hit. The home page is the highest-authority page on the domain and it is nearly silent on the term.

Fix the vocabulary and the prominence, in that order.

**Vocabulary.** "Blur" is what people type. "Redact" is what lawyers say, and it is the word the tool currently leads with. Audit the user-facing strings on `/redact/` and the home page and make blur the primary term, with redact present as the secondary term for the people who do search it. Both should appear; the question is which one leads.

**What not to do.** Do not rename the `/redact/` route. It is indexed, it has inbound content-page links, and CLAUDE.md's URL canonicalization section documents exactly how a redirect there goes wrong (Vercel normalizes the trailing slash *before* matching redirects, which shipped broken once). The visible label, the `<h1>` and the copy can lead with blur without the URL changing.

**Prominence.** The blur story from DEMO-02, hiding a sensitive line on a medical or financial document before sending it, belongs on the home page as one of the two lead use cases, not as a tile in a grid of nine tools.

**Acceptance.** The primary keyword still sits in the `<title>`, the single `<h1>` and the meta description of `/redact/`, per the SEO invariants. `npm run test:seo` passes and the FAQ schema still matches the on-page content it mirrors. No route changes and no new redirects. Record the before and after term counts on the home page in this ticket so the change is measurable rather than asserted.
