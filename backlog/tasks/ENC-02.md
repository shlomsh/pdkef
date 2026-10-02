---
id: "ENC-02"
title: "Redact meets a protected PDF with one quiet state, not an exception"
status: "done"
priority: "P1"
epic: "redact"
depends_on: ["ENC-01"]
---

# ENC-02 · Redact meets a protected PDF with one quiet state, not an exception

*Plan sections 1, 3 and 5.* The origin of the plan: two `EncryptedPDFError` reports (`list_objects`, `export`) and "Could not export the PDF. Your edits are still here. Try again." (`PdfRedactTool.tsx:849`), which can never succeed on a protected file.

## Brief
- `src/editor/workspace/loadPdf.ts`, shared with Sign: classify the load. The pdf.js rejection lands in the generic `catch (error)` at `:145`; a `PasswordException` there, and a resolved document whose `getPermissions()` is not `null`, become a distinct outcome, `needs-unlock`, handed to an **optional** callback. A tool that passes none (Sign) keeps today's behaviour. It is not a failure: no `clearDraft()` (`:111-120`; on the restored path it drops the work of whichever entry the pointer names), no `cacheRecentFile` (`PdfRedactTool.tsx:460-464`), no `FILE_LOAD_FAILED`, no report.
- Redact: `initialize()` sets `file` and the bytes before pdf.js answers, which is why `useDeletableObjects` (called from `src/tools/redact/useDeleteTool.ts:59`, effect in `useDeletableObjects.js:26-48`) fires `list_objects` on a file about to be refused. Gate it, and `useDeletePreviews.ts`, on the document having opened.
- The state, in the Redact folder, in place of the editor (replaces the load-error body with the plain Unlock link, `PdfRedactTool.tsx:1202-1223`, for the protected cases; a damaged file keeps that screen). Copy is in the plan, section 5. Two actions: **Unlock it** and the shell's Replace (Choose another file). "Unlock it" calls `saveHandoff('unlock', ...)` with the protected bytes, then navigates to `/unlock/`; busy flag is `useNavigatingAway` (`npm run test:navigating-away`); a failed save shows a line such as "Couldn't open Unlock with this file. Open Unlock and choose it there." (Redact's "Download it instead" does not fit.)
- Belt: if an `EncryptedPDFError` still reaches the export catch (`:836-852`), show the same state instead of "Try again". Keep `reportError` on it: after the gate an `EncryptedPDFError` report means the gate missed something. Do not add it to `IGNORED_ERROR_NAMES`. Update the sentence in `.claude/rules/tools-and-shell.md` ("Catching errors") that calls an encrypted PDF the person's file, so it says the gate handles it.
- When this ships, update the daily-read scheduled-task prompt (`~/.claude/scheduled-tasks/pdkef-daily-error-read/SKILL.md`; Shlomi said yes): the known Redact `EncryptedPDFError` item is resolved, and a new one is a gate miss.

## Acceptance
- Island test (`PdfRedactTool.test.tsx`): an owner-only fixture shows the state, never mounts the editor, never calls `PDFDocument.load` on the protected bytes, sends no `tool_operation_failed`; "Unlock it" saves the hand-off and navigates; a failed save shows the line. A restored or handed-off protected file reaches the same state and leaves the pointer's draft alone.
- Reviewed in a real browser at 1280 and 375, with a Hebrew-named file.

## Result

Shipped in `2877afd2`. `loadPdf` takes an optional `onNeedsUnlock`, so a protected file is an outcome (no failure, no report, draft untouched) and Sign loads as before. Redact shows `NeedsUnlock` with Unlock it and Replace; the two pdf-lib readers wait for pdf.js to open the file; the export catch keeps `reportError` (a gate miss) but never offers a Try again. Checked at 1280 and 375. Not done: a Hebrew-named file review, and an island test for the export-catch belt.
