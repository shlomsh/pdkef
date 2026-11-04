---
id: "SCAN-12"
title: "Scan next: a short, very visual video of camera to WhatsApp on /scan-to-pdf/"
status: "open"
priority: "P2"
epic: "scan-next"
horizon: "now"
order: 11
depends_on: ["SCAN-08"]
---

# SCAN-12 · Show the whole job in a few seconds

*Opened 2026-11-03.* Shlomi: once the flow is done, a short, very visual video on the tool page.

## Outcome

- A clip of about 8 to 12 seconds, recorded on a real phone from the shipped tool: the page found, taken by
  itself, the page turned, Done, the size, Share, WhatsApp. No voice-over, no captions needed to follow it.
- On `/scan-to-pdf/` as a plain `<video muted loop playsinline>` with a poster frame, width and height set,
  `preload="none"` or metadata, and served same-origin (the CSP's `default-src 'self'` covers it). No script
  on the SEO surface; nothing re-parented; no layout shift.
- Small: H.264 MP4 (plus WebM if it saves bytes), within the page-weight budget; runtime-only for the service
  worker, like the scan guide photos (`RUNTIME_ONLY_IMAGE_DIRS`).
- Where it sits is decided with the tool-pages hero ("Show the verb", `docs/tool-hero-show-the-verb.md`):
  next to or in place of `ScanVerb`.
- `prefers-reduced-motion` shows the poster without autoplay.

## Acceptance

- [ ] The clip plays on iPhone Safari and Android Chrome, and the first screen does not move when it loads.
- [ ] `test:weight`, `test:csp`, `test:seo` and `test:precache-budget` pass.
