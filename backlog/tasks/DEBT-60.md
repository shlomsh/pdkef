---
id: "DEBT-60"
title: "Share PDF > Save to Files writes a stray 'text' file beside the PDF"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
depends_on: []
---

# DEBT-60 · Share PDF > Save to Files writes a stray "text" file beside the PDF

*Filed 2026-10-21*, found while QA-ing SEO-46 on the iPhone 17 Pro Simulator (iOS 26.2). Predates SEO-46.

On iPhone Safari, Share PDF > Save to Files says "Save as 2 Items" and writes the PDF plus a ~20-byte
file named `text` next to it. Every tool shares through `src/lib/usePdfShare.js` (Sign and Redact included),
which passes `title` (the file name) alongside `files` to `navigator.share`.

Done: the share call carries only what the sheet needs, a unit test pins the payload, and Save to Files
on the Simulator shows 1 item.

## Notes

- Cause (2026-10-21, iPhone 17 Pro Simulator, iOS 26.2, probe page): `navigator.share({ title, files })` gives
  Save to Files "2 Items"; `navigator.share({ files })` gives one item named after the file. The share sheet's
  preview row (name, "PDF Document", size) comes from the file in both cases, so `title` bought nothing.
- Fix: `usePdfShare.sharePrepared` shares `{ files }` only; `src/lib/usePdfShare.test.jsx` pins the payload.
  Sign and Redact share through the same hook, so one change covers every tool.
- Re-checked on the Simulator in the real Edit PDF flow: Save to Files shows "Save as form101_modified", one item.
- The Simulator's Files app still holds the older `text`, `text 2..4` files from before the fix.
