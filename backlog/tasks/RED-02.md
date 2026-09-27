---
id: "RED-02"
title: "Find and redact: search text, review every match, redact all or some"
status: "open"
priority: "P2"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-02 · Find and redact: search text, review every match, redact all or some

*Filed 2026-09-27 from SITE-41's follow-ups.*

Type a word or name, see every match highlighted across pages (Hebrew and other right-to-left text
included), then redact all matches or pick them one by one with the current Blur/Blackout choice.
Optional presets find emails, phone numbers and ID or card numbers.

- Finders are pure functions behind one contract, swappable, with a small corpus and scored tests,
  like Sign's field detection. They propose; the person chooses. Never a "you missed" review.
- Matches come from pdf.js text content positions, mapped through the one page-coordinate transform.

## Acceptance

- Searching a term on a multi-page PDF highlights every match; "Redact all" adds one box per match
  as a single undo step.
- Right-to-left text matches in reading order.
