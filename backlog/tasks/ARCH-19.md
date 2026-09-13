---
id: "ARCH-19"
title: "The editor core stops importing Preact components: fix the four src/editor to src/components leaks"
status: "open"
priority: "P2"
epic: "module-boundaries"
phase: "near-term"
depends_on: ["ARCH-16"]
---

# ARCH-19 · A headless core that is actually headless

## Problem

`editor.md` states that `src/editor/` is plain TS with no Preact. Four files break it (2026-09-13):

- `src/editor/registry/renderers.ts` imports the Preact node renderers from `components/SignTool/nodes/*`
  (documented as an exception, with a CI grep guarding the shape).
- `src/editor/registry/text.ts` imports `components/SignTool/textMessages.ts`.
- `src/editor/model/editorModel.ts` imports from `src/components`.
- `src/editor/workspace/useEditorDraftPersistence.ts` imports from `src/components`.

Each is an edge from the core to a tool, which is the direction the boundary rules forbid and the
reason the Nx spike saw `editor` and `sign-internal` as one blob. It also means the font guards'
input graph reaches into Sign's UI through the export core.

## Scope

- Invert the renderer registration: the registry exposes `registerRenderer(type, component)` and
  Sign's island (and Redact's) registers its node components at its entry point. The registry
  imports nothing from a tool. Retire the "single-owner" grep in `ci.yml` only if the boundary
  checker now covers what it guarded.
- Move the message strings `registry/text.ts` needs into `src/editor/text/` (or `i18n`) and have
  `SignTool/textMessages.ts` re-export them, so the arrow points from tool to core.
- Read `editorModel.ts` and `useEditorDraftPersistence.ts` for what they actually need from
  `components` (types? constants?) and move that into the core or into `editor-ui`.
- Remove the four entries from the boundary checker's allowlist; it fails if any return.

## Acceptance

- `grep -rn "components/" src/editor --include='*.ts' --include='*.js'` returns only tests, or nothing.
- `npm run test:module-boundaries` green with no editor entries on the allowlist.
- The 27 font guards green (`npm run test:e2e:fonts`), since the export core is what they load; and
  `scripts/change-scope.mjs`'s input list drops `src/components/SignTool/` if nothing in the export
  graph still reaches it (verify with an esbuild metafile of `src/editor/adapters/pdf/sign.js`).
