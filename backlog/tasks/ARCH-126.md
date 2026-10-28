---
id: "ARCH-126"
title: "The zod pin held by @vercel/cli-config is gone and its exception removed"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
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

- [x] `npm audit` shows no zod finding and the exception is deleted, or it is renewed with a new owner and date before 2026-11-26.

## Done (2026-10-28)

- No release unpinned zod; an npm `overrides` entry (`"zod": "4.6.7"`, Astro's version) replaces the exact pin, so
  `@vercel/cli-config` resolves 4.6.7 deduped and `npm audit` reports nothing (commit 7300e49c, Dependabot 41).
- The exception is deleted from `security/dependency-advisory-exceptions.json`; `check-dependency-advisories.mjs`
  passes on a fresh `npm audit --json`. When `@vercel/cli-config` moves past 4.1.11, the override can go too.
