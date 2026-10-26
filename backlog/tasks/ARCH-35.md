---
id: "ARCH-35"
title: "Tool text lives with each tool in one convention"
status: "open"
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
