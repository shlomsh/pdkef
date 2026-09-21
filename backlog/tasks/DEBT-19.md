---
id: "DEBT-19"
title: "The small tools' teardown and error paths never got the hardening the big ones did"
status: "open"
priority: "P2"
epic: "architecture-debt"
phase: "near-term"
depends_on: []
---

# DEBT-19 · The small tools' teardown and error paths never got the hardening the big ones did

*Filed 2026-09-21 out of the same review that produced DEBT-18, which closed the async races. These
are the four findings that review left on the floor: two object-URL teardowns that revoke nothing,
and two `await`s with no guard around them at all.*

## Why this is P2 and DEBT-18 was P1

Nothing here exposes a document the way Redact's export race did. The object-URL half is latent by
this repo's own reasoning (`src/lib/useObjectUrls.js`'s docstring: "this is a full-page-navigation
app; nothing unmounts a tool without tearing down the whole document, which reclaims everything
regardless"), and the two guard gaps need a specific interleaving. They are grouped because they
share DEBT-18's shape: the tools that got the least traffic never got the hardening, and each one
was hand-rolled rather than taken from the owner module that already exists.

## The two object-URL teardowns

**`PdfImageToPdfTool.tsx:45-50` revokes nothing.** The intent is stated in the comment and the
dependency array defeats it:

```tsx
useEffect(() => {
  // Revoke every thumbnail object URL on unmount.
  return () => {
    for (const entry of entries) URL.revokeObjectURL(entry.thumbnail);
  };
}, []);
```

`[]` means the cleanup closes over the `entries` from the first render, which is `[]`. Every
thumbnail URL created at :27 is still live at unmount. The per-entry removal (:104) and the clear-all
(:114) are both correct, so this is only the unmount half, and it is the half that is silently a
no-op rather than missing.

**`PdfToImageTool.tsx` has no unmount teardown at all.** `revokeAll` (:24-26) is called from
`resetOutput`, so replacing the file or changing any option is clean; unmounting while `images` is
populated leaks all of them. Same half of the same problem, by omission instead of by dead code.

`src/lib/useObjectUrls.js` already owns exactly this lifecycle and was written (per its docstring)
because five tools had hand-rolled it. It holds one URL. Both sites here hold a list, which is why
neither adopted it.

## The two unguarded awaits

**`PdfSplitTool.tsx:436-454`, `handoffToCompress`, can hand Compress a document the user has
abandoned.** It captures `outputs[0]` at :437 and then awaits twice, a dynamic import and
`output.blob.arrayBuffer()`, before `saveHandoff` and `navigate('/compress/')`. Nothing is checked
afterwards. `handoffBusy` disables only the button (:737); the `FileDropzone` at :537 stays live, so
a new file during that window runs `invalidate()` (:134-145), which revokes the old outputs' URLs and
empties `outputs`. That does not stop the handoff: revoking a URL does not free the Blob, and the
captured `output` still references it. The stale continuation then writes the abandoned file's bytes
under the abandoned file's name and navigates away from the file the person just picked.
`handoffBusy` is never reset by `invalidate`, so if the navigation is what fails, the button is also
left disabled.

DEBT-18 put `useLatestRun` in `src/lib/` for precisely this; Split already imports it as `loadRun`.
This path was out of that ticket's scope and is the obvious next caller.

**`PdfSecurityTool.tsx:47` has no `try`/`catch` around `isPdfEncrypted`.** The function catches its
own parse failure and returns `false` (`security.js:18-25`), so a malformed PDF is handled. What is
not handled is the line above that `try`:

```js
const bytes = await file.arrayBuffer();   // security.js:19, outside the try
```

A `File` whose backing bytes changed on disk between the pick and the read rejects here
(`NotReadableError` in Chromium). `handleFilesAdded` does not catch, so the rejection escapes as an
unhandled promise rejection, `setMode` is never reached, and the tool sits on the announcement
`Checking file "X"…` with no form, no error and no way forward but a reload. Every other tool
surfaces a read failure; this one is the only silent dead end of the four.

Worth deciding in the same change, not asserting here: `isPdfEncrypted` returning `false` for a file
it could not parse (the comment at `security.js:24` calls this deliberate) sends that file to the
Protect form, where `protectPdf` will fail on the same bytes. Treating "cannot read this PDF" as its
own outcome may be better than folding it into "not encrypted".

## Scope

- [ ] Fix `PdfImageToPdfTool.tsx:45-50` so the unmount cleanup sees the current entries, and
      `PdfToImageTool.tsx` so it has one at all. Prefer extending `useObjectUrls.js` to own a list
      over adding a second hand-rolled pattern; if a list owner comes out worse than a ref mirror in
      each tool, say so in the change rather than forcing it.
- [ ] A unit test per tool that proves the revoke happens: unmount with URLs outstanding and assert
      `URL.revokeObjectURL` was called with each. Both current sites pass a naive "does it have a
      cleanup" test, which is what let the `[]` one ship.
- [ ] Guard `handoffToCompress` with `useLatestRun` (Split already has the import), bail before
      `saveHandoff` and `navigate`, and clear `handoffBusy` on the paths that abandon the handoff.
- [ ] Catch the read failure in `PdfSecurityTool.handleFilesAdded` and surface it the way the other
      tools surface an unreadable file, so the announcement never ends on "Checking file".
- [ ] Decide the malformed-PDF outcome in `isPdfEncrypted` above, and if it changes, cover it.
- [ ] `npm run check:fast` green, then the full `ci.yml` chain once before the push.

## Acceptance

- Unmounting Image to PDF with thumbnails present, and PDF to Image with images present, revokes
  every URL it created. Asserted in unit tests, not by inspection.
- Replacing the file while `handoffToCompress` is in flight leaves Compress un-handed and the button
  usable; the person stays on the file they picked.
- A file that cannot be read gives Security a visible error, not a permanent "Checking file".

## Evidence

Every line reference above was read at the DEBT-18 tip (`51d7907`), not carried from the review
summary. Correction recorded on purpose: the review first reported `isPdfEncrypted` as having no
error handling, and it has some, just not over `arrayBuffer`. The ticket describes the code.
