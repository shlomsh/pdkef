---
id: ARCH-14
title: Type the editor interaction tests now covered by shared contracts
status: open
priority: P2
epic: editor-architecture
phase: near-term
depends_on: [ARCH-10]
---

## Problem

ARCH-10 made the Sign and Redact node, gesture, workspace, toolbar, and reducer boundaries concrete,
but the component tests that exercise those boundaries still begin with `@ts-nocheck`. They therefore
cannot catch invalid fixtures or callback payloads even though the production contracts now can. The
runtime suite is green, so this is test-contract debt rather than unfinished ARCH-10 behavior.

## Scope

- Remove `@ts-nocheck` from the ARCH-10 interaction tests only:
  - `src/components/PdfSignTool.test.tsx`
  - `src/components/PdfRedactTool.test.tsx`
  - `src/components/SignTool/PdfWorkspace.test.tsx`
  - `src/components/SignTool/SignToolContext.test.tsx`
  - `src/components/SignTool/SignToolbar.test.tsx`
  - `src/components/SignTool/DraggableWrapper.test.tsx`
  - `src/components/SignTool/DraggableWrapper.interaction.test.tsx`
  - `src/components/SignTool/DraggableWrapper.gestureInvariants.test.tsx`
  - `src/components/SignTool/nodes/TextNode.test.tsx`
  - `src/components/SignTool/nodes/ShapeNode.test.tsx`
  - `src/components/SignTool/nodes/SymbolNode.test.tsx`
- Make fixtures valid members of the shared `EditorElement` variants, including required `type`, id,
  page, geometry, and variant fields. Use shared test builders if repetition becomes material.
- Give event stubs, refs, dispatches, and callback spies the production parameter types. Prefer small
  typed helpers over local casts; use a narrow cast only where jsdom cannot model a browser API.
- Preserve every behavioral assertion and production runtime path. Do not weaken expectations or widen
  a production contract merely to accommodate an incomplete test object.
- Keep unrelated component tests and the remaining repository-wide `any` cleanup out of this ticket.

## Acceptance criteria

- None of the eleven listed tests contains `@ts-nocheck` or an unqualified `any`.
- `npm run typecheck` includes those tests and reports no errors.
- The focused eleven-file Vitest run passes without skipped or relaxed assertions.
- The full unit/component suite and `npm run test:editor-dependency-directions` remain green.

## Handoff notes

Start with the three node tests; ARCH-10's `nodeProps.ts` and `EditorElementPatch<T>` usually make their
errors the most mechanical. Then type the wrapper tests before the workspace/tool tests so reusable
pointer-event and ref helpers can be shared. The clean baseline on commit `03f245c` is 99 test files,
1,949 tests, zero typecheck diagnostics, a passing production build, and passing gesture/dependency
guards.
