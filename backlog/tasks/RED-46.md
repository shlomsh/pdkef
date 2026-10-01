---
id: "RED-46"
title: "The Redact page speaks the tool's words, without losing what people search for"
status: "in_progress"
priority: "P2"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-46 · The Redact page speaks the tool's words, without losing what people search for

The /redact/ page still says "flatten" and "text layer", which the tool dropped (RED-37). Some of these may be search terms people actually use, so this starts with the evidence: which terms carry queries (docs/seo-competitive-findings.md, GSC data Shlomi shares), which are only jargon, and where each appears (title, h1, description, how-it-works, FAQ and its JSON-LD).

## Acceptance
- A findings section in this ticket: every term, where it appears, query evidence, and a proposed rewrite.
- Shlomi picks; the copy change follows with test:seo and test:csp green.
