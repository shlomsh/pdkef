---
id: "DEBT-58"
title: "A draft that restores by itself counts as a file someone opened"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "now"
depends_on: []
---

# DEBT-58 · A draft that restores by itself counts as a file someone opened

*Filed 2026-10-21.* `tool_file_accepted` fires whenever `hasFiles` turns true, with no guard for a
restore:

```ts
// src/shell/BasePdfTool.tsx
if (hasFiles && !previouslyHadFilesRef.current) {
  reportToolLifecycleEvent('tool_file_accepted', analyticsTool);
}
```

Redact, Sign and Merge all restore a draft silently on mount (`useDraftPersistence`, one memory space
per MEM-01), so a return visit and a reload each count as a file someone opened, with nobody opening
anything. ANALYTICS.md defines the event as "a valid local input is accepted by a tool", measuring
"which tool visitors actually begin using", and its change log already made this same call twice:
Merge on 2026-09-13 and Split on 2026-10-04, both on the grounds that counting work nobody asked for
makes the funnel unreadable.

## What the daily read saw

DEBT-57 filed the same discrepancy from the other side and gave us `nav` to test it with. With that
data in hand:

- 19 Oct: 193 files counted as opened in Redact, against about 46 a day across the rest of the
  fortnight. Vercel for the same day: 34 visitors to `/redact/`, against 37 on 14 Oct, with the week
  down 6%. Flat visitors, four times the opens.
- Files per page load fell to 1.01 on 19 Oct from 3.0 over the previous twelve days. A restore
  produces exactly one.
- Sign reads 108 files opened and 5 exports over fourteen days, a 5% finish rate that is mostly
  restores.
- The `nav` split on 20 Oct (41 navigate, 8 reload, 8 back_forward) does not contradict this: a
  returning visitor arriving fresh on `/redact/` still has a draft restored for them.

Tested and dropped as causes of the 19 Oct peak: deploy volume (15 Oct had 88 commits and a normal
count) and the CRITICAL_VERSION forced reload (12 Oct bumped it too and logged 54). That one day
stays unexplained, and it cost nobody anything: no failed run and no error report. It is not what
this ticket fixes.

## What should change

`BasePdfTool` already receives the signal it needs. Redact and Sign pass `checkingDraft={isRestoring}`
and Merge has its own restore, so the accepted event can tell a restore from a pick without any tool
changing its public state. Settle the ordering first: confirm whether `hasFiles` flips while
`checkingDraft` is still true, and if it does not, carry the reason the file arrived rather than
inferring it from a flag that has already cleared.

Record the decision in ANALYTICS.md's change log the way the Merge and Split entries are recorded, so
the funnel before and after stays comparable.

## Acceptance

- A draft restoring on mount sends no `tool_file_accepted`, in Redact, Sign and Merge.
- Picking a file, dropping one, and replacing one each still send exactly one.
- A unit test covers restore and pick for one editor tool and for Merge, red before the change.
- ANALYTICS.md carries the dated change-log row and the reason.
