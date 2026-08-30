---
id: "FONT-05"
title: "Export-render-guard corpus cases for Simplified Chinese, Traditional Chinese and Korean"
status: "done"
priority: "P2"
epic: "fonts-and-script-support"
phase: "unspecified"
depends_on: []
legacy_state: "Done 2026-08-29"
---

# FONT-05 · Export-render-guard corpus cases for Simplified Chinese, Traditional Chinese and Korean

## Scope and acceptance

**Export-render-guard corpus cases for Simplified Chinese, Traditional Chinese and Korean.** The three cases landed (`chinese-simplified-noto-sans-sc` 你好, `chinese-traditional-noto-sans-tc` 謝謝, `korean-noto-sans-kr` 안녕하세요), each verified via `hasGlyphForCodePoint` against the real bundled TTF bytes and confirmed not to trigger `signPdf`'s refusal path. Real baselines were captured on `ubuntu-latest` via the `update-export-render-baseline` workflow input and committed (`f126faa`); the guard now checks all three on CI rather than skipping.
