---
id: "ENC-05"
title: "Redact meets a protected PDF with one quiet state, not a dead Save"
status: "open"
priority: "P1"
epic: "redact"
horizon: "now"
order: 1
depends_on: ["ENC-01", "ENC-02"]
---

# ENC-05 · Redact meets a protected PDF with one quiet state, not a dead Save

*Plan sections 1 and 4. Wave 1: the Redact flow, first.* The origin of the plan: two `EncryptedPDFError` reports (`list_objects`, `export`) and "Could not export the PDF. Your edits are still here. Try again." (`PdfRedactTool.tsx:849`), which can never succeed on a protected file.

## Brief
- `src/editor/workspace/loadPdf.ts`, shared with Sign: classify the load. The pdf.js rejection lands in the generic `catch (error)` at `:145`; a `PasswordException` there, and a resolved document whose `getPermissions()` is not `null`, become a distinct outcome, `needs-unlock`, not a failure: no `clearDraft()` (`:111-120`: on the restored path it drops the work of whichever entry the pointer names), no `cacheRecentFile` (`PdfRedactTool.tsx:460-464`), no `FILE_LOAD_FAILED`.
- Redact: `initialize()` sets `file` and the bytes before pdf.js answers, which is why `useDeletableObjects` (called from `src/tools/redact/useDeleteTool.ts:59`, effect in `useDeletableObjects.js:26-48`) fires `list_objects` on a file about to be refused. Gate it, and `useDeletePreviews.ts`, on the document having opened.
- Show `NeedsUnlock` in the place of the editor, replacing the load-error body with the plain Unlock link (`PdfRedactTool.tsx:1202-1223`) for the protected cases; a damaged file keeps that screen.
- Receiving the unlocked file needs no change: `beforeRestore` already takes the hand-off.

## Acceptance
- Island test (`PdfRedactTool.test.tsx`): an owner-only fixture shows the state, never mounts the editor, never calls `PDFDocument.load` on the protected bytes, and sends no `tool_operation_failed`. A restored or handed-off protected file reaches the same state and leaves the pointer's draft alone.
- Verified in a real browser at 1280 and 375, with a Hebrew-named file.
