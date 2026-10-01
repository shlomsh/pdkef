---
id: "RED-26"
title: "Delete: remove an image on every page it appears, for watermarks"
status: "in_progress"
priority: "P2"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-26 · Delete: remove an image on every page it appears, for watermarks

*Shlomi, 2026-09-28: a watermark image at the top of every page should be really gone. With covered pages
saved as pictures (RED-18's decision), Delete is the exact tool: it removes the object and keeps the page
as text.*

A watermark is usually one image object that every page draws. When Delete targets an image that other
pages also draw, one quiet line offers "This image is on 12 pages. Remove it everywhere?" (exact, since it
is the same object). Choosing it removes the image's draw from every page and the image itself from the
file.

## Acceptance

- On `spikes/red-18/corpus/shared-header-image-full.pdf`, Delete on page 1's logo with "everywhere": no
  page draws it, the image object is gone from the saved file, and every page's text is unchanged.
- Without "everywhere", only page 1 changes.
