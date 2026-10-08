---
id: "RED-58"
title: "The two redaction guides speak the tool's words, as the Redact page now does"
status: "open"
priority: "P3"
epic: "redact"
horizon: "later"
depends_on: ["RED-46"]
---

# RED-58 · The two redaction guides speak the tool's words, as the Redact page now does

Filed from RED-46's recommendation. RED-46 retired the jargon on `/redact/` itself ("area", "element",
"text layer", "one image", "marked page", "bakes"; "flatten" kept once, explained, in one FAQ entry).
The two guides that hang off it still use it:

- `src/content/content-pages/blur-vs-blackout-vs-delete-pdf.yaml`: 21 lines with flatten, text run or
  text layer, plus the `flatten.svg` alt text.
- `src/content/content-pages/permanently-delete-text-from-pdf.yaml`: 7 lines.
- `src/i18n/cardMessages.ts`, `hebrewGuideCards` for the same two guides: still "השיטוח האוטומטי" and
  "רכיבים נבחרים... המגבלות", translations of the old English blurbs. They render only on `/redact/`,
  which has no Hebrew edition, so nothing shows today.

Both guides are "Discovered - currently not indexed" and have never been crawled (SEO-06), so this is
reader-facing polish, not a search lever, until one of them is crawled.

## Acceptance

- The same vocabulary as RED-46 on both guides: "saved as a picture", "box", "delete text or an image";
  "flatten" only where a guide explains the word, with SEO-41's two meanings kept on the blur guide.
- FAQ entries mirrored into JSON-LD by construction; `npm run test:seo` and `test:csp` green after a
  build.
- The two Hebrew guide cards follow the English blurbs, with Shlomi's read.
