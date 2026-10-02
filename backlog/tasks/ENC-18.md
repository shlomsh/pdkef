---
id: "ENC-18"
title: "The protected-PDF state has been read in Hebrew and mirrors in RTL"
status: "open"
priority: "P3"
epic: "search-and-languages"
horizon: "next"
order: 1
depends_on: ["ENC-02"]
needs: "A short read of the Hebrew gate strings"
---

# ENC-18 · The protected-PDF state has been read in Hebrew and mirrors in RTL

*Plan section 7, decision 5 (Shlomi: yes, keep it simple).* ENC-02 adds first-draft Hebrew strings because the shell catalogue type requires both languages. Redact and Unlock are not localized islands (`src/i18n/localizedTools.ts`) and have no `/he/` page, so the strings reach `/he/` only where Merge, Compress and Sign already take shell messages.

## Brief
- Shlomi reads the Hebrew; adjust it.
- The file name inside the sentence is isolated (`<bdi>`), guidelines section 9; test with a Hebrew name in an RTL shell (the `e2e/localized/rtl-shell.spec.js` pattern).
- Add a parity test for `ShellMessages`: the existing one covers the Sign catalogue only, and TypeScript is the only guard for the shell.
- Hold if the Hebrew programme (`docs/i18n-status/`) says no new Hebrew surface before its next read.

## Acceptance
- The Hebrew catalogue has exactly the English keys; the state mirrors under `dir="rtl"`.
