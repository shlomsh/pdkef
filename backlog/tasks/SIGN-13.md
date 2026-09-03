---
id: "SIGN-13"
title: "Anonymous usage and error maintenance signals"
status: "in_progress"
priority: "P2"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "In progress — privacy-safe telemetry contract assigned 2026-09-03"
---

# SIGN-13 · Anonymous usage and error maintenance signals

## Scope and acceptance

**Anonymous usage and error maintenance signals.** Define a reviewed event allowlist, sanitized error taxonomy, coarse timing buckets, retention, and disclosure. Add privacy tests proving no PDF/text/signature/filename/user or document IDs enter payloads and offline failure has no effect. Prefer stable error codes over raw exception messages. Existing page-view analytics is not sufficient error monitoring.

**Current recommendation (2026-09-03):** define and test the event/privacy contract before
choosing or expanding a transport. Telemetry must be anonymous, allowlisted, coarse, and
best-effort; it must never contain document content or identifiers, and unavailable networking
must not affect editor behavior. Provider, retention, and sampling remain explicit decisions.

**Implementation progress (2026-09-03).** `src/lib/maintenanceTelemetry.ts` now defines the
closed `sign_export` schema: success/failure, four coarse duration buckets, and four stable error
codes. It accepts no arbitrary event properties, serializes no exception values, has an optional
best-effort transport, and refuses to call that transport when the browser reports offline. The
existing Vercel adapter remains isolated; its production page-view hook now removes origins, query
strings, and fragments before a page view is sent. Focused privacy tests cover sensitive PDF/text/
signature/filename/user/document data, error sanitization, offline behavior, and URL sanitization.
Before emitting new custom export events, confirm the provider's aggregate-only configuration,
retention, sampling, and an approved disclosure; do not make tool behavior depend on delivery.
