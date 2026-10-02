---
id: "ENC-11"
title: "The protected-PDF state has its Hebrew strings"
status: "open"
priority: "P3"
epic: "search-and-languages"
horizon: "later"
order: 5
depends_on: ["ENC-02"]
needs: "A decision on whether to add Hebrew strings for tools that have no /he/ page"
---

# ENC-11 · The protected-PDF state has its Hebrew strings

*Plan section 7, open decision 5.* Redact and Unlock are not localized islands: neither is in
`LOCALIZED_TOOL_ISLANDS` (`src/i18n/localizedTools.ts`), and there is no `/he/redact/` or `/he/unlock/`,
so the gate's strings reach `/he/` only where Merge, Compress and Sign already take shell messages.

## Brief
- Add the keys to `ShellMessages` with English and Hebrew values (`englishShellMessages`,
  `hebrewShellMessages`, `src/i18n/toolMessages.ts`), written in the voice guide and read by Shlomi.
  `BasePdfTool` falls back to English for a missing override, but TypeScript is the only parity guard for
  the shell catalogue (the parity test covers the Sign catalogue only), so add that test here.
- The file name inside the sentence is isolated (`<bdi>`), per guidelines section 9; test with a Hebrew
  name in an RTL shell (`e2e/localized/rtl-shell.spec.js` pattern).
- Hold if the Hebrew programme (`docs/i18n-status/`) says no new Hebrew surface before its next read.

## Acceptance
- The Hebrew catalogue has exactly the English keys; the state mirrors under `dir="rtl"`.
