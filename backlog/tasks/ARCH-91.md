---
id: "ARCH-91"
title: "The runtime-scope zod alert has an override or an owned, expiring exception"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "now"
order: 12
depends_on: []
---

# ARCH-91 · The runtime-scope zod alert has an override or an owned, expiring exception

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Supporting. Criterion: Dependency hygiene. Structure only: no behaviour change.

## Why

- Alert #41 (high, zod below 4.6.6) reaches production through `@vercel/functions` 3.10.3, `@vercel/oidc` and `@vercel/cli-config`, used only by `middleware.ts:25` on the server. It has neither an override nor an entry in `security/dependency-advisory-exceptions.json`.

## Outcome

- A zod override to a patched version, or an exception with owner, expiry and the server-only reachability reason.

## Acceptance

- [ ] The alert is closed or listed as an owned exception; the advisory script passes.
