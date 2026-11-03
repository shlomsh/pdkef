---
id: "SITE-45"
title: "The /drive/ voice, carried to the other quiet pages: doodle that shows the mechanism, paper stickers for the promises"
status: "in_progress"
priority: "P3"
epic: "polish"
horizon: "next"
depends_on: []
needs: "Pick which pitches below to build (step 1)"
---

# SITE-45 · The /drive/ voice on other pages

*Drafted 2026-11-03, after Shlomi saw the new `/drive/` on an iPhone and asked for more of it.*

## What the voice is

Three parts, taken from `/drive/` (`src/pages/drive.astro`), so the next page copies a recipe and not a mood:

1. **A hand-drawn picture of the real mechanism**, not decoration: a cloud, a dashed trail, a laptop with a
   page on it. Wobbly strokes in `--color-text`, fills from the paper and mint tokens, small clay sparkles,
   the trail moving only when motion is allowed. Pencil, never glow (reader taste, READ-13/14).
2. **Paper stickers for the promises**: Private, Free, Open source, Local. Slightly tilted, uneven corners,
   one citron, one mint, two paper. One short sentence each, verified against the code.
3. **One warm line under the h1**, plain facts: "From Drive to your device, and no further."

## Where it fits, and where it does not

Fits: pages a person reads once and keeps no notes on, where a smile costs nothing.

| Page | The picture | Stickers | Risk |
| --- | --- | --- | --- |
| `/open/` | a page arriving at the phone, four tools around it | the four tools are the stickers (Sign, Redact, Highlight, Compress) | none: same sheet and family as `/drive/` |
| `/404` | a page wandering off with a pencil behind it | the tools grid becomes stickers | none: noindex |
| `/about` | the pencil, the partner's slides, the consent form: the origin story in one doodle | the four promises | copy stays as written; the picture sits above it |
| `/privacy` | a file that goes nowhere, a dashed trail that stops at the device edge | "The short version": four stickers above the long text | every sticker line is checked against the page's own text, Drive exception included |
| `/contact`, `/licenses` | a small doodle in the header only | none | keep them light |
| `/install-pdf-app/` and the how-to guides | a header figure in place of the lucide icon tile | none | SEO surface: static SVG, no CLS, `test:weight` |

Leaves alone, by decision: the home first screen (one composed unit, nothing inserted), any tool's first screen
and loaded state, the editor chrome, and `/redact/`'s frozen search surface (its URL, titles and intro copy).
Tool done-states stay with the cross-tool hand-off work, not here.

## Plan

0. **Step 0, no new look: make `/drive/` a recipe.** Its doodle and stickers are inline in one page's scoped
   style. Extract `PromiseStickers.astro` (takes up to four `{ kind, line? }` items; colour comes from the
   kind, tilt from position) and `Doodle.astro` (named figures sharing the stroke rules and the
   reduced-motion rule), and let `/drive/` use them. The four promises live in one place
   (`src/data/promises.js`) so "free", "open source" and "local" cannot drift between pages; a page may
   reword a line but not add a fifth promise. Both components use scoped CSS and no utilities, so no entry
   sheet needs touching.
1. **Pitches first, as Shlomi's rule says.** Before drawing anything: the pitches below (picture, line,
   sticker drafts per page). Shlomi picks; unpicked pitches drop off the ticket.
2. **One polished build per picked page**, in this order: `/open/`, `/404`, `/about`, `/privacy`. The first two
   prove the components on pages with no search or legal weight; the last two carry the copy risk.
3. **Hebrew last.** `/he/about` and `/he/privacy` are reviewed translations; the sticker lines get a Hebrew
   draft marked as AI draft in `reviewNotes`, and tilt and sparkles use logical properties so RTL mirrors.
   Pages with no Hebrew edition get no Hebrew sticker.

## Pitches (step 1, for Shlomi to pick from)

Each picture shows what the page is about, drawn with the same pencil rules as `/drive/`. Sticker lines are
drafts; a fresh reviewer checks every one against the code and the page's own text before it ships.

