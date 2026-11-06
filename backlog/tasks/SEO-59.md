---
id: "SEO-59"
title: "The blur video sits on Redact, below the tool"
status: "in_progress"
priority: "P2"
epic: "search-and-languages"
horizon: "now"
---

# SEO-59 · The blur video on Redact

The blur video went public on YouTube on 2026-11-06 (https://youtu.be/6s03GAb_CoI). The blur queries show a Videos
carousel (SEO-04), and YouTube's own page is what fills it. Shlomi's call the same day: no separate watch page, people
would rather watch than read, so `/redact/` goes tool, video, ratings, then the longer text.

## Outcome

- `/redact/` plays the video in place, directly below the tool. The file stays out of the repo and lives on YouTube; the
  page never mentions YouTube, it is Shlomi's video.
- The page loads no Google code and connects to nothing until a person presses play. Pressing play makes the player frame
  from `www.youtube-nocookie.com`, the one origin in that page's `frame-src`, and `test:csp` pins it to `/redact/` alone
  (Shlomi's call, 2026-11-06, a second exception next to `/drive/`).
- The Blur, Blackout or Delete guide mentions it.

## Read

Around 2026-12-04: the Videos carousel on `blur text in pdf`, that query's position and CTR, and YouTube's link clicks.
