---
id: "SNG-18"
title: "Opening the practice form keeps fill mode's ?next=1"
status: "in_progress"
priority: "P2"
epic: "sign-next-gen"
phase: "near-term"
depends_on: []
---

# SNG-18 · Opening the practice form keeps fill mode's `?next=1`

*Filed 2026-09-26.* On `/sign/?next=1`, loading the practice form changes the URL and drops `?next=1`,
and changing the URL back drops the file, so the practice form cannot be tried in fill mode (Shlomi, his
iPhone). Find the link or navigation that rewrites the URL and carry the query string through.

## Acceptance

- [ ] Loading the practice form from `/sign/?next=1` stays in fill mode with the file open.
