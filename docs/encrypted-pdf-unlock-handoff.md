# A protected PDF is a precondition: the Unlock round trip

Design record and plan, written 2026-10-02. No code yet. Tickets: ENC-01 to ENC-12 (see
[the slicing](#7-slicing)). Idea: Shlomi. Evidence: production telemetry for 2026-10-01 and 10-02, plus
runs against real encrypted fixtures made for this plan (marked **run**; everything else is **read**
from the code, and anything neither is marked **inferred**).

## Recommendation in one paragraph

Scope settled with Shlomi on 2026-10-02, kept deliberately small (section 9). A person picks a protected
PDF in Redact. Instead of an exception, Redact shows one quiet state: the file is locked, with two ways
forward, **Choose another file** or **Unlock it**. "Unlock it" parks the file in the existing one-shot
hand-off store and opens the Unlock tool with the file already loaded, exactly as if the person had picked
it there, so Unlock shows its normal password prompt (for a file that only has an owner password there is
no password to ask for, so Unlock just opens it). When Unlock is done, its done state gets two quiet next
steps beside Download and Share, **Redact it** and **Sign it**, using the same hand-off Merge and Redact
already use. Nothing leaves the device and nothing new is stored. One shared pdf.js classifier decides
"protected" (section 2). Everything else in this plan (the other tools, telemetry, Hebrew) is parked as
follow-ups that reuse the same pieces.

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
  (`PdfRedactTool.tsx:790-852`). The catch reports, counts `tool_operation_failed`, and says "Could not
  export the PDF. Your edits are still here. Try again." (`:849`), which can never succeed.

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
(`PdfSecurityTool.tsx:183`, and `handleSubmit` returns early at `:93`), and any non-empty guess fails with "The password may be incorrect". The
underlying `unlockPdf(file, '')` works (run); only the form blocks it. That is a bug independent of this
plan, and ENC-03 fixes it.

One more finding, because it changes the detector's job: pdf.js and pdf-lib disagree about files whose
Info dictionary is encrypted (pypdf, and in practice most encryptors, encrypt it). Merge's `inspectPdf`
calls `getCreationDate()` outside its try and throws on the garbled string, so such a file shows as
"unreadable" instead of "protected" (run, 3 of 4 variants; `merge.js:75`, `PdfMergeTool.tsx:638`).

## 3. The round trip (question 3)

### What is already there (read)

- `saveHandoff(tool, {fileName, fileType, fileBytes})` and `takeHandoff(tool)` in
  `src/lib/drafts/draftStore.js:165-245`: a one-shot, 5-minute, read-and-delete record in the same
  IndexedDB database, keyed `handoff:<target tool>`. It writes no entry, work or pointer. A full
  same-origin navigation follows (`window.location.href`). Merge, Split, Redact and the home dropzone all
  send this way.
- Receivers: Sign and Redact take it in `beforeRestore` (`useEditorDraftPersistence.ts:97-103`), ahead of
  a saved draft; Compress and Split through `useHandoffIntake`. Unlock has no receiver; adding one is a few
  lines, and the file then goes through the tool's own `handleFilesAdded`, so its normal password prompt
  appears.
- Redact's locked-PDF error already links to `/unlock/` with a plain `<a>` that carries no file
  (`PdfRedactTool.tsx:1217-1221`).
- Redact's done state has the row to copy: "Compress it" and "Sign it" (`RedactFinish.tsx:55-76`), each a
  button with the target tool's icon, a `useNavigatingAway` busy flag and a failure line.
- Unlock's done state is Download and Share only (`PdfSecurityTool.tsx:197-210`); it names its output
  `<name>_unlocked.pdf`.
- `useNavigatingAway` is required for any control disabled by a navigation it starts
  (`src/lib/useNavigatingAway.ts`, enforced by `npm run test:navigating-away`; e2e guard
  `e2e/home/back-navigation.spec.js`).
- A hand-off into Sign or Redact loads with `restored = true`, and a failed load then calls `clearDraft()`
  (`loadPdf.ts:111-120`), which drops the tool's work on whatever entry its pointer names. A protected file
  must not take that path: the gate has to be an outcome, not a failure.

### The design

- **Out, Redact to Unlock.** "Unlock it" calls `saveHandoff('unlock', ...)` with the protected bytes and
  navigates to `/unlock/`. Redact's busy flag is a `useNavigatingAway`. If the save fails, the state says
  so in a line and the person can open Unlock themselves.
- **In, Unlock.** `useHandoffIntake('unlock', ...)` hands the file to `handleFilesAdded`. A file that needs
  a password gets the existing prompt. A file with only an owner password is opened without asking, because
  today Unlock cannot open it (the button is disabled while the field is empty, `PdfSecurityTool.tsx:183`,
  and `handleSubmit` returns early, `:93`) and the production errors are almost certainly this kind.
- **Back, Unlock to Redact or Sign.** Two buttons in the done state, **Redact it** and **Sign it**, each
  `saveHandoff('<tool>', {fileName: '<name>_unlocked.pdf', ...})` then a navigation. The receivers already
  exist. The buttons are always there after an unlock, not only when the person came from Redact, which is
  what guidelines section 13 asks for (Unlock to Sign is already a listed candidate).
- **One small addition.** No `?from=` and no return marker; the hand-off record Redact writes carries
  `from: 'redact'` (2026-10-02, after Shlomi's QA: a person sent over from Redact should be led back),
  and Unlock's done state then leads with "Continue in Redact". There is no pair of hashes to reconcile: the unlocked file is a new file. (Found in review: an
  owner-only file can still reach Redact's recents, because the preview effect in `useDraftPersistence.js`
  caches once pdf.js renders it and does not wait for the gate. It is harmless: opening it from there
  meets the gate again.)

### Cases

- **The file never leaves the device.** Same IndexedDB record, same origin, five minutes, read and deleted on
  arrival. No new `connect-src`, no URL carries a name or a byte.
- **Nothing irreversible.** Unlock produces a new file named `<name>_unlocked.pdf`; the original is never
  touched, so the name itself tells the person which is which. A crash on the way to Unlock costs one
  re-pick (nothing was edited: the gate comes before the editor). A crash between Unlock finishing and a tap
  loses only the in-memory result, and Download is right there. This is the one thing the simple design
  trades away against the crash-resume idea (see decision 3).
- **Back button.** Redact restores from bfcache with the gate still showing; the busy flag clears
  (`useNavigatingAway`), so "Unlock it" works again. Without bfcache the tool opens empty and the person
  picks the file again.
- **Reload on Unlock before it finishes.** The file is gone (Unlock has no draft, by design); pick it again.
- **Abandoning Unlock.** Nothing to clean up; the hand-off was consumed on arrival.
- **Wrong password.** Stays in Unlock, inline, field refocused (already built).
  The text for a damaged file is wrong today: `unlockPdf` maps every load failure to `WrongPasswordError`
  (`security.js:45-54`) and the message is hard-coded at `PdfSecurityTool.tsx:193`. ENC-03 separates the two.
- **Polish.** The two arrival moments are the whole experience: Redact's state and Unlock opening with the
  file already loaded. Both are reviewed at 1280 and 375, measured, per guidelines section 14.

### Considered and not chosen

- A password field inside each tool (no navigation): cheaper to build and has no bfcache edge, but it
  duplicates a prompt that Unlock already owns, and it is not the suite shape Shlomi chose.
- Carrying the originating tool in the URL so Unlock can send the file back only to it, and writing the
  result into the memory space so a crash resumes: more design for a flow that already has Download as the
  fallback. Parked; the plan's earlier version of this section had it and the review of it is in the
  commit history.

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
| Merge | Detects, per-file card, link to Unlock, the one complete handling today | Also refused as "encrypted" (`isEncrypted`) though pdf.js and `{password: ''}` handle it; some files show "unreadable" instead (Info dictionary) | Keeps its own per-file detection, swapped to the classifier, plus a receiver (ENC-09) |
| Image to PDF | n/a, PDFs are filtered out at intake | n/a | None |
| Compress Image | Same component as Compress | same | as Compress |
| Unlock / Protect | Works | Detected as encrypted but cannot be unlocked: empty password is unreachable | ENC-03 |

So: **B is the dangerous case and A is mostly cosmetic.** A is rejected by pdf.js everywhere except
where a tool never opens it: Edit Pages writes a blank file from it too (page count works on a protected
file, run), and Compress hands a small one back untouched. B produces blank files in two tools and a dead
Save in two more.

**Is there one shared mechanism?** One piece, now: the classifier in `src/lib/pdfEncryption.ts`, which two
consumers (Redact's `loadPdf` and Unlock) use from the first slice. The state and the "Unlock it" action stay
in the Redact folder until a second tool needs them; then they are promoted to `src/shell` (module-boundaries
rule 9: two consumers, no allowlist). The follow-ups (ENC-06 to ENC-09) reuse the classifier and add their own
state or promote the first.

Files reach a tool two ways, which matters for the follow-ups. Picks, drops and pastes go through
`BasePdfTool.receiveFiles` (`BasePdfTool.tsx:216-230`), which is synchronous, so a probe belongs in each
tool's `handleFilesAdded`. Hand-offs into Split and Compress reach the same `handleFilesAdded` through
`useHandoffIntake`. Restores, hand-offs and Sign's `launchQueue` into Sign and Redact bypass it and call
`loadPdf` directly, which is why Redact classifies inside `loadPdf`. Sign shares that function, so the gate
is an optional callback: a tool that passes none keeps today's behaviour, and the slice does not touch Sign.

**A tool that offers "Unlock it" must be able to receive the file back.** Sign and Redact (`beforeRestore`),
Split and Compress (`useHandoffIntake`) can today; Edit Pages, PDF to Image and Merge cannot, so their
follow-up tickets add a receiver.

## 5. The precondition in Redact (question 2)

One quiet state in the place of the editor. No modal, no banner, no word like "error", "failed" or "could
not". Two actions: **Unlock it** (the target tool's icon, per guidelines section 13) and the shell's
existing Replace, which reads as Choose another file. Draft copy for Shlomi to read. No em dashes.

- locked, title: "This PDF has a password"
  body: "Unlock opens it on your device, then you can redact it."
- protected, title: "This PDF is protected"
  body: "It opens without a password, but Redact can't change it as it is. Unlock takes the protection off on
  your device, then you can redact it."

The second body claims only what was verified: pdf-lib refuses the file (run) and Unlock's empty-password
path removes the protection (run). It does not say "restricted", because a file can carry an owner password
with every permission allowed. Redact's strings are plain English in the component today
(`PdfRedactTool.tsx`), so these follow suit; Redact and Unlock are not localized islands
(`src/i18n/localizedTools.ts`) and have no `/he/` page. The state lives in the Redact tool folder: a shell
module needs two consumers (module-boundaries rule 9) and this has one until another tool joins.

## 6. Telemetry (question 5)

What the simple scope does on its own: a protected file stops at the gate before the editor, so it never
reaches the export catch, never counts `tool_operation_failed`, and sends no error report. After it ships,
any `failed` on Redact is not this case, and an `EncryptedPDFError` report means the gate missed something,
so that name stays reported (do **not** add it to `IGNORED_ERROR_NAMES`).

What it does not do: count the funnel. Today there are four lifecycle events and `failed` carries no reason
(`usageEventSchema.ts`; a new event name needs the schema, `scripts/errors-read.mjs`'s hardcoded columns,
`usageEventSchema.test.ts`'s pinned counts of 4 and 44, and the docs that say "four"). A later ticket
(ENC-10) can add `tool_needed_unlock` (the gate showed) and `tool_returned_unlocked`; for now the funnel is
readable from `unlock` accepted and `redact` accepted. The scheduled-task prompt
(`~/.claude/scheduled-tasks/pdkef-daily-error-read/SKILL.md`, outside the repo) gets one edit when ENC-02
ships: the known Redact `EncryptedPDFError` item is resolved, and a new one is a gate miss. Shlomi approved
my editing it.

## 7. Slicing

Five tickets are the whole scope, each one narrow brief for one Sonnet subagent: named files, one
`check:fast`. They land as one slice, and nothing is pushed without Shlomi's go. The classifier lives in
`src/lib` and has two consumers (Redact's `loadPdf` and Unlock), which satisfies module-boundaries rule 9.

| Ticket | What | Depends on |
| --- | --- | --- |
| ENC-01 | The classifier and the fixtures: `src/lib/pdfEncryption.ts`, unit tests, tiny checked-in fixtures (needs-password and owner-only in AES-256, each also with an encrypted Info dictionary, plain, truncated; made once with pypdf, script beside them) | none |
| ENC-02 | Redact: the gate as a `loadPdf` outcome, the state in the Redact folder in place of the editor, "Unlock it" hands the file to Unlock, no exception, no failed count | ENC-01 |
| ENC-03 | Unlock: receive the hand-off, an owner-only file opens with no prompt, wrong password versus damaged file | ENC-01 |
| ENC-04 | Unlock's done state: **Redact it** and **Sign it** | ENC-03 |
| ENC-05 | One Playwright spec for the round trip | ENC-02, ENC-04 |

Parked follow-ups, all reusing the same pieces, none required to ship the slice:

| Ticket | What |
| --- | --- |
| ENC-06 | Split and Edit Pages stop writing blank pages from a protected file (section 4). Not in the slice, but **recommended next**: the code guarantees a blank download today, silently |
| ENC-07 | Sign: show the same state instead of its alert |
| ENC-08 | Compress, Compress Image and PDF to Image: gate at intake |
| ENC-09 | Merge: tell a protected file from an unreadable one (the `getCreationDate` bug), and take the unlocked file back |
| ENC-10 | The two telemetry events and the digest columns |
| ENC-11 | The cross-tool intake table test |
| ENC-12 | One shared hand-off row: Merge, Redact, Split and now Unlock each carry their own copy |

## 8. Tests (question 6)

**Unit (Vitest):**
- The classifier over each fixture (needs-password, owner-only, each with an encrypted Info dictionary,
  plain, truncated, empty) and the pure `classifyPdfOpen` over stubbed outcomes. The repo has no encrypted
  fixture today (a grep of `e2e`, `src/test` and `public` found none), and guidelines section 14 warns that
  a fixture meant to fail must be checked to really fail, so ENC-01 owns that.
- `loadPdf`: a protected file returns the gate outcome and does not call `cacheRecentFile`, `clearDraft` or
  start `useDeletableObjects`.
- Redact island test (`PdfRedactTool.test.tsx`): the state shows, the editor never mounts, no
  `tool_operation_failed`, "Unlock it" saves the hand-off then navigates, a failed save shows the line.
- Unlock: an owner-only file opens with no prompt, a needs-password file shows it, a wrong password and a
  damaged file give different messages, the two done-state buttons save the hand-off and navigate.

**Playwright, only what jsdom cannot show:** one spec in `e2e/handoff/` (it visits two tools' routes, so it
cannot live under a tool folder, rule 7). An owner-only file in Redact shows the state and sends no
`tool_operation_failed` beacon; Unlock it; Unlock has the file and opens it with no prompt; Redact it; Redact
has the editor, a box is drawn, Save produces a file pdf.js opens with the text gone. A second case for a
file that needs a password: the prompt appears, a wrong password is refused, the right one unlocks. This is
the spec that would have caught the original report; it was never written because there was no encrypted
fixture. Chromium only.

## 9. Decisions

Shlomi, 2026-10-02:

1. **Round trip: yes**, as a suite of tools handing work to each other, with the experience polished.
2. **Owner-only files:** keep it simple. One rule, "protected means Unlock": the same state and action for
   both kinds; Unlock does not ask for a password where none exists.
3. **Name and crashes.** The returned file is `<name>_unlocked.pdf`, not the original name, so the flow never
   leaves an irreversible state. The crash-resume idea (writing the result into the memory space so a
   reload resumes it) is dropped in the simplification: Download is the fallback.
4. **Scope, simplified:** the Redact flow only. Redact shows the precondition; Unlock opens the file as if
   picked; Unlock's done state gets Redact and Sign buttons. "Wrap it up right there."
5. **Hebrew:** moot for the slice, since Redact and Unlock have no `/he/` page and their strings are English.
6. **Daily read:** I edit the scheduled-task prompt when ENC-02 ships.

Unrelated, seen in the same digest, not in this plan: Redact `read_glyphs` and `render_page`
`TypeError`s (chromium 143, `/redact/`), one report each.
