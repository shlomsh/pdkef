---
id: "DEBT-61"
title: "The home page counts its own visits, new or returning, like the tool pages"
status: "in_progress"
priority: "P2"
horizon: "now"
epic: "robustness"
depends_on: []
---

# DEBT-61 · The home page counts its own visits, new or returning, like the tool pages

Filed 2026-10-22 from the daily report, at Shlomi's request: "I do not see visitors on the main page."

## Why

Only tool pages send `tool_page_viewed` (`BasePdfTool.tsx`), so the daily dashboard has no row for `/`
and `/he/`, and anyone who looks at the home page and leaves is counted nowhere. The home page is
where most people arrive.

## Outcome

- The home page (every edition) sends one `tool_page_viewed` with `tool: 'home'` per page load, after
  `load`, through a lazy import, so nothing is added to the first screen.
- `home` is valid on `tool_page_viewed` only. It is not an analytics tool: ratings, hand-offs and `from`
  never take it.
- It carries the same `visit` bucket and shares the one last-visit day with the tool pages, so a person
  is counted once a day on the first PDkef page they see. From this change, someone who arrives through
  the home page has their tenure on the `home` row, and their tool page reads `today`. ANALYTICS.md
  records the break.
- `errors:read` prints the home row with no script change (it is generic over the page name); a unit
  test pins that.
