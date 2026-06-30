# PDkef — Free Online PDF Tools Suite

I needed to merge, split, and compress a few PDFs one day and went looking for a tool to do it. Every result was the same story: upload your files to some server, wait, hope they get deleted, dodge three "download" buttons that were actually ads, and maybe hit a paywall on the third edit. For files that are often private — contracts, tax forms, ID scans — that's a bad trade. So I built the tool suite I actually wanted: one that edits PDFs entirely on your device and never sends a single byte anywhere.

That's the whole premise of PDkef. No server, no uploads, no accounts, no limits, no watermark, no catch. It started as just a merger, but is now evolving into a full suite of client-side PDF tools (Merge, Split, Remove Pages, Compress, PDF to Image).

## Why it's built this way

**No server, by design — not by accident.** This isn't a backend that happens to be fast; there is no backend at all. The app is a static site. When you drop your PDFs in, the merge runs in your browser tab using WebAssembly-backed PDF libraries, and the result never leaves your machine. I treat this as the central constraint of the project — if a future version of me is ever tempted to add a "quick" API call, that's a bug, not a feature.

**Private enough to work offline.** Because there's no server in the loop, the app works fully offline once it's loaded, and it's installable as a PWA. Your PDFs are yours; the tool just happens to live in a browser tab.

**Free, actually free.** No signup wall, no "3 free merges then pay," no watermark stamped across your output. It's free because it costs me almost nothing to run — static files on a CDN, no server to scale, no storage to pay for.

**Open source so you don't have to take my word for it.** Every claim above — no uploads, no tracking, no network calls — is something you can verify yourself by reading the code, not something you have to trust a privacy policy to be true. MIT licensed, fork it, audit it, run it yourself.

**Fast, because the architecture stays lean.** The site is built with Astro in islands mode — the SEO content, FAQ, and how-to sections are plain static HTML with zero JavaScript, and the merge tool itself is the *only* interactive piece, a small Preact island. That split keeps the page fast and keeps the surface area for bugs (and bloat) small.

## How it works

1. Choose a tool from the Hub (Merge, Split, Compress, etc.).
2. Select or drag-and-drop your PDF files.
3. Configure your options (e.g., reorder pages, set compression level).
4. Click the primary action button and download your processed files instantly.

All processing happens locally using browser-compatible PDF libraries (like [@cantoo/pdf-lib](https://github.com/cantoo-scribe/pdf-lib) and `pdfjs-dist`); the app is a static site with no backend.

## Local development

```bash
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
npm run preview  # preview the production build
```

## Tech stack

- [Astro](https://astro.build/) — static site generation (islands architecture; zero JS for the SEO content)
- [Preact](https://preactjs.com/) — interactive islands (the PDF tools themselves)
- [@cantoo/pdf-lib](https://github.com/cantoo-scribe/pdf-lib) — client-side PDF manipulation
- [SortableJS](https://github.com/SortableJS/Sortable) — drag-and-drop reordering
- [pdfjs-dist (PDF.js)](https://github.com/mozilla/pdf.js) — page thumbnails and parsing
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) — offline support / installable PWA

All runtime dependencies are MIT or Apache-2.0 licensed and make no network calls of their own — I checked, on purpose, because that guarantee only holds if every dependency upholds it too.

See [CLAUDE.md](./CLAUDE.md) for architecture notes.

## License

MIT — see [LICENSE](./LICENSE).

## Credit

Built by [Shlomi Shemesh](https://github.com/shlomsh). If PDkef saved you a trip to some sketchy upload site, that's the whole point — feel free to star the repo, file an issue, or send a PR.
