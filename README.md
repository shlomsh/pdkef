# pdfmerge — Merge PDF Online Free

A free, open-source tool to **merge PDF files online** — entirely in your browser. Upload your PDFs, reorder them by name or date (or drag them by hand), and download a single combined PDF. **Nothing is ever uploaded to a server.**

## Why pdfmerge

- **100% client-side** — files never leave your device; the merge happens with JavaScript in your browser tab.
- **Free, no signup, no watermark, no limits.**
- **Private** — works fully offline once loaded (installable as a PWA).
- **Works everywhere** — Chrome on macOS, Windows, Android, and iOS.
- **Open source, MIT licensed.**

## How it works

1. Select or drag-and-drop your PDF files.
2. Reorder them — by filename (A–Z / Z–A), by date, or by dragging them manually.
3. Click **Merge** and download the combined PDF.

All processing happens locally using [@cantoo/pdf-lib](https://github.com/cantoo-scribe/pdf-lib); the app is a static site with no backend.

## Local development

```bash
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
npm run preview  # preview the production build
```

## Tech stack

- [Astro](https://astro.build/) — static site generation (islands architecture; zero JS for the SEO content)
- [Preact](https://preactjs.com/) — the one interactive island (the merge tool itself)
- [@cantoo/pdf-lib](https://github.com/cantoo-scribe/pdf-lib) — client-side PDF merging
- [SortableJS](https://github.com/SortableJS/Sortable) — drag-and-drop reordering
- [pdfjs-dist (PDF.js)](https://github.com/mozilla/pdf.js) — page thumbnails
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) — offline support / installable PWA

All runtime dependencies are MIT or Apache-2.0 licensed and make no network calls of their own.

See [CLAUDE.md](./CLAUDE.md) for architecture notes.

## License

MIT — see [LICENSE](./LICENSE).
