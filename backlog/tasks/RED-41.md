---
id: "RED-41"
title: "The box toolbar says Duplicate and Delete, in Sign and Redact"
status: "done"
priority: "P3"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-41 · The box toolbar says Duplicate and Delete, in Sign and Redact

The shared box toolbar titles its buttons "Duplicate element" and "Delete element". "Element" is not a word the tools use (RED-37 glossary). Both tools say "Duplicate" and "Delete".

## Acceptance
- Titles and accessible names are "Duplicate" and "Delete" in both tools, every locale string updated.
- Specs locate the buttons inside the box toolbar so Redact's Delete tool never matches.

## Result

`toolMessages.ts` says Duplicate and Delete; unit tests and every spec locator updated and scoped with `exact: true`, including two Sign specs grep found. (619877da)
