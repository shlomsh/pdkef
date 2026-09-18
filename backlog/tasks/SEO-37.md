---
id: "SEO-37"
title: "Show the proof on every tool page: the airplane-mode line beyond Sign and Redact, and a never-say guard in CI"
status: "open"
priority: "P2"
epic: "english-base"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# SEO-37 · Show the proof on every tool page: the airplane-mode line beyond Sign and Redact, and a never-say guard in CI

*Split out of [SEO-36](SEO-36.md) on 2026-09-19* so that ticket could close with the copy that shipped.

## Why

The findings doc's section 2 (LOC-15 lesson): the on-device claim is copyable in words and has been
copied natively in four languages; only the demonstrable behaviour is not. SEO-36 unified the words.
The proof, "Turn on airplane mode and give it a try. It still works.", renders on Sign and Redact only
(`src/layouts/ToolPageLayout.astro`, tied there to the `OfflineProof` live status line). Eight tool
pages never show it.

Separately, SEO-36 found seven "never say" strings by read-through ("100%" seven times, "Secure",
"client-side", "guaranteeing", "instantly", "Free Forever"). The list in the findings doc's section 7
is prose; nothing stops the next one.

## Scope

1. **Airplane-mode line on every tool page.** Before extending it, confirm the claim holds for each
   tool: which assets the service worker precaches per tool (`scripts/generate-precache-manifest.mjs`,
   `public/sw.js`) and whether a first visit to, say, `/split/` can export with the connection off, or
   only after the tool has been used once. If the honest wording differs per tool, say the honest
   thing (the Redact FAQ's "install PDkef and let its required assets load while connected" is the
   model), or keep the line where it is true and state why in the layout comment. Hebrew and
   Indonesian strings for `airplaneModeNotice` already exist in `documentationMessages.ts`.
2. **Never-say guard.** A `check:*` script in the `check:fast` chain that greps `src/data/tools.js`,
   `src/data/homeContent.js`, `src/content/**/*.yaml` and `src/i18n/*Messages.ts` (English values)
   for the section 7 list plus the intensifiers SEO-36 removed, with an allowlist for legitimate uses
   ("100 KB" targets, "secure" as Unlock's verb in `gridDescription` if kept, the Sign FAQ's
   "unlike Chinese"). The list lives in the script next to a pointer to section 7, and section 7
   points back.

## Acceptance

- Every tool page states the offline proof once, in words that are true for that tool on a first
  visit, or the layout comment says which tools are excluded and why.
- `npm run check:fast` fails on a new "100% secure" in any English copy field, and the allowlist is
  short enough to read.
- No new URL, no title or h1 change; if a subhead changes, the Hebrew editions' `sourceHash` follows
  the SEO-33 procedure.
