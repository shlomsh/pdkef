---
id: "DEBT-18"
title: "Four tools commit async results that their inputs already invalidated"
status: "done"
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

- [x] One shared primitive in `src/lib/` for "this async result is still wanted", taken from what Sign
      and Compress already do rather than invented. Sign's three-part check (request id, document
      revision, source file) is the richer of the two; the helper should make the cheap case cheap
      without forcing every caller to carry all three.
- [x] Redact first, and separately, since it is the only one with a content consequence: capture the
      file and `documentRevisionRef` before the `await` in `handleSavePdf`, bail before
      `setExportedForHandoff`, `prepare` and `download`. Fix the comment at :211-215 in the same
      change so it describes what the code does.
- [x] Split, To-Image and Security onto the same helper. Split should use `prepareSeq` or the helper,
      not a second bespoke counter, and must bail inside the per-page thumbnail loop, not only after
      the document resolves.
- [x] Sign and Compress keep their behaviour. Move them onto the helper only if it comes out simpler;
      a refactor that churns the one path that is already correct is not the point.
- [x] Unit coverage per tool for the losing-race case: start a load or export, invalidate it, resolve
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
did" theme, different mechanism. They are DEBT-19, along with two unguarded `await`s the review of this work turned up
(`handoffToCompress` in Split, and the unhandled read failure behind `isPdfEncrypted` in Security).

## Outcome

Landed on `main` in four commits: `06c8171` (this ticket), `b17b4e5` (the `useLatestRun` primitive
and Redact), `748c27a` (Split, To-Image, Security) and `51d7907` (the fix round below).

`src/lib/useLatestRun.ts` is the primitive. It came out cheaper than Sign's three-part check for the
callers that need nothing: `useLatestRun()` with no argument is a token, and an optional
`readKeys` closure adds Sign's "did the inputs move" comparison for the callers that do (Redact
passes `file` and `documentRevisionRef`). Its object identity is stable across renders on purpose -
Redact keeps `exportRun` in an effect dependency array, and a fresh object per render would have
`invalidate()` killing every export within a frame.

Sign and Compress were left alone, as the scope bullet allowed: moving them would have churned the
two paths that were already correct for no gain.

An independent review of the implementation (fresh subagent, no shared context) found two tests that
passed without testing anything - Split's in-loop guards and the primitive's key refresh were both
covered by tests that stayed green with the code under test deleted. Both were confirmed by deleting
the guard and rewritten in `51d7907`; all five race tests now fail without their fix, checked by
deletion rather than by reading the test.

One real bug shipped inside this ticket and was caught by that review: `b17b4e5` restored the editor
after an invalidated export without checking what the status had become, so replacing the file
mid-export wrote `'editing'` over the loader's `'loading'` and showed an empty editor for a file
still being read. The `statusRef` guard in `51d7907` closes it. It went out because a checkpoint was
committed on a green suite without a review pass, which is the cost this ticket's own process notes
are about.

**Verified:** `check:fast` green, 105 tests across the five affected suites, the eight pre-build CI
guards, `build`, `test:csp`, `test:redirects`, `test:css`, `test:weight`, `test:lazy-modules`.
**Not verified:** Playwright. This environment's browser bundle is chromium-1194 and Playwright
1.63.0 wants 1243, with no WebKit present, so no e2e ran here at all. It needs a real CI run.
`test:seo` and two `gitLastModified` unit tests fail in this environment for an unrelated reason
(shallow clone, 123 commits); proven pre-existing by re-running them on a stashed clean tree.

## Evidence

Line references above were read directly, not inferred from a summary. The asymmetry is the finding:
`PdfSignTool.tsx:888-911` and `PdfCompressTool.tsx:143` are the two worked examples, and
`PdfMergeTool.tsx` is the third tool that already gets it right.
