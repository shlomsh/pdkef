---
id: "RED-10"
title: "Sign's Whiteout removes what it covers, through the same engine"
status: "open"
priority: "P2"
epic: "redact-tool"
phase: "near-term"
depends_on: ["RED-09"]
---

# RED-10 · Sign's Whiteout removes what it covers, through the same engine

*Filed 2026-09-27 from RED-01's record, [docs/redact-content-removal.md](../../docs/redact-content-removal.md).*

Sign's Whiteout today paints over content that stays in the file. Route it through the RED-07 engine
and the RED-09 check, so what Sign hides is gone too.

## Acceptance

- Text under a Sign Whiteout can't be extracted from the signed file, and nothing else on the page
  changes.
