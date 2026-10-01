PDkef's first tagged release. The site has been live at https://pdkef.com since 2026-06-30 and has grown from a single merge tool into a suite of nine; this tag marks the point where all nine are functional, indexed, and documented.

## What it is

Free, open-source (MIT) PDF tools that run entirely in your browser. There is no server: files are never uploaded, nothing is stored anywhere but your own device, and the app works offline once loaded (installable as a PWA). No account, no page cap, no watermark, no paid tier.

## The nine tools

- **Merge** - combine PDFs, with drag-to-reorder and sort by name or date
- **Split** - extract page ranges into separate files
- **Edit Pages** - reorder, remove, rotate, add page numbers
- **Compress** - to a quality level or to a target size (e.g. 100 KB); tells you honestly when the target cannot be met
- **Sign** - draw, type or upload a signature; add text, dates, checkmarks and shapes; fill comb fields
- **Redact** - blackout, blur or whiteout, flattened so the removal is permanent
- **Protect & Unlock** - add or remove a password
- **PDF to Image** and **Image to PDF**

## Things worth knowing

- **Sign works in 20 languages and scripts**, including right-to-left Hebrew and Arabic (text boxes grow from a fixed right edge, joined letters connect properly), Devanagari, Bengali, Tamil, Telugu, Gurmukhi, Thai, CJK and Cyrillic. Fonts are embedded and subsetted on export, so what you see on screen is what is in the downloaded file. If a character has no glyph in any bundled font, the tool says so while you type, not after you download.
- **Drafts survive a crash.** Sign and Redact autosave your in-progress edits and the source file to local browser storage (IndexedDB) and restore them when you reopen the tool. No server involved.
- **Hebrew editions** of Compress, Merge and Sign are live under `/he/`.
- Strict Content-Security-Policy with `connect-src 'self'`, enforced in CI, as a backstop against any future code accidentally sending file bytes off-device.

## Under the hood

Astro static output with Preact islands, `@cantoo/pdf-lib` and `pdfjs-dist` for processing, fontkit for text shaping. See [CLAUDE.md](https://github.com/shlomsh/pdkef/blob/main/CLAUDE.md) for the design record and [THIRD_PARTY_LICENSES.md](https://github.com/shlomsh/pdkef/blob/main/THIRD_PARTY_LICENSES.md) for attributions.
