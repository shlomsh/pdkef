---
paths:
  - "src/tools/**"
  - "src/shell/**"
  - "src/lib/**"
  - "e2e/tool-*.spec.js"
  - "e2e/tool-*/**"
  - "e2e/handoff/**"
  - "docs/ux-design-guidelines.md"
  - "scripts/check-module-boundaries.mjs"
  - "scripts/module-boundaries-allowlist.json"
  - "docs/module-boundaries.md"
---

Loaded when working on any of the ten tool islands, the shared `src/shell/` chrome, or `src/lib/`.
Sign and Redact's shared headless editor core is `editor.md` instead; fonts and text export are
`fonts-and-text.md`; styling boundary is `styling.md`. This file holds draft persistence, the other
tools' own logic, the cross-tool hand-off pattern, and the UX guideline that every tool review starts
from.

The target folder layout for `src/`, the dependency rules between tools, shell, editor-ui, editor and
lib, and the evidence behind both are in
[docs/module-boundaries.md](../../docs/module-boundaries.md) (ARCH-15), enforced by
`npm run test:module-boundaries` (`scripts/check-module-boundaries.mjs`,
`scripts/module-boundaries-allowlist.json`); read it before moving a file between folders, including
into or out of `src/tools/merge/` or `src/editor/`.

## Draft persistence (flagship, on-device) - one memory space (MEM-01)

`src/lib/drafts/draftStore.js` is a dependency-free IndexedDB wrapper (DB `pdf-toolkit-workspace`,
store `workspace`, keyPath `tool`) holding **one memory space**, not a per-tool draft: the unit is an
**entry**, keyed by content hash (`sourceIdForBytes`/`sourceIdForFiles`), carrying its source bytes
once and a `work` map of what every tool has done to it (`{ sign: {...}, redact: {...} }`), so the
same PDF signed and then redacted keeps both. A tool's "current" file is a localStorage pointer
(`setCurrentEntry`/`readCurrentEntryId`/`hasDraftHint`/`readDraftMeta`), not a fixed slot - opening a
different file moves the pointer and touches nothing else. Eviction is recency only, six entries,
regardless of whether an entry carries work; age expiry stays 14 days per entry
(`draftPolicy.js`, one `savedAt`). No-op when IndexedDB is unavailable. A legacy pre-MEM-01 per-tool
record is folded into its entry on first access (`migrateLegacyDraft`), once per module lifetime.

`useDraftPersistence.js` debounce-saves while `status === 'editing'`, flushes on
`visibilitychange`/`pagehide`, restores silently on mount by following the pointer (the entry is the
source of truth; download does not clear it), and "Replace file" now clears only this tool's work on
the pointed entry - the file, its bytes, and every other tool's work on it stay in recents. Sign and
Redact share a `loadPdf()` for fresh picks and restore, and call `seedUniqueId()` (in `sign.js`) after
restore so new ids don't collide. Nothing is uploaded. It is marketed as crash recovery on the sign,
redact and home pages, with one FAQ entry each mirrored into `<SeoSchema>`.

## Other tools and `src/lib/`

- **Merge flow**: after a merge the "Merge PDFs" button goes grey (`.is-done`) and focus moves to
  "Download PDF"; any file mutation (add, remove, reorder, sort) resets to `'idle'` and revokes
  `downloadUrl`. Reordering is SortableJS on the DOM list; on drop the DOM order is read back into
  Preact state, which stays the single source of truth.
- **FAQ disclosure** on tool pages is a details/summary whose summary holds the hero text; a click
  interceptor makes only the styled `.faq-toggle` link toggle it.
- `src/tools/merge/merge.js` (`@cantoo/pdf-lib`): `mergePdfs(files, onProgress) -> Blob`, plus `resolvePdfCreationDate(file)`
  reading `/CreationDate`. `src/lib/sort.js`: `sortByName` (locale-numeric) and `sortByDate`, a
  cascade of filename date → PDF creation date → `File.lastModified`. The File API cannot read OS
  birth time and `lastModified` changes on copy/download, so it is deliberately last.
- `src/lib/thumbnails.js`: lazy `pdfjs-dist` page-1 render. The worker is
  `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`, bundled same-origin, never a CDN.

## Cross-tool hand-offs, and the reverse

Merge's done state is the model: quiet secondary verbs next to the result, each with the target
tool's icon ("Compress it", "Sign it"), never in front of Download, never a sales row, always in the
app's voice (`e2e/handoff/merge-handoff.spec.js`). Look for the reverse too: an error or empty state
that points at the sibling tool that solves it (an encrypted file linking to Unlock, an oversized
draft to Compress). Every tool's done state should propose its own organic next-tool actions. See
heading 13 of [docs/ux-design-guidelines.md](../../docs/ux-design-guidelines.md).

## UX design guidelines

Before designing or reviewing any tool's loaded state, read
[docs/ux-design-guidelines.md](../../docs/ux-design-guidelines.md) in full; these are the choices
settled on the Merge rebuild and the questions to ask of the next tool. One line each, in order:

1. The output is the centre: the document on screen is what downloads, inputs are a rail beside it.
2. The simple case is the minimum: pick files, Download, no step that exists only to show a button.
3. Disclose by state, not by disclosure: options and next steps appear only once an output exists.
4. Every row is one kind of thing: inputs, status, commands, settings, primary control, next steps.
5. Name the output, and let people rename it in place: the heading is the file name, editable inline.
6. Undo over confirm: reversible actions get an Undo chip, never a dialog.
7. Labels, not hints: identify by a visible tag or word, not by an icon alone.
8. Touch is not hover with bigger targets: 44px targets, no hover-only affordance, sticky primary control.
9. Bidi is part of the design, not a fix: direction, isolation and start/end alignment from the start.
10. Speed is part of the experience: the first visible row before the heavy work starts.
11. Drafts are a quiet feature: a status line, never a banner or a modal.
12. Empty state is a band, not a void: a short band with ghost outlines, never a viewport-filling box.
13. Cross-tool hand-offs, and the reverse: quiet next-tool verbs, and sibling tools linked from errors.
14. How we review: measure in a real browser, rank findings, verify touch on a real phone.

The doc's closing section, "Reviewing the next tool: questions to ask first", is the checklist to
open before starting a review.
