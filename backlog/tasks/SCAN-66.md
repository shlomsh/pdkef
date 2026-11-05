---
id: "SCAN-66"
title: "Scan: a scan started from the camera says so in the funnel"
status: "in_progress"
priority: "P2"
epic: "scan-next"
horizon: "now"
depends_on: []
---

# SCAN-66 · Scan: a scan started from the camera says so in the funnel

Filed 2026-11-05 from the daily error read.

## What happened

Scan's main way in has no arrival mark. The live viewfinder and "Start scanning" call `addFiles`
directly, past `BasePdfTool`'s `handOn`, so `tool_file_accepted` goes out with no `source` and the page
load lands in the `unknown` lane: 8 of 21 on 2026-11-04, the day of 39 camera photos. Scan's fresh lane
and finished share cannot be read while that lasts.

## Outcome

- `camera` joins `FILE_SOURCES`: the first page of a scan came from the camera, live or the phone's own.
  It reads in the fresh lane and on the "accepted by source" line.
- Only a first page marks. A photo added to a loaded scan is work on it, not an arrival.
- `ANALYTICS.md` lists the new value, with a row in its change log.
