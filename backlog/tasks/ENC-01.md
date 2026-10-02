---
id: "ENC-01"
title: "One classifier says whether a PDF needs a password, is only protected, or is open"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "now"
order: 1
depends_on: []
---

# ENC-01 · One classifier says whether a PDF needs a password, is only protected, or is open

*Part of the protected-PDF plan, [docs/encrypted-pdf-unlock-handoff.md](../../docs/encrypted-pdf-unlock-handoff.md), section 2. Wave 1, the Redact flow: lands with ENC-02 to ENC-05 and ENC-07, because module-boundaries rule 9 needs two consumers per module.*
Today four places decide "encrypted" four ways (pdf-lib `isEncrypted` in Merge and Unlock, pdf.js errors in Sign, Redact, Split and Compress, nothing in Edit Pages) and none can tell a file that needs a password from one that only has an owner password. Owner-only files open in pdf.js and then break or, worse, produce blank output.

## Brief
- `src/lib/pdfEncryption.ts`: `classifyPdfOpen(outcome)`, pure, returning `needs-password` (pdf.js `PasswordException`, code 1), `owner-restricted` (the document resolved and `getPermissions()` is not `null`), `open` (resolved, `getPermissions()` is `null`) or `unreadable` (`InvalidPDFException`, `MissingPDFException`, `FormatError`). And `probeEncryption(bytes)`: `getDocument` with the shared wasm URL and no `onPassword`, classify, destroy the task. Any other error is rethrown, not classified.
- Reach pdf.js through the one existing loader that `docs/module-boundaries.md` lets `lib` import (`src/lib/thumbnails.js` has a private one, `src/editor/adapters/pdf/pdfjsLoader.js` the shared one); every `getDocument` passes `wasmUrl: PDFJS_WASM_URL` (`src/lib/pdfjsWasm.js`).
- Checked-in fixtures, a few KB each: needs a password and owner-only (both AES-256), each also with an encrypted Info dictionary, plain, truncated. Made once with pypdf; the script sits beside them. Each is confirmed to really fail in pdf-lib and to behave as named in pdf.js (guidelines section 14).
- Not `isEncrypted`, not `{password: ''}`, not a byte scan (section 2 of the plan has the measurements).

## Acceptance
- Unit tests classify every fixture as named; the pure function is also tested over stubbed outcomes, including `FormatError`.
- A catch in the probe carries `// expected:` or reports, per `test:swallowed-errors`.
