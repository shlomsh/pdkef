---
id: "ENC-08"
title: "Compress meets a protected PDF at the door and leads back after Unlock"
status: "done"
priority: "P2"
epic: "robustness"
order: 3
depends_on: ["ENC-01"]
---

# ENC-08 · Compress meets a protected PDF at the door and leads back after Unlock

*Plan section 4. PDF to Image moved to ENC-14 on 2026-10-02 before work started, so this ticket is Compress (and Compress Image, the same component, whose images skip the check).* Both parse the file only on the main button (`compress.js:59`, `:200`; `toImage.js:95`), so a needs-password file is accepted and rejected later with generic copy. An owner-only file works in both (pdf.js only, output intact, run), so only `needs-password` is gated.

## Brief
- Probe at intake in `handleFilesAdded`; show the shared state. Compress Image is the same component (`/compress-image/`). PDF to Image has no hand-off receiver, so add one.
- Compress: a file already under the target size is returned untouched at `compress.js:192-194`, before any parse, so a small needs-password file "compresses" to itself. Probe before that return.

- The detour contract (2026-10-02, Shlomi's QA): the tool that meets a protected file parks it for Unlock with `from: '<its key>'`; Unlock's done state then leads with "Continue in <tool>" and a quiet download, and hands the unlocked file back (`RETURN_TO` in `PdfSecurityTool.tsx`, guideline 13). Unlock already leads back to Compress; this ticket adds the sending side (`from: 'compress'`). Compress already receives hand-offs (`useHandoffIntake`); PDF to Image and Compress Image need their key in `RETURN_TO` and a receiver.

## Acceptance
- The round trip spec gains a Compress case: needs-password file in Compress, Unlock it, the password, Continue in Compress, Compress has `<name>_unlocked.pdf` ready to run.
- Island tests per route: needs-password shows the state before the button exists; owner-only proceeds and the output is intact; a small needs-password file never comes back labelled compressed.

## Result

Shipped on `fix/unlock-done-state` (cd368332, dde738d2). Compress probes a picked PDF with `probeEncryption` at intake; `needs-password` shows `NeedsUnlock` with `from: 'compress'` in place of the options and the button, so a small protected file never comes back as "compressed". Owner-only files compress as before; images are never probed; any newer pick drops a probe in flight (review finding, test first). Island tests: `PdfCompressTool.protected.test.tsx`; round trip: `e2e/handoff/encrypted-roundtrip-compress.spec.js`. Checked at 1280 and 375.
