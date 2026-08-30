---
id: "SIGN-14"
title: "Separate editor core, UI, and export adapters incrementally"
status: "open"
priority: "P2"
epic: "sign-tool-architecture"
phase: "longer-term"
depends_on: []
legacy_state: "Open"
---

# SIGN-14 · Separate editor core, UI, and export adapters incrementally

## Scope and acceptance

**Separate editor core, UI, and export adapters incrementally.** Two of the named violations are fixed (2026-08-29): the registry/UI import cycle (every `render` field pulled its Node component, and `TextNode`/`ShapeNode`/`LineNode`/`SignatureNode`/`SymbolNode`/`WhiteoutNode` all import `ElementResizers.tsx`, which imports `getElementDefinition` from `registry/index.ts` — closing a cycle back through whichever per-type file started it. `render` moved out of `ElementDefinition` entirely into a new `editor/registry/renderers.ts`; the 9 per-type modules no longer import any Preact Node component) and the `actionHistory` → `sign` dependency (ARCH-01, above). **Still open, and the larger remaining piece:** lazy-loading PDF serialization dependencies. `registry/text.ts` statically imports `@cantoo/pdf-lib`'s draw operators for `drawShapedRun`/`serialize`, and `textCoverage.js` (the live-typing coverage warning, wired eagerly into `PdfSignTool.tsx`) imports `unrepresentableCharacters` from that same file for its measurement-only path — so the whole `@cantoo/pdf-lib` chunk loads on hydration regardless of what `sign.js` itself defers, measured at 584,496 bytes brotli for `/sign/` (see `check-page-weight.js`'s corrected accounting). Fixing this means splitting `text.ts`'s eager measurement code (`fontkitFont`, `unrepresentableCharacters`, `shapedWidth` — no pdf-lib value imports needed) from its pdf-lib-drawing code (`drawShapedRun`, `remapGlyphForSubset`, `serialize` itself), which is exactly ARCH-03/ARCH-04's territory — deliberately not attempted in the same pass as the cycle fix above, since it touches the same file as SIGN-04/SIGN-09's text-direction and line-layout work. The three formerly failing assertions named here were reconciled under SIGN-17 on 2026-08-29; they are no longer a blocker for this split. Typing commands/serializer contracts and export-state revision/race protection remain untouched. Keep existing DOM gesture commits and reuse current registry tests. **Status checked 2026-08-29:** `/sign/` measures **585,284 of the 600,000-byte brotli budget — 97.5%, with 14,716 bytes left** (32,344 doc + 552,940 JS across 10 eager modules). The budget is deliberately not a ratchet, so raising it is allowed in principle, but the next eager import of any size will trip `check-page-weight.js`, and the honest fix is this ticket's own pdf-lib split rather than a budget bump. Treat a page-weight failure on `/sign/` as this ticket coming due, not as a broken guard.
