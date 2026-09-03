---
id: "SIGN-26"
title: "Establish dependency vulnerability and update governance"
status: "open"
priority: "P2"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Open — no automated dependency security/update workflow found 2026-09-03"
---

# SIGN-26 · Establish dependency vulnerability and update governance

## Scope and acceptance

**Dependency versions are locked and CI-tested, but no Dependabot/Renovate configuration,
dependency-review job, scheduled advisory scan, or documented update cadence exists.** This matters
most for the PDF parsers/renderers and browser-facing build stack: updates can carry security fixes,
but an unreviewed upgrade can also change exported-PDF bytes, text extraction, CSP output, offline
assets, or platform baselines. A one-time audit is not a maintenance process, and a permanently hard
`npm audit` gate without reviewed exceptions is likely to become noise.

Choose one automated update service and a scheduled advisory source supported by the repository.
Group low-risk build-tool patches separately from PDF/runtime packages, keep the lockfile
reproducible, and require the existing unit, type, CSP, CSS, page-weight, offline, language, and
export-render gates appropriate to the changed package. Document triage ownership, update cadence,
time-bound exceptions, and how advisories are evaluated when no fixed release exists. Coordinate
the shipped-package classification with SIGN-25, but do not conflate license approval with security
severity. Acceptance includes a dry-run or first generated update proving the workflow works without
weakening platform-specific render checks.
