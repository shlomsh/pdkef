---
id: "ENC-15"
title: "The digest's definitions and the scheduled-task prompt say what the new columns mean"
status: "open"
priority: "P3"
epic: "robustness"
horizon: "next"
order: 9
depends_on: ["ENC-14"]
---

# ENC-15 · The digest's definitions and the scheduled-task prompt say what the new columns mean

*Plan section 6, decision 6 (Shlomi: yes, I edit it).* The definitions live only in the scheduled-task prompt, `~/.claude/scheduled-tasks/pdkef-daily-error-read/SKILL.md`, outside the repo.

## Brief
- Write the definitions (accepted includes files that stopped at the gate; needed unlock is not a failure; returned; `failed` no longer includes a protected file; an `EncryptedPDFError` report after the gate ships is a detector miss and a P1) into the prompt and into the digest output's header lines.
- Remove the known-item note for the Redact `EncryptedPDFError` once ENC-05 has shipped.

## Acceptance
- The next daily read prints the definitions and groups an `EncryptedPDFError` as a gate miss.
