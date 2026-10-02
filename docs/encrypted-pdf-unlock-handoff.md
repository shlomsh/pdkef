# A protected PDF is a precondition: the Unlock round trip

Design record and plan, written 2026-10-02. No code yet. Tickets: ENC-01 to ENC-11 (see
[the slicing](#7-slicing)). Idea: Shlomi. Evidence: production telemetry for 2026-10-01 and 10-02, plus
runs against real encrypted fixtures made for this plan (marked **run**; everything else is **read**
from the code, and anything neither is marked **inferred**).

## Recommendation in one paragraph

Detect a protected PDF once, at the moment a tool first looks at it, with one shared classifier built on
pdf.js (`needs-password`, `owner-restricted`, `open`, `unreadable`). When a file is protected, the tool
shows one quiet state in the place of its editor (no modal, no banner, no failure language) with one
action, **Unlock it**. That action parks the file in the existing one-shot hand-off store, opens
`/unlock/?from=<tool>`, and Unlock hands the unlocked file back to the tool the same way, under its
original name. Nothing leaves the device and nothing new is stored. The protected file is never added to
recents, so there is no "pair" to reconcile: the unlocked file is simply a new file. Unlock learns to
open an owner-password-only file without asking for a password (today it cannot). The same detector and
the same component serve every tool that cannot read a protected file; Redact goes first, but Split and
Edit Pages come ahead of the rest, because they are worse than Redact (section 4).

## 1. What the evidence actually says

The idea started from two Redact error reports. The code and the runs change the picture in three ways.

**1. The two reports are almost certainly owner-password-only files, not "password needed" files.**
(Read, with the runs in section 2.) A file that needs a password to open never reaches Redact's editor:
pdf.js rejects it with `PasswordException`, the load fails, and Redact shows "This PDF didn't open. ...
A locked PDF opens in Unlock first." (`src/tools/redact/PdfRedactTool.tsx:1202-1223`; that error is
already muted from reports, `src/lib/errorReport.ts:31`). A file that is only protected against changes
(owner password, empty user password) opens in pdf.js with no prompt, so the editor mounts and the person
starts working. Then two `PDFDocument.load` calls without `ignoreEncryption` throw `EncryptedPDFError`:

- `list_objects`: `listDeletableObjects` loads at `src/editor/adapters/pdf/deleteObjects.js:628`, from an
  effect that fires on every open (`src/tools/redact/useDeletableObjects.js:26-48`, reported at `:40`),
  before pdf.js has even finished. It is swallowed, so Delete mode quietly has no targets.
- `export`: `redactPdf` loads at `src/editor/adapters/pdf/redact.js:200` (or `deleteObjectsFromPdf` at
  `deleteObjects.js:36` when Delete marks exist), reached from `handleSavePdf`
  (`PdfRedactTool.tsx:790-859`). The catch reports, counts `tool_operation_failed`, and says "Could not
  export the PDF. Your edits are still here. Try again." (`:851`), which can never succeed.

This matches the telemetry: `list_objects` under 10 seconds from a fresh load, `export` after minutes.
That the two reported files were owner-only is **inferred**; the code path and the fixtures agree, the
files themselves were never seen.

**2. The 11 `failed` cannot be proven to be this case, and today's data cannot be tightened.**
`npm run errors:read -- --days 2`, re-read 2026-10-02: Redact accepted 21, started 18, ready 7, failed 11
(the failed count did not move while ready grew from 4 to 7). Every Redact `failed` comes from the one
export catch, because Redact passes no `analyticsStatus` (`PdfRedactTool.tsx:924`), so a load failure
never counts. But the `failed` counter carries no reason (the schema is exactly `{name, properties:
{tool}}`, `src/lib/usageEventSchema.ts`), error reports are deduplicated per page load and capped, and
the digest shows each encrypted fingerprint with count 1. One page load that retried Save eleven times
fits, and so do other export failures that were never reported (a report with no frame in our built
output is dropped). So 11 = 1 report + 10 unknown. The fix for the question is not a better query; it is
to stop encrypted files reaching the catch, and to count the gate on its own event (section 5). After
that, any `failed` on Redact is not this.

**3. Other tools are worse than Redact, because they do not fail.** (**Run**, section 4.) On an
owner-only file, Split and Edit Pages load with `ignoreEncryption: true`, copy the still-encrypted page
streams, and save a structurally valid, unencrypted PDF whose pages are blank. The person gets a
"successful" download with no error and no warning. Redact's failure is the lucky one: it is loud.

## 2. Detection (question 1)

Everything here was run with pdf.js 6.3.289 and @cantoo/pdf-lib 2.11.1 on fixtures in three ciphers (RC4-128,
AES-128, AES-256), with and without object streams, with an incremental update, at 3000 pages and 42 MB.
Fixture A needs a user password; fixture B has an owner password only, an empty user password and
restricted permissions. Both were confirmed to behave as claimed in pdf.js and pdf-lib. The repo has no
encrypted fixture (a grep of `e2e`, `src/test`, `public` found none), which is itself part of how this
shipped.

| Approach | Tells A | Tells B | Cost on 42 MB | Failure mode |
| --- | --- | --- | --- | --- |
| pdf.js `getDocument`, no password | Rejects with `PasswordException`, code 1 | Resolves, and `getPermissions()` is not `null` | 35-50 ms, zero extra when the tool already opens the file with pdf.js | Needs the worker. A damaged file gives `InvalidPDFException`, a distinct honest signal |
| pdf-lib `load({ignoreEncryption: true})`, then `isEncrypted` | Yes, but cannot tell A from B | same | 5-9 ms | A truncated file with a lost trailer reads as **not encrypted** |
| pdf-lib `load({password: ''})` | Throws `'NEEDS PASSWORD'` (string match) | Succeeds | A: 6 ms. B: **about 2 s**, it decrypts everything | String-matched errors, same truncation blind spot |
| Byte scan, last 1 KB | hint only | hint only | under 1 ms | Wrong on large object-stream files (the trailer sat 30 KB from the end) and on `/Encrypt` text in a comment. Do not use |
| Byte scan, `startxref` hop plus a window | yes, cannot tell A from B | same | under 2 ms | Cannot tell damaged from plain. Optional pre-filter only |

**Recommendation: one pdf.js-based classifier**, `src/lib/pdfEncryption.ts`:

- `classifyPdfOpen(outcome)`, pure: `PasswordException` code 1 means `needs-password`; a resolved document
  whose `getPermissions()` is not `null` means `owner-restricted`; `null` means `open`;
  `InvalidPDFException` or `MissingPDFException` means `unreadable`.
- `probeEncryption(bytes)`, thin: runs `getDocument` with no `onPassword`, classifies, destroys the task.
- A tool that already opens the file with pdf.js (Sign, Redact through `loadPdf`; Split through
  `loadDocumentAndThumbnails`) classifies its own load and probes nothing twice.

Why not pdf-lib's `isEncrypted`, which Merge and Unlock use today (`merge.js:80`, `security.js:29-38`):
it cannot tell A from B, and it calls a damaged-but-encrypted file plain. Why not `{password: ''}` as a
probe: it is the right *action* (it is exactly how an owner-only file is unlocked, run: intact, text and
pixels preserved, restrictions gone) and the wrong *question*, at 2 seconds a file.

**Owner-only versus password-needed matters for the copy and for Unlock, not for the routing.** Both go
to Unlock. A needs the password field; B does not need one at all. Today Unlock cannot open B: it detects
"encrypted", shows the password field, disables the button while the field is empty
(`PdfSecurityTool.tsx:179`), and any non-empty guess fails with "The password may be incorrect". The
underlying `unlockPdf(file, '')` works (run); only the form blocks it. That is a bug independent of this
plan, and ENC-03 fixes it.

One more finding, because it changes the detector's job: pdf.js and pdf-lib disagree about files whose
Info dictionary is encrypted (pypdf, and in practice most encryptors, encrypt it). Merge's `inspectPdf`
calls `getCreationDate()` outside its try and throws on the garbled string, so such a file shows as
"unreadable" instead of "protected" (run, 3 of 4 variants; `merge.js:~88`, `PdfMergeTool.tsx:638`).

## 3. The round trip (question 3)

### What is already there (read)

- `saveHandoff(tool, {fileName, fileType, fileBytes})` and `takeHandoff(tool)` in
  `src/lib/drafts/draftStore.js:165-245`: a one-shot, 5-minute, read-and-delete record in the same
  IndexedDB database, keyed `handoff:<target tool>`. It writes no entry, work or pointer. A full
  same-origin navigation follows (`window.location.href`). Merge, Split, Redact and the home dropzone
  all send this way.
- Receivers: Sign and Redact take it in `beforeRestore` (`useEditorDraftPersistence.ts:97-103`), ahead of
  a saved draft; Compress and Split through `useHandoffIntake`. Unlock has no receiver.
- Redact's locked-PDF error already links to `/unlock/` with a plain `<a>` that carries no file
  (`PdfRedactTool.tsx:1217-1221`). Merge does the same (`PdfMergeTool.tsx:1414-1427`).
- Unlock's done state is Download and Share only (`PdfSecurityTool.tsx:199-212`); it names its output
  `<name>_unlocked.pdf`.
- `useNavigatingAway` is required for any control disabled by a navigation it starts
  (`src/lib/useNavigatingAway.ts`, enforced by `npm run test:navigating-away`; e2e guard
  `e2e/home/back-navigation.spec.js`).
- A hand-off into Sign or Redact loads with `restored = true`, and a failed load then calls `clearDraft()`
  (`loadPdf.ts:111-120`), which drops the tool's work on whatever entry its pointer names. A protected
  file arriving that way must not take that path; the gate has to be an outcome, not a failure.

### Options compared

| | A. Baton plus `?from=` slug (recommended) | B. Return-to URL carrying the tool | C. Provenance field inside the hand-off record | D. No navigation: password field inside each tool |
| --- | --- | --- | --- | --- |
| How it travels | `saveHandoff('unlock')`, then `/unlock/?from=redact`; Unlock returns with `saveHandoff('redact')` | `/unlock/?return=/redact/` | `saveHandoff('unlock', {..., from: 'redact'})` | Shared `unlockPdf` in `src/lib`, shared prompt in `src/shell`; the bytes never move |
| Survives a reload on Unlock | The intent does (`from` is in the URL); the file does not, the person picks it again | Same | Neither: the baton is consumed on arrival | n/a |
| Back button | Redact returns from bfcache with the gate still showing (`useNavigatingAway` clears) | Same | Same | n/a |
| Injection surface | `from` is matched against a closed list of tool slugs; no bytes, no names in the URL | An open redirect unless validated; avoid | None, but a record field `sw.js` mirrors | None |
| New code | A hand-off helper, an Unlock receiver, one query param | Same plus a URL validator | Schema change in the record and its service-worker twin | A password UI in the shell, `unlockPdf` moved to `lib` |
| Fit with the brief | It is the idea as stated | Same | Same | Not the idea: no round trip |

**Recommendation: A.** The URL carries only a tool slug the app already knows; the bytes travel in the
store that already carries bytes between tools; and the memory model needs no change. C looks tidy and
costs a schema change that the service worker's copy of the record would have to follow. B is A with an
open-redirect risk added.

D is the real alternative and deserves its own sentence: it is cheaper to build, has no bfcache or
reload problem, handles a wrong password inline, and needs no Playwright round trip. It is not what was
asked for, and it duplicates a password prompt that Unlock already owns. It is kept swappable on purpose:
the detector (ENC-01), the gate component's frame (ENC-02) and the telemetry (ENC-09) are the same under
either; only the component's action changes. See open decision 1.

### Behaviour, case by case (recommended design)

- **The file never leaves the device.** Same IndexedDB record, same origin, same 5-minute life, read and
  deleted on arrival. No new `connect-src`, no URL carries a name or a byte.
- **Identity across the unlock (the pair question).** The protected file is never stored: Redact and Sign
  call `cacheRecentFile` only after pdf.js accepts a file (`PdfRedactTool.tsx:466-470`), and the gate
  runs before that. So the protected hash H1 has no entry, no per-tool work and no pointer; the unlocked
  bytes H2 arrive as a brand-new file and get a fresh entry, as any hand-off does. There is nothing to
  link, and nothing to lose. One exception is real: an owner-only file that an earlier build already
  opened sits in recents as H1 today, with no work (Redact could not export it). Leave it; recency
  eviction (six entries, 28 days) removes it. Re-opening it from recents goes through `loadPdf` and meets
  the gate like any pick.
- **Name.** The return carries the person's original file name, so Redact's output is `redacted_<name>.pdf`
  and not `redacted_<name>_unlocked.pdf`. Unlock's standalone download keeps `<name>_unlocked.pdf`.
  (Open decision 3. Unlock's suffix is also the odd one out among prefixed siblings, ticket-worthy on its
  own and out of scope here.)
- **Back button / bfcache.** The sending page restores from bfcache; its busy flag is a
  `useNavigatingAway`, so "Unlock it" works again. If the page was not cached, the tool opens empty and
  the person picks the file again. Nothing is half-saved.
- **Reload mid-way.** On Unlock: the file is gone (Unlock has no draft, by design), the `from` stays, so
  once they pick the file again the "Continue in Redact" action is still there. In the gap between save
  and arrival the baton survives five minutes.
- **Abandoning Unlock.** Nothing to clean up: the baton was consumed on arrival; Unlock holds the file in
  memory only (it already holds app updates while a file is open, MEM-10).
- **Wrong password.** Stays in Unlock, inline, field refocused (already built). ENC-03 stops it saying
  "the password may be incorrect" for a damaged file, which it does today because every load failure is
  mapped to `WrongPasswordError` (`security.js:46-54`).
- **Returning with the unlocked file ready.** Unlock's done state gets one quiet verb with the tool's icon,
  "Continue in Redact", beside Download and Share, never in front of them (guidelines section 13). It
  calls `saveHandoff('redact', ...)` and navigates; Redact's existing `beforeRestore` receives it and the
  editor mounts. No change to Redact's receiving side.

## 4. Scope: which tools hit the wall (question 4)

**Run** on text-bearing 3-page fixtures unless marked read. "Blank" means a valid file whose pages
render empty; "refuses" means an error shown.

| Tool | A: needs a password | B: owner-only | Gate seam |
| --- | --- | --- | --- |
| Redact | pdf.js rejects, load error screen "This PDF didn't open" with a plain Unlock link. Not reported, not counted | Editor opens; `list_objects` and `export` throw `EncryptedPDFError` (reported, counted failed, retry cannot succeed) | `loadPdf`, shared with Sign (`loadPdf.ts:127`) |
| Sign | Same load error, "Signing stopped. The PDF may be password-protected" (`PdfWorkspace.tsx:778-787`) | Editor opens; export adapters throw (`sign.js:112`, `flatten.js:251`) | `loadPdf`, as above |
| Split | pdf.js rejects, but the prepare effect then sets status back to 'ready': an empty grid and no message (read, high confidence, `PdfSplitTool.tsx:164-169`) | **Silently blank output** | `loadDocumentAndThumbnails` (`:229`) |
| Edit Pages | Page count works, thumbnails fail, export blank | **Silently blank output**; thumbnails render (pdf.js), so the editor looks normal | `handleFilesAdded`, via the intake probe |
| Compress | pdf.js rejects at Compress, "may be password-protected" | Works (pdf.js render, output rebuilt from JPEGs, run: intact and unrestricted) | Intake probe. Also read: a file already under the target size is returned untouched at `compress.js:192-194`, so a small protected file "compresses" to itself |
| PDF to Image | pdf.js rejects at Convert, generic copy | Works (renders) | None needed for B; A gets the gate |
| Merge | Detects, per-file card, link to Unlock, the one complete handling today | Also refused as "encrypted" (`isEncrypted`) though pdf.js and `{password: ''}` handle it; some files show "unreadable" instead (Info dictionary) | Keeps its own per-file detection, swapped to the classifier (ENC-08) |
| Image to PDF | n/a, PDFs are filtered out at intake | n/a | None |
| Compress Image | Same component as Compress | same | as Compress |
| Unlock / Protect | Works | Detected as encrypted but cannot be unlocked: empty password is unreachable | ENC-03 |

So: **B is the dangerous case and A is the cosmetic one.** A never produces a wrong file (every tool
either rejects it or, in Compress's small-file case, hands the input back); B produces blank files in
two tools and a dead Save in two more.

**Is there one shared mechanism?** Yes, in three small pieces, and the module rules allow it
(`docs/module-boundaries.md`: a `lib` module and a `shell` module each need two consumers, and these have
five or more):

1. `src/lib/pdfEncryption.ts`: the classifier and probe (section 2).
2. `src/lib/unlockHandoff.ts`: `sendToUnlock(tool, file)` and the return, thin wrappers over
   `saveHandoff`, plus the closed list of tool slugs `from` may name.
3. `src/shell/NeedsUnlock.tsx`: the state, taking `kind` (`needs-password` | `owner-restricted`) and the
   tool, owning the `useNavigatingAway` flag and the failure line.

Two intake seams, because files reach a tool two ways. Picks, drops and pastes go through
`BasePdfTool.receiveFiles` (`BasePdfTool.tsx:216-230`), which is synchronous, so the probe belongs in each
tool's `handleFilesAdded` (or one opt-in prop later; not worth it for five tools). Restores, hand-offs and
Sign's `launchQueue` bypass it and call `loadPdf` directly, which is why Sign and Redact classify inside
`loadPdf`. The gate must be a distinct `loadPdf` outcome: no `clearDraft`, no `cacheRecentFile`, no
`list_objects`, no failure event.

## 5. The precondition in the tool (question 2)

One quiet state in the place of the editor or the empty grid. No modal, no banner, no word like "error",
"failed" or "could not". One action. The guidelines' rule (section 13) is a quiet secondary verb with the
target tool's icon, so the verb is **Unlock it**, and "Choose another file" stays as the shell's Replace.
Draft copy, for Shlomi to read; ENC-02 checks every claim against the code. No em dashes.

- needs-password, title: "This PDF has a password"
  body: "Unlock opens it on your device and brings you straight back to Redact."
  action: "Unlock it"
- owner-restricted, title: "This PDF is protected"
  body: "It opens without a password, but Redact can't change it as it is. Unlock takes the protection off
  on your device and brings you straight back."
  action: "Unlock it"

Notes on the copy. The body for owner-restricted claims only what was verified: pdf-lib refuses the file
(run), and Unlock's empty-password path removes the protection (run). It does not say "restricted" or
"can't be edited", because a file can carry an owner password with every permission allowed. The tool
name is substituted, so Sign says "brings you straight back to Sign". On Unlock's side, arriving with a
file from Redact in owner-only mode: no password field, one line ("No password needed. This takes the
protection off."), one button, then the done state with "Continue in Redact".

## 6. Telemetry (question 5)

Today: four lifecycle events, `{name, properties: {tool}}`, counted as `<event>|<tool>` in a daily hash
(`usageEventSchema.ts`, `api/report.ts`, `errorReportStore.ts`). The server is generic, so a new name
needs no server change. Files to touch, per the read: the schema (`TOOL_LIFECYCLE_EVENTS`, order is the
digest's order), `scripts/errors-read.mjs` (`sumUsage` hardcodes four columns and silently skips an
unlisted event), `usageEventSchema.test.ts` (pins 4 events and 44 combinations, becoming 6 and 66), the
docs that say "four lifecycle events" (`ANALYTICS.md`, `docs/maintenance-telemetry.md`), and Redact's
`lifecycleSpy` test, which asserts the exact call list.

Two new events, both anonymous, both closed-list, no new fields:

- `tool_needed_unlock` with `tool` = the tool that showed the gate. Fired once per file when the gate
  shows, not per render.
- `tool_returned_unlocked` with `tool` = the tool that received the file back (fired on a hand-off that
  carries the return marker, so it is not confused with an ordinary Merge to Sign hand-off).

The funnel per tool is then needed, Unlock's own accepted and ready (already counted under `unlock`),
returned. A person who abandons shows as needed with no returned.

What the digest's definitions become, to go in `errors-read.mjs` output and in the scheduled-task prompt
(that prompt lives in `~/.claude/scheduled-tasks/pdkef-daily-error-read/SKILL.md`, outside the repo; ENC-09
updates the wording and Shlomi owns the task):

- **accepted**: a file is in the tool. Includes files that stopped at the gate.
- **needed unlock**: the gate showed. Not a failure, not counted in `failed`.
- **returned**: the file came back unlocked.
- **started / ready / failed**: unchanged. `failed` means an exception caught during the run; it no longer
  includes a protected file. The digest also prints `ready / (accepted - needed unlock)` beside
  `ready/accepted`, labelled, so the gate does not read as a dropping success rate.
- An `EncryptedPDFError` report after the gate ships is a detector miss and a P1, so it stays reported.
  Do **not** add it to `IGNORED_ERROR_NAMES`: that list is for the person's file problems that our code
  handles, and here the gate is the handler.

## 7. Slicing

All in the `robustness` lane except ENC-04 (`redact`) and ENC-11 (`search-and-languages`), and nothing is
`in_progress`. Each is one narrow
brief for one Sonnet subagent: named files, one `check:fast`. The shape of the contracts is written first
(ENC-01 and ENC-02 define them); the rest run in parallel against them.

| Ticket | What | Depends on | Notes |
| --- | --- | --- | --- |
| ENC-01 | The classifier and the fixtures. `src/lib/pdfEncryption.ts`, unit tests, checked-in tiny fixtures (A and B, AES-256, one with an encrypted Info dictionary; generated once with pypdf, plus pdf-lib generated ones in tests) | none | P1. Fixes the missing-fixture gap |
| ENC-02 | `src/shell/NeedsUnlock.tsx`, `src/lib/unlockHandoff.ts`, shell messages (English; Hebrew in ENC-11), jsdom tests including the navigating-away flag | ENC-01 | P1. Until ENC-03, the action may be a plain link, as Merge's is today |
| ENC-03 | Unlock: receive the hand-off, owner-only opens with no password field, "Continue in <tool>", damaged versus wrong password | ENC-02 | P1. Fixes "cannot unlock an owner-only file" by itself |
| ENC-04 | Redact: gate in `loadPdf` as an outcome (no `clearDraft`, no recent, no `list_objects`), the component in place of the editor, the export catch shows the gate on `EncryptedPDFError` as a belt | ENC-01, ENC-02 | P1, `redact` lane |
| ENC-05 | Sign: same `loadPdf` outcome, replace the alert copy | ENC-04 | P2, small |
| ENC-06 | Split and Edit Pages: probe at intake, show the gate, stop the blank outputs; fix Split's status-overwrite so a load failure is visible | ENC-01, ENC-02 | P1: data integrity, silent |
| ENC-07 | Compress and PDF to Image: gate at intake; Compress's under-target early return no longer hands back a protected file | ENC-01, ENC-02 | P2 |
| ENC-08 | Merge: classify with the classifier, fix the `getCreationDate` misclassification, accept an unlocked file back into the set | ENC-01, ENC-03 | P2. Needs a receiver Merge lacks; may split |
| ENC-09 | Telemetry: the two events, digest columns, new definitions, the docs and the scheduled-task wording | ENC-02 | P2 |
| ENC-10 | Tests across pages: `e2e/handoff/encrypted-roundtrip.spec.js` | ENC-03, ENC-04 | P1. See section 8 |
| ENC-11 | Hebrew: shell strings for the gate; Redact and Unlock are not localized islands today | ENC-02 | P3, waits on open decision 5 |

Suggested waves: **1** ENC-01 and ENC-02 (the contract, one lead-written, reviewed). **2** ENC-03, ENC-04,
ENC-06 in parallel, disjoint files. **3** ENC-05, ENC-07, ENC-09, then ENC-10 to close. ENC-06 is first in
priority order if capacity is short, because it stops wrong files being written; the round trip can follow.

## 8. Tests (question 6)

**Unit (Vitest):**
- The classifier over each fixture: A, B, plain, truncated, empty, an Info-encrypted file, and the pure
  `classifyPdfOpen` over stubbed outcomes. If pdf.js loads under node as it did in these runs, the
  probe is tested on real bytes; otherwise the pure function plus one integration case.
- `loadPdf`: a protected file returns the gate outcome and does not call `cacheRecentFile`, `clearDraft`
  or start `useDeletableObjects`.
- `NeedsUnlock` (jsdom): both kinds render, the action saves the hand-off then navigates, the busy flag is
  `useNavigatingAway`, a failed save shows the failure line.
- Each island test (`PdfRedactTool.test.tsx` has the lifecycle spy): a protected file emits
  `tool_needed_unlock` and never `tool_operation_failed`.
- A cross-tool table test in `src/test/cross-tool/`: every tool's intake against A, B and plain, so a
  tool that adds an intake path later cannot skip the gate. That is the test that would have caught
  Split's blank output.

**Playwright, only what jsdom cannot show:** the round trip across pages, which the module rules say lives
in `e2e/handoff/`, not under a tool folder (rule 7). One spec: B in Redact, gate shown and no
`tool_operation_failed` beacon sent; Unlock It; Unlock arrives with the file and no password field;
Continue; Redact has the editor, a box is drawn, Save produces a file pdf.js opens with the text redacted;
then Back from Unlock (with the bfcache flags `back-navigation.spec.js` uses), and the wrong-password
and reload-mid-way cases for A. The e2e that would have caught the original bug is the first step of that
spec: a Redact run on an owner-only fixture. The reason it was never written is that no encrypted fixture
existed, and the guidelines' section 14 already warns that a fixture meant to fail must be checked to
really fail (a pdf-lib "encrypted" fixture once did not). ENC-01 owns that, which is why it comes first.

## 9. Open decisions for Shlomi

1. **Round trip, or a password field in the tool?** Recommended: the round trip, as you described, because
   Unlock stays the one place passwords are handled. The cost is two page navigations and a Playwright
   spec. The alternative (D) is cheaper and has no bfcache edge, and the plan makes it a late swap.
2. **Is an owner-only file "needs unlock"?** Recommended: yes, with one tap in Unlock and no password
   field. Unlock would then remove protection that someone set with an owner password, which it does for
   a password-needed file today. Say if you would rather the tools decline those files and never offer it.
3. **Returned file keeps its original name** (recommended), or is named `<name>_unlocked.pdf`?
4. **Merge** needs a way to accept the file back into a set that is already open. Do it in this epic
   (ENC-08 as written) or leave Merge on its static link until later?
5. **Hebrew.** Redact and Unlock are not localized islands, so the gate's strings reach `/he/` only
   through the shell messages, and there is no `/he/redact/` page. Add the strings anyway (ENC-11), or
   hold until the Hebrew programme says otherwise?
6. **The daily read.** The new definitions go in the scheduled-task prompt, which is yours. OK for me to
   edit it, or you do?
7. **Cost accepted?** The probe adds one worker pass (about 40 ms on 42 MB) in tools that did not parse
   the file at intake.

Unrelated, seen in the same digest, not in this plan: Redact `read_glyphs` and `render_page`
`TypeError`s (chromium 143, `/redact/`), one report each.
