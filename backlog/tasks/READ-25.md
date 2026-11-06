---
id: "READ-25"
title: "The mark row's code says what it is now: a click opens it, not a rest"
status: "open"
priority: "P3"
epic: "highlight-pdf"
horizon: "later"
depends_on: []
---

# READ-25 · The mark row's code says what it is now

*Filed 2026-11-06 from READ-24, where a rest stopped opening anything.*

`RestToolbar`, `useRestToolbar`, `useToolbarDismissal`'s home and `data-rest-toolbar` still carry the name of the
gesture that used to open the row. A rest now only draws the faint outline; a click or keyboard focus opens it. A
reader of the code is told the wrong thing.

## Outcome

The row's component, hook, styles and test hook read as the mark row (13 files), the rest detector keeps its name
because it still detects a rest, and no behaviour changes. One mechanical commit, kept apart from any feature work.