1. **`/open/`.** *Picture:* a PDF page drifting down onto a phone, a dashed trail behind it, four small
   tools waiting around it (a pen, a black bar, a highlighter, two shrinking arrows). *Line under the h1:*
   "It's open on your device. Pick what to do with it." *Stickers:* the four existing choices, each a
   sticker in its own tone: Sign it (Fill in and sign), Redact it (Black out private parts), Highlight it
   (Mark what matters), Compress it (Make the file smaller). Behaviour and the hand-off stay exactly as is.
2. **`/404`.** *Picture:* a page with a pencil tucked behind its ear, walking off the edge of the sheet,
   dashed footprints behind it. *Line:* "This page wandered off. The tools are right here." *Stickers:*
   the twelve tool names as small tilted tags in place of today's grid; no promises here.
3. **`/about`.** *Picture:* a stack of course slides and a consent form, each with a dashed trail into one
   PDF, a pencil resting on top. *Line:* "I built it for an errand, then wanted to share it." (the page's
   own story, nothing added). *Stickers:* all four promises: Private ("Your PDFs are never uploaded."),
   Free ("No account, no page limit, no watermark."), Open source ("Read every line on GitHub, MIT
   licensed."), Local ("It runs in your browser, like a desktop app, with nothing to install.").
4. **`/privacy`.** *Picture:* a file with a dashed trail that stops at the edge of the device; the one
   trip to Google drawn small and separate, only on `/drive/`'s side. *Line:* "The short version, then
   the details." *Stickers (three, above the long text):* Private, Local, Open source, with lines taken
   from the page's own sentences (drafts and the 28-day expiry included; the Drive exception is named).
5. **`/contact`, `/licenses`** (optional, header doodle only): an envelope with a pencil; a row of small
   licence cards. **`/install-pdf-app/` and the how-to guides** (optional): the header figure replaces the
   icon tile, e.g. a page being tucked into a home screen. Lowest priority; skip unless asked.

## Guardrails

- Static HTML and CSS only: no JS on the SEO surface, no IntersectionObserver reveal, no new script resources.
- Colours from `:root` tokens only; declare a token before using a utility for it.
- Pictures are `aria-hidden` SVG; the sentence beside each sticker carries the meaning.
- `prefers-reduced-motion`: the trail and any wiggle stop; the tilt may stay.
- Voice: first person is welcome, no em dashes, no competitor names, no "honest" disclaimers. Every claim
  checked against the code. Only four promises: private, free, open source, local; no new ones.
- Not every page gets all four stickers: three pages with the same four lines would be a template, not a voice.
- The ratchets only go down: CSS duplication, dead bytes and size records stay put (the extraction in step 0
  should lower them, not raise them).

## Acceptance

- `/drive/` renders unchanged to the eye (screenshots at 375, 390, 768 and 1280 before and after step 0).
- Each picked page: screenshots at those four widths, no horizontal scroll, the first action visible without
  scrolling on a 375x812 phone, `test:css`, `test:weight`, `test:seo`, `test:csp` green.
- Sticker lines checked against the code by a fresh reviewer who quotes the line each objection applies to.
- Shlomi has seen each page on his iPhone before it lands.

## Progress

- 2026-11-03: step 0 landed (`Doodle`, `PromiseStickers`, `src/data/promises.js`; `/drive/` uses them).
- 2026-11-03: `/open/` (page-to-phone figure, tool buttons as tilted stickers) and `/404` (page-walking-off
  figure, tool links as tilted tags) built from pitches 1 and 2. Both pages were looked at on a 375px viewport;
  the file-ready state of `/open/` (buttons, not links) is covered by the existing unit tests, not by eye.
- 2026-11-03: `/about` (slides-to-pdf figure, four stickers) and `/privacy` (stays-on-device figure, three
  stickers: private, local, open source) built from pitches 3 and 4. A fresh reviewer checked every sticker and
  tagline against `staticPages.js` and the code: no objections; the one wording note was taken ("never sent
  anywhere else", the page's own phrase). No Hebrew edition of either page exists, so step 3 has nothing to do
  for them. Waiting on Shlomi's look on an iPhone; `/contact`, `/licenses` and the guides stay optional.
