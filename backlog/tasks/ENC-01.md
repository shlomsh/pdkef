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

*Part of the protected-PDF plan, [docs/encrypted-pdf-unlock-handoff.md](../../docs/encrypted-pdf-unlock-handoff.md), section 2.*
Today four places decide "encrypted" four ways (pdf-lib `isEncrypted` in Merge and Unlock, pdf.js errors
in Sign, Redact, Split and Compress, nothing in Edit Pages) and none can tell a file that needs a password
from one that only has an owner password. Owner-only files open in pdf.js and then break or, worse,
produce blank output.

## Brief

- `src/lib/pdfEncryption.ts`: `classifyPdfOpen(outcome)`, pure, returning `needs-password` (pdf.js
  `PasswordException`, code 1), `owner-restricted` (the document resolved and `getPermissions()` is not
  `null`), `open` (resolved, `getPermissions()` is `null`) or `unreadable` (`InvalidPDFException`,
  `MissingPDFException`). And `probeEncryption(bytes)`: `getDocument` with the shared wasm URL and no
  `onPassword`, classify, destroy the task. Any other error is rethrown, not classified.
- Checked-in fixtures, a few KB each: needs a password (AES-256), owner-only (AES-256, empty user
  password), the same two with an encrypted Info dictionary, plain, truncated. Generated once with pypdf;
  the generating script sits beside them. Each fixture is confirmed to really fail in pdf-lib and to behave
  as named in pdf.js (guidelines section 14: a fixture meant to fail must be checked).
- Not `isEncrypted`, not `{password: ''}`, not a byte scan (section 2 of the doc has the measurements).

## Acceptance
- Unit tests classify every fixture as named; the pure function is tested over stubbed outcomes too.
- A catch in the probe carries `// expected:` or reports, per `test:swallowed-errors`.
- `src/lib/pdfEncryption.ts` has at least two consumers by the time ENC-02 and ENC-04 land
  (`test:module-boundaries` rule 9); until then the ticket may name them.
