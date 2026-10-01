---
id: "DEMO-11"
title: "The O on the Hebrew home page"
status: "open"
priority: "P3"
epic: "search-and-languages"
horizon: "later"
depends_on: ["DEMO-10", "LOC-03"]
---

# DEMO-11 · The O on the Hebrew home page

*Deferred 2026-10-01 by Shlomi:* Hebrew traffic is too thin today to justify a Hebrew-only beat 4.
This waits on LOC-03's 2026-11-06 read deciding whether Hebrew is worth investing in; only then does
beat 4 come back to him as a call.

## Scope

The O ([docs/home-the-o.md](../../docs/home-the-o.md)) renders on the English home page only; `/he/`
keeps the founder-story card. Bring it to Hebrew:

- A beat 4 of its own: the ring is the O of "Open source", and the Hebrew phrase has no round first
  letter. Decide what the ring becomes there, with Shlomi, before building.
- The copy in `src/content/localized-home/he.yaml`, reviewed like the rest of the Hebrew home page,
  and `homeContent.theO` added to `HOME_SOURCE_FIELDS` so the edition goes stale when English changes.
- RTL: the geometry mirrors through `--dir`, but nothing has rendered it yet. Check every beat, the
  flight and the landing at 390x844, 820x1180, 1440x900 and 852x393 in Chromium and WebKit.
- Firefox: look at the `text-box` fallback margins in a real Firefox (still version there).

## Acceptance

- `/he/` renders The O in place of the founder card, with its own beat 4, and the stale-edition check
  covers its copy.
- No horizontal overflow, no console errors, and the paper plane lands after the last word in RTL at
  every size above, in Chromium and WebKit.
