---
id: "ENC-06"
title: "Redact's export catch shows the protected state if one still gets through"
status: "open"
priority: "P2"
epic: "redact"
horizon: "next"
order: 1
depends_on: ["ENC-05"]
---

# ENC-06 · Redact's export catch shows the protected state if one still gets through

*Plan section 6.* Belt and braces after ENC-05.

## Brief
- If an `EncryptedPDFError` still reaches the export catch (`PdfRedactTool.tsx:836-852`), show the same state instead of "Try again". Keep `reportError` on it: after the gate, an `EncryptedPDFError` report means the gate missed something. Do not add it to `IGNORED_ERROR_NAMES`.
- Update the rule text: `.claude/rules/tools-and-shell.md` ("Catching errors") and the `errorReport.ts` header say an encrypted PDF is the person's file and falls back quietly. With the gate, a protected file is handled before it reaches a catch, and one that does reach it is ours. Say so, in both places, so `test:swallowed-errors` reading stays honest.

## Acceptance
- Unit: a forced `EncryptedPDFError` from `applyPageEdits` shows the state, still reports once, and does not count `tool_operation_failed`.
