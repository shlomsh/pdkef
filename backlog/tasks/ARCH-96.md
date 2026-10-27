---
id: "ARCH-96"
title: "Sign's dialog state follows Escape, and every page tool lists files it skipped"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-96 · Sign's dialog state follows Escape, and every page tool lists files it skipped

*Filed 2026-10-27* from the drift lists of the structural audit (ARCH-42..95).

## Why

- SignatureDialog uses `closedby="any"`: Escape or a tap outside closes the dialog while Sign's state still says open, so the next parent render reopens it (found while unifying dialogs in ARCH-59).
- Only Split tells a person which non-PDF files it skipped; Edit Pages and PDF to Image drop them silently (ARCH-58).

## Outcome

- Closing SignatureDialog by Escape or light dismiss updates Sign's state like Cancel does.
- Edit Pages and PDF to Image show Split's skipped-files note, in every live language.

## Acceptance

- [x] A test closes the signature dialog with Escape and it stays closed on the next render.
- [x] Unit tests show the skipped-files note in Edit Pages and PDF to Image, English and Hebrew.

## Closed

Closed 2026-10-27. Sign reports a native close through `useModalDialog`'s `reportNativeClose`; Split, Edit Pages and PDF to Image share `SkippedFilesNote` (Hebrew where the tool has a catalogue: PDF to Image). Tests in `SignatureDialog.test.tsx`, `useModalDialog.test.tsx`, `PdfEditPagesTool.test.tsx`, `PdfToImageTool.test.tsx`.
