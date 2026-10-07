---
id: "RED-57"
title: "Redact export never embeds an empty page picture on a large page"
status: "in_progress"
priority: "P1"
epic: "redact"
horizon: "now"
depends_on: []
---

# RED-57 · Redact export never embeds an empty page picture on a large page

*Found 2026-10-07 in the daily error read.* Redact failed 5 of 18 export runs on 7 Oct (2 reports,
Chromium 146, build d1feb33). The resolved frames end in pdf-lib's `JpegEmbedder.for`, which reads
`getUint16(0)` from zero bytes. `rasterizePageToJpeg` (`src/editor/adapters/pdf/rasterPage.js`)
renders every page at `RASTER_SCALE` 2.5 with no size cap. When the canvas is larger than the browser
allows, `toDataURL` returns `data:,` and we embed nothing. The cause is inferred from the frames and
the code; the page size in those reports is not known.

The read also called it an ENC-02 regression, because ENC-02's registry entry matches any pdf-lib error
at Redact export.

## Scope

- `rasterizePageToJpeg` lowers the scale when the canvas at `RASTER_SCALE` would exceed a pixel-area
  or side-length cap that every supported browser accepts, and hands `paint` a viewport whose `scale`
  is the one used.
- Redact's `paintBoxes` takes its scale from that viewport, never from `RASTER_SCALE`.
- An empty encode (`data:,`) throws a clear error, and is never passed to pdf-lib as bytes.
- `docs/error-known-items.json` gets a RED-57 entry, listed before ENC-02, so this fingerprint reads as RED-57.

## Acceptance

- [ ] A unit test on an oversized page fails before the fix and passes after.
- [ ] Redaction boxes still land where they were drawn on a capped page (unit test).
- [ ] The 7 Oct fingerprint matches RED-57, not ENC-02 (`scripts/errors-known.test.mjs`).
- [ ] A full UTC day on a build with the fix and no RED-57 report.
