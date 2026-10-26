---
id: "ARCH-35"
title: "Tool text lives with each tool in one convention"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
order: 4
depends_on: []
---

# ARCH-35 · Tool text lives with each tool in one convention

*Filed 2026-10-26* from the architecture review ([docs/architecture-debt-review-2026-10-26.md](../../docs/architecture-debt-review-2026-10-26.md), section 6).

## Why

`i18n/toolMessages.ts` is a 2466-line table, imported by 12 projects and changed 53 times since
2026-10-05. It imports types from shell and editor and is imported by pages, so every string edit
goes wide (ARCH-34). Beside it, tool text follows three more conventions: `SignMessages`,
`scanMessages.ts`, Edit Pages' private non-localizable `messages.ts`, and inline English in
Unlock/Protect (~25 literals) and Redact (including "Undid:"/"Redid:" in `redactState.ts:455/471`).

## Outcome

- Each tool's messages live in one module per tool, in one shape, and the pages pick them through a
  small registry, so editing Merge's text reaches Merge and its pages only.
- Shared shell and editor message types are owned by shell and editor; i18n imports nothing above it.
- Scan, Edit Pages, Unlock/Protect and Redact use the same convention; no user-facing English literal
  is left in their components or state.
- The Hebrew edition renders exactly as before (`test:seo` and the localized page tests stay green).

## Acceptance

- [ ] `toolMessages.ts` is gone or holds only the registry.
- [ ] `nx show projects --affected --files=<one tool's messages>` lists that tool and the pages only.
- [ ] A guard fails on an inline English string in a tool island (or a documented allowlist).

## Progress (part A: split)

Done 2026-10-26 on `un-arch-35`. `src/i18n/toolMessages.ts` (2466 lines) is gone.

- `formatMessage` -> `src/lib/formatMessage.ts` (lib, not i18n: the editor chrome calls it and the editor never imports i18n).
- Shell text (`PageGridMessages`, `DownloadMessages`, `ShellMessages`, tables, `getShellMessages`) -> `src/shell/shellMessages.ts`.
- `FileDropzoneMessages` -> `src/site-lib/fileDropzoneMessages.ts`; `RecentFilesMessages` -> `src/site-lib/recentFilesMessages.ts`.
- Sign: the English and Hebrew tables are in `src/editor/registry/signMessages.ts`, the label helpers in `signLabels.ts`, beside the `SignMessages` type. They could not go to `tools/sign/`: `editor-ui/ElementResizers.tsx` and Redact's box toolbar read the English defaults and neither may import a tool. `src/tools/sign/messages.ts` is Sign's entry (`getSignMessages`, re-exports).
- Merge, Compress, Split, ToImage, ImageToPdf: `src/tools/<tool>/messages.ts`, one shape (`<Tool>Messages`, `english<Tool>Messages`, `hebrew<Tool>Messages`, `get<Tool>Messages` with English fallback).
- Registry `getToolMessages(slug, locale)` -> `src/site-lib/toolMessageRegistry.ts`; `localizedToolPage.ts` and its test moved to `src/site-lib/` because they need it. Rule 4 of `docs/module-boundaries.md` now also lets the site reach a tool's `messages.ts`.
- Four shell tests that render Merge's or Split's real catalogue moved to `src/test/cross-tool/` (rule 6).
- Guard `src/i18n/i18nImportsNothingAbove.test.js`: i18n imports nothing from shell, editor, editor-ui, tools or site-lib.
- Proof: `dist/` HTML (all 54 pages, including `he/`) is identical before and after apart from build stamps, hashed asset names and 97 unused Tailwind utility rules that stopped being emitted.

Left for part B (conventions): Scan's `scanMessages.ts`, Edit Pages' `messages.ts` (non-localizable), inline English in Unlock/Protect and Redact, the inline-English guard, and tidying the `src/content/localized-tools/he/*.yaml` comments that still name `toolMessages.ts`.
