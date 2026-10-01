---
id: "RED-42"
title: "Keep Blur on / Keep Whiteout on is hidden while a brush is armed"
status: "done"
priority: "P3"
epic: "redact-tool"
depends_on: []
---

# RED-42 · Keep Blur on / Keep Whiteout on is hidden while a brush is armed

A brush stays armed until Stop or Esc (RED-32), so the Keep on chip offers nothing in brush mode. It shows only Stop there.

## Acceptance
- Brush armed: no Keep on chip, Stop present. Box mode unchanged.

## Result

`EditorToolStatus` takes `showKeepOn`; Redact passes false while a brush is armed. The hidden reservations keep the switch, so the row's height does not move. (e914ecf7)
