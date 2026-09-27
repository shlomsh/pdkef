---
id: "RED-06"
title: "Quick or Keep the text: the person chooses knowing the cost; the engine downloads only on Keep the text"
status: "open"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-06 · Quick or Keep the text: the person chooses knowing the cost; the engine downloads only on Keep the text

*Filed 2026-09-27 from RED-01's record, [docs/redact-content-removal.md](../../docs/redact-content-removal.md).*

Keeping the text costs a one-time download and more work per edit, which matters on an older phone
or a slow network. The engine is 7.3 MB of WebAssembly: that is what the phone stores and compiles.
Compressed it is 2.8 MB (gzip -9, measured locally), but that is only what travels if the host
compresses `.wasm`, which is unverified for Vercel.

- Measure the real transfer size from a preview deploy first. If `.wasm` is served uncompressed, ship
  it compressed (or set the header) so the download is the smaller number. The choice line quotes the
  measured transfer size, never the local estimate. The person chooses; see "Two ways to save" in the record.

- The first box drawn shows one quiet line in the status row: Quick (nothing extra, covered pages
  saved as pictures) or Keep the text (a one-time download of the measured size, then offline; the rest of the page
  stays text). Drawing is never blocked; the document is in Quick until it is answered.
- Quick is highlighted, with the reason, only where the browser says the connection or device is slow
  (Save-Data, 2G/3G, `deviceMemory` of 2 or less). Otherwise neither is highlighted.
- Remembered per document and as the default for new ones (preference store). A control beside
  Download changes it; Quick's done state offers "Save again, keeping the text".
- The engine loads in a worker only after Keep the text is chosen, same-origin, never from a CDN, with
  progress in the status row, and is cached for offline use. Export before it is ready offers Quick
  now or waiting.
- `test:weight` and `test:lazy-modules` prove no page carries it up front. Pin `@embedpdf/pdfium`
  exactly; `test:licenses` covers MIT and Apache-2.0.
- Copy follows the voice guide: the cost in plain numbers, no jargon, no em dashes.

- **Lazy, and graceful offline.** Fetch the engine only when Keep the text is actually needed; never
  ahead, never offered in advance. Once fetched, it is carried across deploys the way
  `migrateFontPacks` carries fonts. Offline at that moment (or a failed/slow fetch, since
  `navigator.onLine` alone is not trusted), or evicted by the browser: one plain line says so and the
  save falls back to Quick; the next online save offers it again. Never a spinner that can't finish.
  Quick's path never touches the engine.

## Acceptance

- Opening Redact or Sign, or choosing Quick, downloads no engine bytes. Choosing Keep the text
  downloads it once; a second document offline keeps its text.
- Offline e2e (`e2e/offline/`): never fetched, then offline, choose Keep the text: the line says why
  and Quick saves. Fetched once, a new deploy's worker activates, then offline: Keep the text works.
- A throttled "slow 3G, Save-Data" run highlights Quick with its reason; a plain run highlights neither.
