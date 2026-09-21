---
id: "DEBT-18"
title: "Four tools commit async results that their inputs already invalidated"
status: "in_progress"
priority: "P1"
epic: "architecture-debt"
phase: "near-term"
depends_on: []
---

# DEBT-18 · Four tools commit async results that their inputs already invalidated

*Filed 2026-09-21, from a Preact review of every island against the effects-hygiene half of an
external React guidance skill (the rest of that skill targets React 19 APIs Preact 10 does not have).*

## Why

Sign got this right and the others did not. `PdfSignTool.tsx:888-911` captures three things before
its export await and refuses to commit if any of them moved:

```ts
if (activeExportRequestRef.current !== requestId
  || documentRevisionRef.current !== sourceRevision
  || currentFileRef.current !== sourceFile) return;
```

Compress owns the same idea in a smaller form (`runTokenRef`, `PdfCompressTool.tsx:143`, checked at
:292/:340/:367). Four other async paths have no guard at all, so whichever promise resolves last
wins, whatever the user did in the meantime. Merge, worth saying, is clean: every async path there
already carries a cancel flag or a token.

**Redact is the one that matters, because the stale value is a redacted document.**
`PdfRedactTool.tsx:704-711` awaits `applyPageEdits`, then unconditionally re-arms the Share sheet and
the "Compress it" hand-off:

```tsx
const redactedBlob = await applyPageEdits(file, elements, (p) => setProgress(p));
const filename = `redacted_${file.name}`;
setExportedForHandoff({ blob: redactedBlob, name: filename });
```

An undo or redo during that await is reachable, not theoretical. `.is-processing` sets
`pointer-events: none` (`src/editor-ui/Workspace.module.css:35`), which stops the pointer and not the
keyboard; `useHistoryShortcuts` binds an unconditional `window` keydown and is wired at
`PdfRedactTool.tsx:651`; `redoLast` (:628) has no status guard and calls `setElements` plus
`markDocumentEdited()`. So Shift+Cmd/Ctrl+Z mid-export mutates `elements`, the invalidation effect at
:322-325 correctly clears the hand-off, and then the stale promise resolves and puts it back. The user
is then offered, by Share and by the hand-off, a "redacted" PDF missing a box they have already
restored. The comment at :211-215 says this "never hands Compress a stale export"; in that window it
does. Redact already has `documentRevisionRef` (:99-100) and never reads it here.

The other three are wrong output rather than exposed content:

- `PdfSplitTool.tsx:206-256` (called at :274) has no cancellation on the load path. Pick a 300-page
  PDF, replace it with a 3-page one before the first `getDocument` settles, and the first file's
  continuation still runs `setNumPages`, `setPages` and `setStatus('ready')`. The header shows file B
  next to file A's page grid, and the debounced prepare at :141-180 will split B over A's ranges. The
  abandoned thumbnail loop also matches on `p.pageNumber === i` alone, so it stamps A's rendered pages
  into B's cells one at a time, and `loadingTask.destroy()` (:250) is only reached after all N pages.
  This tool already owns the right primitive in `prepareSeq` (:84) and does not apply it here.
- `PdfToImageTool.tsx:90-116`: `resetOutput()` (:47-55) does not invalidate an in-flight conversion,
  so a replaced file lands the previous file's images, `prepareFiles` and `status: 'done'` under the
  new file's name. The error branch at :107-115 can likewise push `status: 'error'` onto a freshly
  picked good file.
- `PdfSecurityTool.tsx:29-49`: `await isPdfEncrypted(selectedFile)` then `setMode(newMode)` with
  nothing captured. Replace a large encrypted file with a small unencrypted one and the slower check
  wins, so the form offers Unlock for a file that has no password and `handleSubmit` (:64-66) takes
  the `unlockPdf` branch, which fails with "The password may be incorrect" forever. `handleSubmit`
  has the same unguarded shape, and can write the old file's blob under the new file's name.

Four sites, one root cause, and two in-repo fixes already written. That is what makes it a debt
ticket rather than four bug fixes: the next async path added to a tool will get this wrong too.

## Scope

- [ ] One shared primitive in `src/lib/` for "this async result is still wanted", taken from what Sign
      and Compress already do rather than invented. Sign's three-part check (request id, document
      revision, source file) is the richer of the two; the helper should make the cheap case cheap
      without forcing every caller to carry all three.
- [ ] Redact first, and separately, since it is the only one with a content consequence: capture the
      file and `documentRevisionRef` before the `await` in `handleSavePdf`, bail before
      `setExportedForHandoff`, `prepare` and `download`. Fix the comment at :211-215 in the same
      change so it describes what the code does.
- [ ] Split, To-Image and Security onto the same helper. Split should use `prepareSeq` or the helper,
      not a second bespoke counter, and must bail inside the per-page thumbnail loop, not only after
      the document resolves.
- [ ] Sign and Compress keep their behaviour. Move them onto the helper only if it comes out simpler;
      a refactor that churns the one path that is already correct is not the point.
- [ ] Unit coverage per tool for the losing-race case: start a load or export, invalidate it, resolve
      the stale promise, assert nothing committed. Redact's case is the specific one above, driven
      through the keyboard shortcut rather than a synthetic state poke, because the keyboard path is
      what makes it reachable.

## Acceptance

- Redact: with an export in flight, a redo lands, the export resolves, and neither
  `exportedForHandoff` nor the prepared share file is set from the pre-redo elements. Asserted in a
  unit test, not by inspection.
- Split: replacing the file mid-load leaves `numPages`, `pages`, `pageSelector` and `status` describing
  the file that is actually loaded, and the abandoned pdf.js task is destroyed without finishing its
  thumbnail loop.
- To-Image and Security: the stale continuation commits nothing. Security's mode matches the loaded
  file.
- `npm run check:fast` green, then the full `ci.yml` chain once before the push.

## Not in scope

The object-URL teardown gaps found in the same review (`PdfImageToPdfTool.tsx:45-50`, whose `[]`-dep
cleanup closes over the initial empty array and revokes nothing, and `PdfToImageTool.tsx`, which has
no unmount revoke at all). Same review, same "the small tools never got the hardening the big ones
did" theme, different mechanism. They get their own ticket so this one can close.

## Evidence

Line references above were read directly, not inferred from a summary. The asymmetry is the finding:
`PdfSignTool.tsx:888-911` and `PdfCompressTool.tsx:143` are the two worked examples, and
`PdfMergeTool.tsx` is the third tool that already gets it right.
