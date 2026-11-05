---
id: "DRIVE-02"
title: "The home dropzone opens from Google Drive"
status: "in_progress"
priority: "P2"
epic: "polish"
horizon: "now"
order: 2
depends_on: ["DRIVE-01"]
---

# DRIVE-02 · Home dropzone

The most important way in. A static link in the launcher, in the server render from the start, so the
first screen does not shift. After the pick the person lands back on the home page exactly as if they
had dropped the file: the tile names it and the dock lights.

## Acceptance

- The link carries the unmodified Google Drive logo and the words "Open from Google Drive", in English
  and on `/he/`, and returns to the page it came from.
- Hidden offline. No Google script or connection on the home page (`test:csp`).
- Layout guards in `e2e/home/` stay green at their sizes.
