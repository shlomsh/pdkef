---
id: "MERGE-22"
title: "Merge takes photos too, each one a page, so PDFs and photos picked together have a home"
status: "done"
priority: "P2"
epic: "polish"
depends_on: []
---

# MERGE-22 · Merge takes photos too, each one a page

*Filed 2026-10-12* from SITE-42's decision D3. Shlomi asked which tools take both PDFs and photos:
none takes them together. Merge rejects anything that is not a PDF
(`src/tools/merge/PdfMergeTool.tsx`, `addFiles`, `deriveFileKind(f) === 'pdf'`), Edit PDF Pages keeps
only `application/pdf`, Image to PDF takes only JPEG and PNG, and Compress takes either kind but one
file at a time. So on the home page a mixed pick says "PDFs and photos go to different tools" and
opens nothing (SITE-42, option 1).

## What it does

Merge accepts JPEG and PNG beside PDFs. Each photo becomes one page in the set, in pick order,
movable and removable like any other page, and the output is one PDF. Once Merge takes both, the
home launcher sends a mixed pick straight to Merge (a one-line change to `routeFiles`, plus its
table test), and Merge's own picker and drop target accept photos.

## Open questions for the build

- Page size for a photo page: reuse Image to PDF's own sizing (`src/tools/image-to-pdf/imageToPdf.js`)
  rather than a second rule.
- The default output name when the first file is a photo (`merged_<first>.pdf` today).
- Draft memory: a photo in a saved set needs the same bytes-derived entry id as a PDF.

Built inside SITE-42's branch at Shlomi's request (2026-10-12). Decided while building:
- Page size is Image to PDF's rule, shared through `src/lib/imagePage.js`; a JPEG's EXIF orientation
  becomes the page's rotation, so phone photos come out upright in both tools.
- The output name stays `merged_<first>.pdf`; a photo-first set is `merged_<photo name>.pdf`.
- A saved set stores each photo's real type (`mimeTypeOf`), so an untyped `.jpg` restores as a photo.
- The home toolbar offers Merge for photos only alongside a PDF.
