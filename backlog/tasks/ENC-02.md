---
id: "ENC-02"
title: "One quiet state with one action, shared by every tool that cannot read a protected PDF"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "now"
order: 2
depends_on: ["ENC-01"]
---

# ENC-02 · One quiet state with one action, shared by every tool that cannot read a protected PDF

*Plan sections 3 to 5. Wave 1, the Redact flow: lands with ENC-01, ENC-03 to ENC-05 and ENC-07 (Redact and Sign are the two consumers of `NeedsUnlock`).* The shell piece and the hand-off helper. No tool is wired here.

## Brief
- `src/shell/NeedsUnlock.tsx`: props `kind` (`needs-password` | `owner-restricted`), the tool, the file. Heading, one sentence, one action, **Unlock it**, with the Unlock icon; the shell's Replace stays as the way to choose another file. No modal, no banner, no failure words. Draft copy is in the plan, section 5, written so it promises nothing the flow does not do ("Then you can carry on in Redact", not "straight back"); check every claim against the code.
- `src/lib/unlockHandoff.ts`: `sendToUnlock(tool, {fileName, bytes})` wraps `saveHandoff('unlock', ...)` then navigates to `/unlock/?from=<slug>`. One map from a registry slug (`src/data/tools.js`) to `{route, handoffKey}` is the closed list `from` may name and settles the awkward cases (`compress-image` at `/compress-image/` sharing Compress's component; `edit-pdf` is the `edit-pages` folder). Lazy-import `draftStore`. The busy flag is `useNavigatingAway`.
- A failed save shows a new shell string such as "Couldn't open Unlock with this file. Open Unlock and choose it there." Redact's own "Download it instead" (`RedactFinish.tsx:73`) does not fit a protected file.
- Strings go in `ShellMessages` in **both** English and Hebrew in the same change: `hebrewShellMessages` is typed `ShellMessages`, so English-only keys fail `typecheck`. The Hebrew is a first draft, read in ENC-18.

## Acceptance
- Reviewed at 1280 and 375 with a Hebrew-named file (guidelines section 14): one state, one action, nothing else competing for the eye.
- jsdom tests: both kinds render with the right copy; the action saves the hand-off, then navigates; a failed save shows the failure line and re-enables the control; the busy flag clears on a persisted `pageshow` (`npm run test:navigating-away` passes).
- A slug outside the map is ignored by the helper and by the validator Unlock will use.
