---
id: "MEM-38"
title: "A failed chunk import reloads the page once, after saving drafts"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: []
---

# MEM-38 · A failed chunk import reloads the page once, after saving drafts

*Filed 2026-11-11*, asked by Shlomi before MEM-37's bundling lands.

## Why

A tab opened before a deploy and not yet controlled by the worker asks the network for its build's chunks.
After the deploy, a chunk whose name or hash changed is gone, and the lazy import fails: today one dialog
reports `chunk_load` and nothing recovers, so the feature just stops working. Every deploy already does
this to changed `/_astro/` files; MEM-37 renames most of the JS once, so the window widens for that deploy.

## What

On a failed dynamic import (Vite's `vite:preloadError`, plus an unhandled rejection carrying a browser's
dynamic-import failure message), the page reloads once to pick up the current build, after the draft
flush the update reload already uses (`flushBeforeUpdateReload`). It does not reload while an update hold
says a reload would lose work (`isUpdateHeld()`): it reports instead. At most one such reload per tab in a
short window, so a chunk that is really missing cannot loop. Each reload is reported once.

## Done when

- [ ] Unit tests: reload after a failed import, no reload while held, no second reload inside the window,
      the flush awaited first, non-import errors ignored.
- [ ] Landed before MEM-37's bundling.
