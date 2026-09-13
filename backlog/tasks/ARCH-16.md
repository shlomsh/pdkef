---
id: "ARCH-16"
title: "Move the shared shell and the editor UI out of src/components into src/shell and src/editor-ui"
status: "open"
priority: "P1"
epic: "module-boundaries"
phase: "near-term"
depends_on: ["ARCH-15"]
---

# ARCH-16 · The shared shell and the editor UI leave the flat components folder first

## Problem

Tools cannot move into folders of their own (ARCH-17, ARCH-18) until the things they share have a
home that is not the same flat folder they are leaving. Today `BasePdfTool.tsx` sits beside
`PdfSplitTool.tsx`, and `ElementToolbar.tsx` beside `RedactBox.tsx`.

## Scope

- `git mv` (history preserved) the shell set named in `docs/module-boundaries.md` (ARCH-15) to
  `src/shell/`, and the editor UI set to `src/editor-ui/`. CSS Modules and unit tests move with
  their components.
- Rewrite imports mechanically; nothing else changes. The `.astro` SEO components stay in
  `src/components/` for now (the site is not in scope of this epic).
- Update everything that hardcodes the old paths (the list in ARCH-15's Notes), and the
  `paths:` frontmatter of `editor.md`, `home-page.md` and `styling.md`.
- Shrink the boundary checker's allowlist by every edge this move resolves; it must not grow.

## Acceptance

- The whole `ci.yml` chain green locally and on `main`; the CSS guards in particular
  (`npm run test:css` names a page when a family sheet loses a component).
- `src/components/` contains only the nine `Pdf*Tool.tsx` islands, `MergeTool/`, `SignTool/`,
  `RedactBox`/`RedactToolbar`, `HeroDemo/` and the `.astro` files.
- One commit per folder (`shell`, then `editor-ui`), each green on its own.
