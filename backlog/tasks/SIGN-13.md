---
id: "SIGN-13"
title: "Anonymous usage and error maintenance signals"
status: "done"
priority: "P2"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Done — 2026-09-04; sampled, allowlisted maintenance telemetry"
---

# SIGN-13 · Anonymous usage and error maintenance signals

## Scope and acceptance

**Anonymous usage and error maintenance signals.** Define a reviewed event allowlist, sanitized error taxonomy, coarse timing buckets, retention, and disclosure. Add privacy tests proving no PDF/text/signature/filename/user or document IDs enter payloads and offline failure has no effect. Prefer stable error codes over raw exception messages. Existing page-view analytics is not sufficient error monitoring.

**Current recommendation (2026-09-03):** define and test the event/privacy contract before
choosing or expanding a transport. Telemetry must be anonymous, allowlisted, coarse, and
best-effort; it must never contain document content or identifiers, and unavailable networking
must not affect editor behavior. Provider, retention, and sampling remain explicit decisions.

**Done (2026-09-04).** `src/lib/maintenanceTelemetry.ts` defines the
closed `sign_export` schema: success/failure, four coarse duration buckets, and four stable error
codes. It accepts no arbitrary event properties, serializes no exception values, has an optional
best-effort transport, and refuses to call that transport when the browser reports offline. The
existing Vercel adapter remains isolated; its production page-view hook now removes origins, query
strings, and fragments before a page view is sent. Focused privacy tests cover sensitive PDF/text/
signature/filename/user/document data, error sanitization, offline behavior, and URL sanitization.

Sign exports now send that reviewed event only in production, through Vercel Web Analytics, and only
for a 10% random sample. Sampling creates no visitor or document identifier; an unavailable/offline
transport has no product effect and queues nothing. The provider decision, reporting-window retention,
no-drains policy, allowlist, and disclosure live in
[`docs/maintenance-telemetry.md`](../../docs/maintenance-telemetry.md). Re-review that record before
adding an event or a field.
