---
id: "SEO-24"
title: "New tool: make a PDF look scanned"
status: "blocked"
priority: "P3"
epic: "new-tools-gated"
phase: "later"
depends_on: ["SEO-06"]
legacy_state: "Open"
---

# SEO-24 · New tool: make a PDF look scanned

*Re-filed 2026-09-12* from `search-acquisition` into `new-tools-gated`, status `open` to `blocked`.

## Scope and acceptance

**`make pdf look scanned` is 40k-90k a month across a fragmented SERP of small utility sites** -
supertool, scanyourpdf, LookScanned - with no incumbent holding it. Technically it is the easiest tool in
this epic: render each page with pdf.js, apply a small random rotation, noise, a contrast and brightness
shift and a grayscale or sepia cast, re-embed. The `compressPdf()` rasterize-and-embed loop in
`src/lib/compress.js` is 90% of it.

**The decision to build it is made, and the reasoning is the one-stop-shop argument, recorded here so it
is not re-argued every time someone reads the ticket.** PDkef's positioning is a complete suite of the
popular PDF tools - free, private, open source, client-side, mobile-first. A visitor who arrives for a
niche tool and finds a suite is exactly the exposure the other nine tools need on a young domain. A gap
in the suite is a reason to go somewhere else, and that somewhere else has the rest of the tools too.

**The obvious use case is the honest one and the copy should say it.** Someone is asked for a scan, they
have a digital file and no scanner, and photographing a screen produces something worse than this. That
is a real, ordinary errand - it is the same shape as the errand PDkef was built for. The copy should be
matter-of-fact about it and should not coach anyone on making a document pass as something it is not.

**Design notes.** The effect needs to be adjustable or it is useless: rotation angle, noise amount,
contrast, grayscale versus sepia, with a preview. Randomise per page rather than applying an identical
transform to all of them, since a uniform tilt across forty pages reads as a filter. And the output is
images, with the usual cost - text stops being selectable - which here is arguably the point, but should
still be stated.

**Acceptance.**

- Real `src/lib/` logic with no network calls, sharing the rasterize-and-embed path with
  `src/lib/compress.js` rather than duplicating it.
- Adjustable controls with a live preview of at least one page before download.
- Per-page variation rather than one identical transform.
- The page states that the output is images and no longer contains selectable text.
- Copy is matter-of-fact about the errand and does not advise on passing a document off as physical.
- Registered in `src/data/tools.js`; How it works and FAQ with matching `<SeoSchema>`; no `noindex`;
  `npm run build && npm run preview` CSP pass.
