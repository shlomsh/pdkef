# PDkef - Free Online PDF Tools Suite

PDkef began with a real errand. My partner needed to download all her course slides into a single PDF before an exam, and separately to sign a summer-camp consent form that had arrived over WhatsApp. We went looking for tools. One capped the number of pages. One wanted a paid subscription plus a Windows install. One just felt like a place you would not want to send personal documents. So I built the tool I wanted for myself, and named it PDF + *kef* ("fun" in Hebrew) = PDkef.

Then I wanted to share it. I believe simple tools like these should be free and accessible to everyone, so nobody has to hunt for a decent one or hand personal documents to a sketchy site. That's the whole premise. No server, no uploads, no accounts, no limits, no watermark, no catch. Your files never leave your device. It's free and open source, and stays that way because a tool like this is cheap to build and nearly free to run. It started as a merger and is now a full suite of client-side PDF tools (Merge, Split, Edit Pages, Compress, PDF to Image, Image to PDF, Sign, Protect & Unlock, Redact).

## Why it's built this way

**No server, by design - not by accident.** This isn't a backend that happens to be fast; there is no backend at all. The app is a static site. When you drop your PDFs in, the merge runs in your browser tab using WebAssembly-backed PDF libraries, and the result never leaves your machine. I treat this as the central constraint of the project - if a future version of me is ever tempted to add a "quick" API call, that's a bug, not a feature.

**Private enough to work offline.** Because there's no server in the loop, the app works fully offline once it's loaded, and it's installable as a PWA. Your PDFs are yours; the tool just happens to live in a browser tab.

**Your work survives a crash, without a server.** The Sign and Redact editors autosave your in-progress edits (the annotations and redaction boxes, plus the source file) to local browser storage as you work, and silently restore them when you reopen the tool. Most online PDF editors can't offer crash recovery without keeping a copy of your file on their servers; because PDkef stores the draft on your own device, you get "pick up where you left off" without a single byte leaving your machine. The draft is cleared only when you choose Start over.

**Free, actually free.** No signup wall, no "3 free merges then pay," no watermark stamped across your output. It's free because it costs me almost nothing to run - static files on a CDN, no server to scale, no storage to pay for.

**Open source so you don't have to take my word for it.** Every claim above - no uploads, no tracking, no network calls - is something you can verify yourself by reading the code, not something you have to trust a privacy policy to be true. MIT licensed, fork it, audit it, run it yourself.

**Fast, because the architecture stays lean.** The site is built with Astro in islands mode - the SEO content, FAQ, and how-to sections are plain static HTML with zero JavaScript, and the merge tool itself is the *only* interactive piece, a small Preact island. That split keeps the page fast and keeps the surface area for bugs (and bloat) small.

## How it works

1. Choose a tool from the Hub (Merge, Split, Compress, etc.).
2. Select or drag-and-drop your PDF files.
3. Configure your options (e.g., reorder pages, set compression level).
4. Click the primary action button and download your processed files instantly.

All processing happens locally using browser-compatible PDF libraries (like [@cantoo/pdf-lib](https://github.com/cantoo-scribe/pdf-lib) and `pdfjs-dist`); the app is a static site with no backend.

## Local Development

Prerequisites:
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm` (comes with Node.js)

To run the project locally:

```bash
# 1. Clone the repository
git clone https://github.com/shlomsh/pdkef.git
cd pdkef

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

The site will be available at `http://localhost:4321`.

Additional commands:
```bash
npm run build    # Build the production site to dist/
npm run preview  # Preview the production build locally
npm run check    # Run TypeScript and Astro checks
npm run lint     # Run ESLint to check for code issues
```

## Tech stack

- [Astro](https://astro.build/) - static site generation (islands architecture; zero JS for the SEO content)
- [Preact](https://preactjs.com/) - interactive islands (the PDF tools themselves)
- [@cantoo/pdf-lib](https://github.com/cantoo-scribe/pdf-lib) - client-side PDF manipulation
- [SortableJS](https://github.com/SortableJS/Sortable) - drag-and-drop reordering
- [pdfjs-dist (PDF.js)](https://github.com/mozilla/pdf.js) - page thumbnails and parsing
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) - offline support / installable PWA

All runtime dependencies are MIT or Apache-2.0 licensed and make no network calls of their own - I checked, on purpose, because that guarantee only holds if every dependency upholds it too.

See [CLAUDE.md](./CLAUDE.md) for architecture notes.

## Contributing

Code contributions, bug reports, and feature requests are always welcome! Whether you're fixing a typo, adding a new tool, or improving performance, your help is appreciated. 

If you'd like to contribute code:
1. Fork the repository.
2. Create a new branch for your feature or bug fix (`git checkout -b feature/my-new-feature`).
3. Make your changes and test them locally.
4. Commit your changes with clear messages (`git commit -am 'Add some feature'`).
5. Push to the branch (`git push origin feature/my-new-feature`).
6. Open a Pull Request.

If you find a bug or have an idea for a new feature, please [open an issue](https://github.com/shlomsh/pdkef/issues).

## License

MIT - see [LICENSE](./LICENSE).

## Credit

Built by [Shlomi Shemesh](https://github.com/shlomsh). If PDkef saved you a trip to some sketchy upload site, that's the whole point - feel free to star the repo, file an issue, or send a PR.
