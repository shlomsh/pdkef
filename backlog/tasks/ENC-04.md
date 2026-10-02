---
id: "ENC-04"
title: "Redact meets a protected PDF with one quiet state, not a dead Save"
status: "open"
priority: "P1"
epic: "redact"
horizon: "next"
order: 1
depends_on: ["ENC-01", "ENC-02"]
---

# ENC-04 · Redact meets a protected PDF with one quiet state, not a dead Save

*Plan section 1 and 4.* The origin of the plan: two `EncryptedPDFError` reports (`list_objects`, `export`),
and "Could not export the PDF. Your edits are still here. Try again." (`PdfRedactTool.tsx:851`), which
can never succeed on a protected file.

## Brief

- `src/editor/workspace/loadPdf.ts`, shared with Sign: classify the load. `needs-password` (the
  `PasswordException` already caught at `:145`) and `owner-restricted` (`getPermissions()` not `null`
  after the document resolves) become a distinct outcome, `needs-unlock`, and not a failure: no
  `clearDraft()` (`:111-120`, the restored path would drop the work of whichever entry the pointer names),
  no `cacheRecentFile`, no `FILE_LOAD_FAILED`.
- Redact: `initialize()` sets `file` and the bytes before pdf.js answers, which is why `useDeletableObjects`
  fires `list_objects` on a file about to be refused. Gate that effect (and `useDeletePreviews`) on the
  document having opened.
- Show `NeedsUnlock` in the place of the editor, replacing the load-error body that has the plain Unlock
  link (`PdfRedactTool.tsx:1202-1223`) for the protected cases; a damaged file keeps that screen.
- Belt: if an `EncryptedPDFError` still reaches the export catch (`:836-859`), show the same state instead
  of "Try again". Keep `reportError` on it: after this ticket an `EncryptedPDFError` report means the gate
  missed something. Do not add it to `IGNORED_ERROR_NAMES`.
- Receiving the unlocked file needs no change: `beforeRestore` already takes the hand-off.

## Acceptance
- Island test (`PdfRedactTool.test.tsx`): an owner-only fixture shows the state, never mounts the editor,
  never calls `PDFDocument.load` on the protected bytes, and sends no `tool_operation_failed`.
- A restored or handed-off protected file reaches the same state and leaves the pointer's draft alone.
- Verified in a real browser at 1280 and 375, with a Hebrew-named file.
