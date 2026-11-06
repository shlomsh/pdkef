---
id: "SEO-55"
title: "Ask for a star rating in a warm dialog after the download, in Redact, Sign, Highlight and Merge"
status: "in_progress"
priority: "P2"
epic: "search-and-languages"
horizon: "next"
---

# SEO-55 · Rating dialog for the four busiest tools

Filed 2026-11-03. SEO-46's inline row under a finished download collected 5 votes (all Redact, all 5 stars) against
the 50 a tool needs before its page may carry stars. Shlomi asked for a friendlier, better-timed ask.

## What

- Redact, Sign, Highlight, Merge and Scan (added 2026-11-06) open a modal `<dialog>` (showModal, so it also shows
  over a fullscreen editor) 1.5 s after the first download or completed share. Every other tool keeps the inline row.
- Five stars send the rating at once, then a thank-you with Share and Star on GitHub.
- One to four stars ask what happened first. Send stays off until there is a real reason (20 characters once trimmed), and the rating and the words go
  together; nothing is sent or remembered as rated if the person leaves.
- Not now, Escape and the backdrop all leave without sending anything. The once-per-14-days device marker still
  applies, so leaving is not nagged about.
- Voice: first person, modest, free and open source, no ask to "help us grow", no commercial framing.

## Done when

- `RatingModal.test.tsx` passes (it was red first).
- Looked at on a phone width and desktop, light and dark, on the dev server.
- After landing, `npm run ratings:read` shows votes arriving beyond Redact.

Print is not an action the telemetry trail records, so the ask follows download and share only.

2026-11-06: a Download tapped before the output finished building was delivered without counting as a download, so
the ask never opened on that path (seen on Scan in a real browser; `useDownloadFlow` now counts both paths).
