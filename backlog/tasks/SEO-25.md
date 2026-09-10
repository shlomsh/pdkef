---
id: "SEO-25"
title: "A before-and-after preview on Compress, so quality is shown rather than promised"
status: "open"
priority: "P3"
epic: "search-acquisition"
phase: "later"
depends_on: ["SEO-05", "SEO-13"]
legacy_state: "Open"
---

# SEO-25 · A before-and-after preview on Compress, so quality is shown rather than promised

## Scope and acceptance

**Deferred deliberately: this is product work wearing an SEO ticket's clothes**, and the copy tickets
that share its subject (SEO-05, SEO-13) are cheaper and land first. Pick it up only once they have and
the standings table shows what they moved.

The research observes that supertool ranks at the top of the quality-focused compression queries partly
on a real side-by-side preview of original against compressed output before download. We already render
pages with pdf.js on both sides of the operation, so the pieces exist.

**Why it is worth more here than it is for a server-side competitor.** Our compressor rasterizes, and
SEO-05 makes the page say so plainly. That honesty costs us the `without losing quality` query. A preview
turns the disclosure into something a visitor can act on: they see what 100KB actually looks like for
*their* document and decide whether to accept it or raise the target. That is a better answer than either
a promise or a warning, and it is the sort of thing only a client-side tool can offer, because the file is
already on the device.

**Constraints.** The gesture golden rule applies to a split-slider: mutate the DOM during the drag, commit
state once on release, and the static check `scripts/check-gesture-golden-rule.js` enforces it. Rendering
two pages at preview resolution costs memory and time on a phone, so it must be opt-in or lazy rather than
part of the default compress flow, and the page-weight budget still applies.

**Acceptance.**

- A visitor can compare the original and the compressed result for at least one page before downloading.
- The comparison does not run by default on mobile unless measurement shows it is affordable there; that
  measurement is recorded.
- Any gesture path routes through `src/editor/`'s controller and passes the golden-rule check.
- `npm run test:weight` and the CSP `build && preview` pass.
- Effect on the compress cluster's CTR recorded in the SEO-02 table at the following refresh.
