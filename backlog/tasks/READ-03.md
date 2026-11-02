---
id: "READ-03"
title: "Highlight PDF: the tool at /highlight-pdf/, highlights with a comment on each, and its page"
status: "in_progress"
priority: "P2"
epic: "highlight-pdf"
horizon: "now"
order: 2
depends_on: ["READ-01", "READ-02"]
---

# READ-03 · The Highlight PDF tool and its page

*Filed 2026-11-01.* Design record: [docs/highlight-pdf.md](../../docs/highlight-pdf.md). Lands in the same
push as READ-04, so highlighting is never missing from the product.
The behaviour is [READ-01](READ-01.md)'s requirements (R1 to R62); this ticket builds them.

## Outcome

A student opens a paper at `/highlight-pdf/`, on desktop, iPad or phone, digital or scanned. The page fills
the screen. They swipe along a line and get the band, with nothing opening at its end; resting on or tapping
a highlight offers its colors, the underline style, Comment and Delete. Comment opens a card in the margin
beside the passage (a sheet on a phone); Comment over an uncolored line lays the band in the last color
first. A comment exists only on a highlight. Download writes standard annotations that open in any viewer and come back editable here and in
Sign. Color and underline style are remembered per document and become defaults for new ones.

## Touch at launch

A file opens with the marker armed on every device; a tap or click on Marker disarms it and another arms it,
and it stays armed between marks; there is no Stop button and no bar at the foot of the screen (R1, R50).
While armed on touch, the toolbar says "Swipe to highlight" (R51); one finger marks only sideways along a line
of text and otherwise scrolls or moves the page (R52), and two fingers always zoom and move it (R62). A tap on
a highlight picks it and opens the one panel under the toolbar (R7, R47). READ-07 later replaces arming with
long-press and drag.

## Acceptance

- [ ] New island `src/tools/highlight/` over the shared shell and editor core; no copy of Sign code.
- [ ] Static SEO shell: title and H1 on "Highlight PDF", description, how-it-works, FAQ (how to highlight,
  removing a highlight, scanned pages, Mac and iPad, comments in other viewers) and matching JSON-LD, in
  voice, every claim checked against the code.
- [ ] Registry entry in `src/data/tools.js`, the non-slash redirect pair in `vercel.json`, the tool count
  updated in CLAUDE.md, README and site copy.
- [ ] The toolbar and panel decisions are pure functions with unit tests, each seen failing first.
- [ ] Export then read-back is lossless, in Highlight PDF and in Sign (one round-trip e2e).
- [ ] `npm run build && npm run preview` checked for CSP; `test:seo`, `test:redirects`, `test:css` pass.

## Progress (2026-11-02, live at da93d162)

- Done: on a page with no text layer the swipe's own sideways direction picks the mark's reading
  direction (leftward is right to left), latched on the first clear sideways move, so a diagonal drag
  across lines in a Hebrew scan bands the right lines (ff50509d).
- Done: the underline thickness menu draws its lines again and tints the picked one (e68367f3). Guards
  added the same day so a deleted rule or an unsized box cannot hide controls again: the orphaned
  selector check, the sized-host check in `test:css`, and `expectControlsSized` in the toolbar e2e
  (5441d512, 01ab2ab7, 5816c96f).
- Done: the cord tucks into the card once the page scrolls past 12 px, leaving the bead's tip; a tap on
  the tip brings it back, and the next pull opens full screen (145f83ee).
- Done: leaving the lamp returns focus to the cord only for a keyboard reader, so no focus ring shows
  around the knob after a tap or click (0f96a10b).
- Done: Highlight reports the same funnel steps as Sign and Redact (page view, file accepted, first
  edit, operation started, result ready, failed), and a print counts as a result (b1bcb3b9).
- Done: the Feedback link sits at the end of the file line, as in Sign, and never in the lamp
  (da93d162). `FeedbackButton` moved to `src/editor-ui/`; Sign keeps a thin wrapper.
- Checked in Chromium at desktop, 402 and 375 px, and on the iPhone 17 Pro iOS 27 simulator: the cord tucks
  on scroll, a tap on the tip brings it back with no focus ring, the next tap opens the lamp, the lamp
  has no Feedback link, and one tap on Exit leaves it with the cord back at rest.
