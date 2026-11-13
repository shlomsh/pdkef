---
id: "SEO-62"
title: "A person who rated is never asked again, sees their own stars, and five stars invite one line"
status: "done"
priority: "P2"
epic: "search-and-languages"
depends_on: ["SEO-55", "SEO-56"]
---

# SEO-62 · Asked once, and an easy line after five stars

Shlomi, 2026-11-13: someone who already gave a rating should not be asked again; they can see it read-only. And a kind,
non-commercial nudge to add a few words beside the stars. He picked option E from the mock
(https://claude.ai/artifact/DpxBtgKahcybsQbYaCHxJP).

## What changes

- **Asked once, app-wide.** A device that rated any tool is never asked again, in any tool. Before this, only the same
  tool was skipped and another tool could ask after 14 days. Devices that rated before this ship still carry
  `pdkef:rated:<tool>`, so they are covered too.
- **Their own stars, read-only.** `markRated` also keeps the stars on the device (`pdkef:my-stars`). Where the ask would
  open after a download, a rated device sees one quiet line instead: "You gave PDkef ★★★★★. Thank you." (1 to 4 stars:
  "Thank you for telling me."; a device that rated before this ship, with no stars kept: "Thank you for rating PDkef.").
- **Five stars, option E.** The thanks step keeps the five filled stars in view, then "Thank you, that really helps.",
  then the words box first: "What would you tell a friend about it?", "One line is plenty. It helps the next person know
  what it's like.", signed "I read every one. Shlomi". Share and the GitHub star move to one quiet line below it.
- English and Hebrew strings.

Not in this ticket: changing a vote. Votes are anonymous with no id, so the server cannot replace one; a "Change it" link
needs a per-vote random code and a server change, and only helps votes made after it ships. Proposed separately if wanted.

## Done when

- A device with any rating is never shown the ask again (unit tests over `shouldAsk`, both the new and the old marker).
- The quiet line shows the right one of three texts after a download (unit tests on `RatingPrompt`).
- The five-star thanks step renders option E in order, in English and Hebrew (unit tests on `RatingModal`).
- Checked on a production build at phone and desktop width.

## Outcome

Built and checked on a production build (2026-11-13): Redact at 390 and 1280 shows option E in order; a device with
`pdkef:my-stars` 5 gets no dialog and "You gave PDkef ★★★★★. Thank you."; the legacy marker alone gives "Thank you for
rating PDkef."; Compress with 3 stars gives the lower tail; Hebrew strings render on /he/compress/.
