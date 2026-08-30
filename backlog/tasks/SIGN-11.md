---
id: "SIGN-11"
title: "Versioned, validated shared persistence"
status: "open"
priority: "P2"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Open — scoped plan ready"
---

# SIGN-11 · Versioned, validated shared persistence

## Scope and acceptance

**Versioned, validated shared persistence.** `draftStore`, saved signatures/preferences: choose the local user boundary, validate records on read, migrate schema versions, and coordinate same-user tabs with revisions and explicit conflict handling. Store source PDF bytes once per document, not on every edit. Test corrupt/older records, concurrent tabs, deletion, and unavailable storage. No account/backend requirement is implied. **The validate-on-restore + schema-version + migrate slice has a written implementation plan, not yet executed:** [docs/sign-redact-draft-validation-plan.md](./docs/sign-redact-draft-validation-plan.md) (design + exact files/tests/verification for a pickup agent). Multi-tab coordination, saved-signature/preference versioning, and PDF-byte dedup storage remain unscoped beyond this doc.
