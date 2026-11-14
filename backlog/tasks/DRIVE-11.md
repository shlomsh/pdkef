---
id: "DRIVE-11"
title: "Drive Open with: the tool choice shows at once, the file downloads behind it"
status: "done"
priority: "P2"
epic: "polish"
depends_on: []
---

# DRIVE-11 · Drive Open with: the tool choice shows at once, the file downloads behind it

*Filed 2026-11-14, from Shlomi's read of DRIVE-10 in production.* Signed in, Open with still took three
screens: Drive's own launch tab, "Getting your file from Google Drive...", then "What would you like to
do with it?". The question does not depend on the file, so the wait in front of it is wasted. A default
tool was considered and dropped: the intent behind Open with cannot be assumed.

## Outcome

- With a token in hand, `/drive/` shows the tool choice straight away while the file downloads.
- A tool tapped before the file has arrived opens as soon as it does; the other choices wait.
- A download that fails still lands on the Sign in with Google button or the error line, as before.
- The installed app's chooser on `/open/` behaves as it does today.
- Unit tests for the arriving state in `OpenWithChooser.test.tsx` and `DriveOpen.test.tsx`, seen failing
  first.

Done 2026-11-14. `OpenWithChooser` takes `file` and `arriving`; `DriveOpen` shows it the moment a fetch
starts and passes the file when it lands. A tool tapped early stays lit while the others dim, and the
hand-off waits for both the choice and the file. A refused download drops the chooser for the button and
the held choice with it. Review caught one change on `/open/`: a second launched file mid-hand-off could
send twice; pinned by a test and guarded. Covered by unit tests only, not yet seen in a real browser
against Google.

