---
id: "ARCH-126"
title: "The zod pin held by @vercel/cli-config is gone and its exception removed"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
depends_on: []
---

# ARCH-126 · The zod pin held by @vercel/cli-config is gone and its exception removed

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding V2.
Area: Supporting. Criterion: Dependency hygiene. Structure only: no behaviour change.

## Why

- `security/dependency-advisory-exceptions.json` carries an owned exception for zod 4.1.11, pinned exactly by `@vercel/cli-config`; 4 high alerts stay open and it expires 2026-11-26.

## Outcome

- `@vercel/functions` and `@vercel/cli-config` upgraded once a release unpins zod; the exception removed.

## Acceptance

- [ ] `npm audit` shows no zod finding and the exception is deleted, or it is renewed with a new owner and date before 2026-11-26.
