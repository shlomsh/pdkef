---
id: "SEO-56"
title: "The rating dialog points bugs and ideas to GitHub, and five stars may leave words a person agrees to show"
status: "in_progress"
priority: "P2"
epic: "search-and-languages"
horizon: "now"
---

# SEO-56 · Bugs and ideas go where they can be answered; happy people may leave words

Filed 2026-11-06 from Shlomi's read of the first comment: "The blurring tool is too strong, would be great to be
able to adjust it". The blur slider already exists, and an anonymous comment can't be answered.

## What

- Beside the reason a low rating asks for, a panel says a bug or an idea can be answered on GitHub. Report a bug opens
  the issue template; Suggest an idea opens the Ideas category of Discussions, where `.github/ISSUE_TEMPLATE/config.yml`
  sends ideas.
- After five stars, a person may add a few words. A box, unticked by default, lets PDkef show them on the site with
  their region and no name. Only a tick puts `share: true` on `tool_rating_comment` and in the `rating:entries` record.
- `npm run ratings:read` marks those comments `[may show]`. The disclosure in `docs/maintenance-telemetry.md` says so.
- The low-rating flow is otherwise unchanged (it is by design).

## Done when

- A comment with the box ticked lands in production with `share: true`, seen through `npm run ratings:read`.
