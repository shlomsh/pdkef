---
id: "MEM-36"
title: "Pinned notes are baked into the page at build, not fetched per visit"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
depends_on: []
---

# MEM-36 · Pinned notes are baked into the page at build, not fetched per visit

*Filed 2026-11-11*, step 3 of [docs/request-budget.md](../../docs/request-budget.md) (D8).

## Why

Every page view with the notes island asks `/api/notes`: one CDN request and one function call per visit,
for words that change only when Shlomi approves a note.

## What

The build reads the notes with the read-only store token (`KV_REST_API_READ_ONLY_TOKEN`, present in
Vercel's production env) and renders them into the page; with no token (local, CI) the build renders none
and does not fail. The island stops fetching.

## Done when

- [ ] No `/api/notes` request on any page load; notes render from the build.
- [ ] Unit tests for the build-time read and the no-token path.
