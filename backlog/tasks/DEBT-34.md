---
id: "DEBT-34"
title: "Unlock throws ReferenceError in the browser: our pdf-lib patch calls Node's Buffer"
status: "done"
priority: "P1"
epic: "robustness"
depends_on: ["ENC-13"]
---

# DEBT-34 · Unlock throws ReferenceError in the browser: our pdf-lib patch calls Node's Buffer

*Filed 2026-10-02 from `npm run errors:read -- --days 2`.* Diagnosis first; no code changed until the red test exists.

## The report
`ReferenceError` · `pdf_tool_run` · step `unlock` · /unlock/ · Chromium 154 · 3 reports. Frames in `pdf-lib.CqiVumd9.js` (line 12 col 36319 first). Usage for Unlock over the same two days: accepted 4, started 9, ready 2, failed 7. Action trail: add_files, export, download, add_files, export.

## Cause (shown, see "Evidence")
`patches/@cantoo+pdf-lib+2.11.1.patch` (added 2026-09-04 in a48b8472) puts this in `PDFStreamWriter.computeBufferSize`:

```js
object instanceof PDFInvalidObject &&
  /\/Type\s*\/XRef\b/.test(Buffer.from(object.data.subarray(0, 512)).toString('latin1'))
```

`Buffer` is a Node global. The browser has none, and nothing in the app polyfills it. It is the only `Buffer` use in all of `@cantoo/pdf-lib/es`, so it is ours. The `&&` short-circuits unless the document holds a `PDFInvalidObject` (pdf-lib's stand-in for an object it could not parse), so the throw needs such an object, then a full-rewrite `save()`. Vitest and jsdom run on Node, where `Buffer` exists, so no unit test could ever see it.

## Why Unlock, and why the second run
- **Before ENC-13** (5dcae5ea, deployed 2026-10-02) the parser decrypted the cross-reference stream, which is never encrypted. It came back as garbage, became a `PDFInvalidObject`, and `save()` hit `Buffer`. So every password-protected PDF with an xref stream (PDF 1.5+, most modern files) threw on Unlock. A protected file with a classic xref table did not. The trail fits that: file A (classic xref) unlocks and downloads, file B (xref stream) throws on export. Not shared library state; this is per file. (The shared-state alternative is tested in a browser, see Evidence.)
- **After ENC-13** that trigger is gone (measured: 0 invalid objects after load), but the `Buffer` call is still in the shipped chunk (`pdf-lib.D2SL06Dd.js`). Any PDF with one unparseable object still throws on save, in any tool using the default stream writer. That is the part still live.
- Inferred, not shown: the exact files behind the 3 production reports, and that they hit the old build. The reported chunk `CqiVumd9` returns 404 now, so the old bundle cannot be fetched; the column offsets are consistent with the current chunk (see Evidence).

## Evidence
- **Shipped chunk.** Production `/unlock/` loads `pdf-lib.D2SL06Dd.js`; `PDFStreamWriter.computeBufferSize` there contains `!e&&d instanceof Fs&&/\/Type\s*\/XRef\b/.test(Buffer.from(d.data.subarray(0,512))...)` at line 12 col 36705. The local `npm run build` produces the same chunk hash, so local and production are the same bytes.
- **Library level (Node, `Buffer` deleted to mimic a browser).** A document holding any unparseable object throws `ReferenceError: Buffer is not defined` on `save()`; with `Buffer` present the same save succeeds.
- **Why it hit protected files before ENC-13.** A throwaway copy of the library with ENC-13's parser hunk reverted: a protected xref-stream PDF leaves 1 `PDFInvalidObject` after load and throws on save without `Buffer`. The current library leaves 0 and saves fine.
- **Real browser, production build, one tab.** Unlocking a clean protected file, downloading it, then replacing it with a protected file that holds one unparseable object reproduces the report: `ReferenceError: Buffer is not defined` at `pdf-lib.D2SL06Dd.js:12:36705`, a beacon with action trail `add_files, export, download, add_files, export`, area `pdf_tool_run`, then `tool_operation_failed`. Its stack is `12:36705, 10:16524, 10:16324, 12:36212, 12:6526`; production's was `12:36319, 10:16524, 10:16324, 12:35826, 12:6239`. The two shared-helper frames match exactly and the others sit 287 to 386 columns earlier, the size of the code ENC-13 added before them. The person saw "This file could not be unlocked. It may be damaged."
- **Not shared state.** Three clean unlocks in a row all pass. The bad file fails on its first run in a fresh tab. A clean file after a failure unlocks. The second run in the report failed because it was a different file.
- **Other tools.** Every tool saves with the default stream writer, so any document that was loaded and saved whole (Unlock, Protect, Compress, Sign export, Redact) throws on one unparseable object. Merge, Split and Edit Pages copy pages into a new document and only meet it if the bad object is reachable from a copied page. Protect failed in the same red unit test. Unlock was the visible one because its input was the only common source of such an object.

## Was it ours or the person's file?
Ours. The library only inspects the bytes; the throw is a missing global in our patch. The fix is not a quiet fallback, and the report was right to fire. Two things did make the logs misleading, fixed here too:
- A wrong password counted as `tool_operation_failed`. Of Unlock's 7 failures in two days, 3 or more were this bug and the rest are most likely wrong passwords. Wrong password is now outside the failure count.
- Anything that was not a wrong password showed "It may be damaged", our own bug included. It now says something went wrong and to try again; only a file that would not open says damaged.
- A file that would not open was reported as the wrapper `UnreadablePdfError`, whose stack points at `security.js`, so every cause looked alike. The wrapper now carries `cause` and the report names it.

## Fix
- `PDFStreamWriter` patch (es and cjs): `new TextDecoder('latin1').decode(object.data.subarray(0, 512))` in place of `Buffer.from(...).toString('latin1')`. Same regex, same bytes, no Node global.
- `scripts/patch-browser-safety.test.mjs` fails on any line a patch adds outside `/cjs/` that mentions `Buffer`, `process.env` and the like: the class, not this one line.
- Error logging as above (`security.js`, `PdfSecurityTool.tsx`).

## Tests, each seen red first
- `security.test.js`: unlock (with and without object streams) and protect a file holding an unparseable object with `Buffer` deleted: red with `ReferenceError: Buffer is not defined`. `UnreadablePdfError.cause` is the original error.
- `PdfSecurityTool.test.tsx`: a wrong password stays out of `tool_operation_failed`; a non-password failure is counted and reported with its own copy; a read failure reports its cause.
- `scripts/patch-browser-safety.test.mjs`: red on the `Buffer` line.
- `src/tools/security/e2e/unlock-twice.spec.js`: clean unlock, download, replace, unlock a file with an unparseable object, in one tab on the built bundle: red at the second unlock before the patch change.

## Landing notes
- A changed `patches/*.patch` fails the auto deploy on Vercel's cached `node_modules`; Shlomi runs `vercel deploy --prod --force` after the push (ENC-13 had the same). `installCommand: "npm ci"` in `vercel.json` would end that; his call.
- Proposed, not done (it touches the privacy wording): reports never carry a message, so the cause needed a browser repro. A `ReferenceError` message is only an identifier (`Buffer is not defined`); sending just that identifier, matched against a strict identifier pattern, would have named this in one read. It needs a schema key, the endpoint, `docs/maintenance-telemetry.md` and the privacy page, so it is Shlomi's decision.
- Inferred, not shown: the three production reports came from the pre-ENC-13 build with protected xref-stream files. The reported chunk is gone, so its bytes cannot be checked.

## Outcome (2026-10-03)
Shipped and live. Production `/unlock/` loads `PdfSecurityTool.DqHjZWvp.js` -> `pdfLib.CDSp_AOP.js` -> `pdf-lib.DWZ1PWXp.js`, where `computeBufferSize` decodes with `new TextDecoder('latin1')` and the chunk holds no `Buffer.from(`. Read from the served bytes, not from the git history. The `--force` deploy went out (production deployments Ready 18 to 22 hours before this check). The telemetry-identifier proposal stays Shlomi's decision and is not part of this ticket.
