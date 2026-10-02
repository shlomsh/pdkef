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

*Plan section 3 and 5.* The shell piece and the hand-off helper. No tool is wired here; ENC-04, 05, 06 and
07 do that.

## Brief

- `src/shell/NeedsUnlock.tsx`: props `kind` (`needs-password` | `owner-restricted`), the tool, the file.
  Renders a heading, one sentence and one action, **Unlock it**, with the Unlock icon; the shell's Replace
  stays as the way to choose another file. No modal, no banner, no failure words. Draft copy is in the
  plan, section 5; check every claim against the code before it ships (it may say "Redact can't change it as
  it is", not "restricted").
- `src/lib/unlockHandoff.ts`: `sendToUnlock(tool, {fileName, bytes})` wraps `saveHandoff('unlock', ...)`
  then navigates to `/unlock/?from=<tool>`; `from` is matched against a closed list of tool slugs. The return
  (`returnFromUnlock`) is `saveHandoff(<tool>, ...)` with the original file name, then a navigation to the
  tool. Both lazy-import `draftStore`. The busy flag is `useNavigatingAway`; a failed save shows the
  existing "Could not hand this off" wording, not a dead button.
- Until ENC-03 lands, the action may be a plain link to `/unlock/`, as Merge's and Redact's already are.
- English strings in `ShellMessages` (`src/i18n/toolMessages.ts`); Hebrew is ENC-11.

## Acceptance
- jsdom tests: both kinds render with the right copy; the action saves the hand-off and then navigates; a
  failed save shows the failure line and re-enables the control; the busy flag clears on a persisted
  `pageshow` (`npm run test:navigating-away` passes).
- `from` outside the closed list is ignored by the helper and by the validator Unlock will use.
- Two consumers exist for the lib module before the epic closes (rule 9).
