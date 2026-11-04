---
id: "SCAN-47"
title: "A finished scan goes straight to Highlight, and a PDF from Drive can open in Scan"
status: "done"
priority: "P2"
epic: "scan-next"
depends_on: []
---

# SCAN-47 · Scan's way in from Drive and way out to Highlight

*Asked for on 2026-11-04.* Scan's finish offered Sign, Redact and Compress, so marking up a fresh scan
meant downloading it and opening it again in Highlight. The chooser on `/drive/` and `/open/` listed
four tools and left Scan out, though Scan has taken PDFs since PE-08.

## Scope

- `highlight-pdf` becomes a registry hand-off target, and Scan's finish offers it on the rail and the
  phone table.
- The chooser offers Scan for a PDF that arrives from Drive or from the installed app's Open with.

Save to Drive stays MERGE-26. Choosing a file from inside a tool page is not part of this ticket.

## Acceptance

- A scan handed to Highlight opens there with its pages, on a production build.
- The rail's row stays tidy with Share and four hand-offs, and the phone row fits at 375px and 320px.
- A PDF chosen for Scan on the chooser arrives in Scan.

## Outcome

Landed 2026-11-04. Scan's finish offers Highlight on the rail and the phone table, proved by
`e2e/handoff/scan-handoff.spec.js`. The chooser offers Scan, with its hand-off key covered by a unit test.
