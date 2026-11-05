---
id: "MEM-30"
title: "A person can remove a recent file, and clear them all (GitHub issue 44)"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# MEM-30 · A person can remove a recent file, and clear them all

*Opened 2026-11-05* from GitHub issue 44 (2026-10-27, our first bug report): "I am not able to remove the files
which I uploaded for the edits for Data Security." The report has no details and the reporter has not answered
the follow-up questions; this ticket is the reading of the code, not a confirmed reproduction.

## What is wrong

Nothing in the UI lets a person take a file out of recents.

- A recent tile (`src/site-lib/RecentFiles.tsx`) is one button that opens the file. No remove control.
- A tool's Clear all drops that tool's work and keeps the file in recents (MEM-01's entry model, pinned by tests).
- Files leave only by expiry (28 days) or when newer files push them past `MAX_RECENT_FILES`.
- `removeRecentMeta` and the entry delete exist in `src/lib/drafts/` but no user action calls them.

The files stay on the person's own device, so this is not a leak. It is a missing control for someone who wants
the device clean, and it undercuts the privacy story the site tells.

## Outcome

On the home page, each recent tile has a quiet Remove, and the list has a Clear recent files. Either one deletes
the entry from IndexedDB with all of its work in every tool, drops it from the recents index and from any tool's
current-entry pointer, and empties any tab that still has it open (`draftRemovalWatch.ts`: Shlomi chose this on
2026-11-05, since a save from that tab would otherwise write the file back). Plain words in the project
voice (no security jargon, no em dashes), English and Hebrew.

## Acceptance

- [x] A shared helper in `src/lib/drafts/` removes one entry and one removes all, pure where it can be, with unit
  tests written failing first.
- [x] The tile control is reachable by keyboard and by touch, and does not open the file.
- [x] Removing the entry a tool currently points at leaves that tool on a clean empty state, not an error.
- [x] One Playwright spec: open a file, remove it from its tile, reload, it is gone from recents and its work does
  not come back.
- [x] A short reply on GitHub issue 44 once it ships.
