---
id: "DEBT-58"
title: "A funnel that reads intent: visit, file in front, first edit, asked, got it"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
depends_on: []
---

# DEBT-58 · A funnel that reads intent: visit, file in front, first edit, asked, got it

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

## Decision (2026-10-21, Shlomi)

Usage and the funnel are two questions. A restore is usage and must be counted, labelled, not
dropped: dropping it (the first attempt, reverted) also dropped recent-tile opens and hand-offs,
which arrive the same way. More data is better than less; what matters is the intent behind it.

The funnel, each stage counted once per page load (`first`), run counts kept beside for volume:

1. `tool_page_viewed` with `visit`: `new`, or returning `today` / `week` / `month` / `older`,
   decided on the device from a day it keeps and never sends.
2. `tool_file_accepted` with `source`: `pick`, `drop`, `paste`, `replace`, `recent`, `handoff`
   (plus `from`), `restore`. Fires on every arrival, a replacement over a loaded file included.
3. `tool_first_edit`: the first deliberate change to that file (an element added, a page moved, an
   option changed). Sign, Redact, Edit Pages, Merge, Split, Compress.
4. `tool_operation_started`, 5. `tool_result_ready`, plus `tool_operation_failed`, unchanged.

Stages 3 to 5 carry the `source` of the file they are about, so the fresh lane and the resume lane
read apart from daily counts alone. Wire contract: `src/lib/usageEventSchema.ts`,
`src/lib/fileArrival.ts`, `src/lib/visitRecency.ts`. Storage stays inside the command budget: the
page-load field `pg:` carries source, from, nav and visit in one counter, replacing DEBT-57's `nav:`.

Background builds counted as started/ready (Compress, Split) are DEBT-59.

## Acceptance

- Every arrival path sends one `tool_file_accepted` with the right `source`, in every tool; a
  restore, a recent tile and a hand-off are told apart.
- `tool_page_viewed` once per tool page load with `visit`; the day stays on the device.
- `tool_first_edit` once per accepted file in the six tools named, never from pointermove.
- Later events carry the source of the file they are about.
- `errors:read` prints the five stages per tool as page loads, by lane and by visit.
- Unit tests red before each change; ANALYTICS.md carries the vocabulary and the dated row.
