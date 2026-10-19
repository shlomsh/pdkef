---
id: "DEBT-57"
title: "Error and usage reports say what happened, which iPhone browser, and how the page load started"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# DEBT-57 · Error and usage reports say what happened, which iPhone browser, and how the page load started

*Filed 2026-10-19. Done 2026-10-19.* The daily read of 19 Oct could not answer two questions from the data
it had:

- Seven drop records on build 7636880 (`pdf_render load_document`, `redact details_read`, `redact
  list_objects`, all `no_frame`, `TypeError`, `ios-18+`) carried no hint of what happened. A chunk that
  did not load, a request that failed and a file the browser could not read all look the same.
- `ios-18+` read as "iOS 18" in the report. It meant an iPhone browser other than Safari (no `Version/`
  token) on iOS 18 or later, iOS 26 included. Redact opened a PDF cleanly in Safari on the iOS 26.2
  simulator, and in the Google app and Chrome on Shlomi's iPhone.
- Redact counted 178 page loads that opened a file against about 33 Vercel visitors that day, and
  nothing could say whether they were reloads or fresh arrivals.

## What changed

- **Drop records carry `cause`** (`src/lib/errorReport.ts` `dropCause`, `DROP_CAUSES` in
  `errorReportSchema.ts`): `module_load`, `network`, `file_read`, `memory` or `other`, matched on the
  device from each browser's wording. The message never travels. The stored field appends it after the
  engine, so older fields keep their first seven parts.
- **The engine bucket names iPhone browsers** (`engineBucket` in `src/site-lib/errorReportStore.ts`):
  `ios-chrome-18+`, `ios-google-18+`, `ios-firefox-18+`, `ios-edge-18+`, `ios-app-18+` for any other
  in-app browser. Safari stays `ios-<Version major>`.
- **The first usage event of a kind carries `nav`** (`NAVIGATION_TYPES` in `usageEventSchema.ts`, read
  in `productAnalytics.ts`): `navigate`, `reload`, `back_forward` or `prerender`, stored as
  `nav:<event>|<tool>|<type>` beside the once field. `errors:read` prints "How page loads that opened a
  file started" per tool.

All three are closed lists, checked on both sides; nothing identifies a person or a document and no
page load is linked to another. `docs/maintenance-telemetry.md` describes each.
