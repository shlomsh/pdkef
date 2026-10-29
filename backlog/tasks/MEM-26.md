---
id: "MEM-26"
title: "A CSS Module edit renames its own CSS chunk, not 25 JavaScript chunks"
status: "in_progress"
priority: "P1"
horizon: "now"
epic: "robustness"
depends_on: []
---

# MEM-26 · A CSS Module edit renames its own CSS chunk, not 25 JavaScript chunks

*Filed 2026-10-28* from the update-cost nightly going red on ordinary deploys (MEM-21).

## Why

- 42923db to 1b72a77 changed only `src/shell/PdfTool.module.css` (12 lines). Built at one path with the
  MEM-21 CSP pruning on both sides, the update cost is 1,343,675 bytes (brotli q5): 25 new hashed chunks,
  led by `/_astro/sign.*.js` at 301,156 bytes, plus `PdfSignTool.js` and `PdfRedactTool.js`.
- Five of the last eight output-changing deploys on main read 1.34 to 1.35 MB the same way
  (423116c..b1a2ae4, 85cdfbc..42923db, 42923db..1b72a77, 686e27e..25b2fe4; b1a2ae4..4d72498 at 568 KB).
  MEM-25 made a shared JS module rename only its own chunk; a CSS Module change still cascades.
- The update-cost job is report-only until this lands (`continue-on-error` in `ci.yml`, pinned by
  `scripts/ci-update-cost.test.mjs`).

## Outcome

- Editing one CSS Module renames the CSS chunk that holds it and at most the one JS chunk that imports
  it, not their importers.

## Acceptance

- [x] A unit or build test that edits one CSS Module between two builds and counts the renamed chunks.
- [x] 42923db to 1b72a77 rebuilt with the fix reads under 500,000 bytes, or the remainder is named.
- [ ] `continue-on-error` and its pin test come out of the update-cost job, and the next nightly is green. of the update-cost job, and the next nightly is green.

## Done (2026-10-29)

- **Cause, two mechanisms** (42923db to 1b72a77, both built at one path): Vite's default CSS Module
  class name is `_<class>_<hash of the module's whole CSS>_<line>`, so the 12-line edit renamed every
  class in `PdfTool.module.css`, which changed `useHandoffIntake.*.js` (it holds the class map), and its
  25 importers renamed. Separately, a CSS file name is part of its chunk's hash (Vite augments it) and of
  every preload list that names it, so the CSS rename alone renamed its chunk, `registry`, `PageGrid`,
  `useDraftPersistence` and `useLazyPageGrid`. With stable class names only, the fixture still renamed
  the chunk owning the CSS and the chunk preloading it. All 25 renamed chunks differed only in hashed
  names except `useHandoffIntake.*.js` (class names) and the CSS itself.
- **Fix** (`scripts/stableNames.mjs`, wired in `astro.config.mjs`): `cssModuleClassName` hashes the
  module's path relative to the repo root (`_<class>_<6 hex>`, so `[class*="_rail_"]` selectors still
  match), and CSS files are `/shared/<chunk name>-<hash of the CSS module paths it holds>.css`, recorded
  by the `pdkef:css-asset-keys` plugin just before Vite emits each chunk's CSS. Prerender names its CSS
  the same way, because Astro drops a client stylesheet when a page inlined one of the same file name and
  inlines both when they differ. Two designs were measured and dropped: client-only stable names kept 8
  already-inlined sheets alive as duplicate preloads and orphans; plain `<name>.css` in both put 186
  duplicate rules (42 KB raw) on `/redact/` and failed `test:css`. Keyed by module set, the names match
  exactly when the two hold the same modules, which is the pairing Astro itself uses between SSR and
  prerender. Two chunks with one name and different CSS fail the build loudly rather than get suffixes
  whose order could swap.
- **Replay** of 42923db to 1b72a77 with the fix on both sides, still inlining every sheet: 1,343,672 to
  787,290 bytes, 0 new hashed chunks, no `/_astro/` or `/site/` file changed; the one code file that
  changed is `/shared/useHandoffIntake-326da5.css` (5,230). Before: 399,517 new-hashed and about 161 KB
  of changed `/site/` entries. The rest was 21 tool pages (760,296) that differed only in their inline
  `<style>` and its CSP hash, `/about/` 10,357 (build stamp), the manifest 5,877 and `sw.js` 5,530.
- **With MEM-27's `'auto'`** the pair read 37,701 bytes (and 1b72a77 to 686e27e 32,468), but that change
  was reverted the same day (see MEM-27), so main reads the 787,290 above until MEM-27 lands.
- **Behaviour kept:** the same 3 client stylesheets as before, and `/redact/`'s inline CSS is rule for
  rule the old build's. Every class inside island markup (161) is in the client JS, so server render and
  hydration name classes alike.
- **Tests:** `scripts/stableNames.build.test.mjs` builds a fixture twice with the real client config and
  edits one CSS Module; red before the fix (2 chunks and the CSS renamed, both islands changed), green
  after (only `shared/panel-<key>.css` changes). `test:stable-names` now also fails on a hashed CSS file
  in `/_astro/` or `/shared/`, and on any CSS Module class a page's code can render with no rule on that
  page (classes holding only `composes` emit no CSS and are skipped); seen red by stripping one class's
  rules from `/merge/`. The class shape lives once, as `CSS_MODULE_CLASS`, which `check-css-duplication.js`
  now reads (its old `_name_hash_line` pattern counted every module class as a dead utility).
- **Review** (fresh reviewer, on the first design): prerender assets that survive are moved into the client
  folder over a same-named file (`ssrMoveAssets`), and same-named chunks get order-dependent suffixes; the
  module-keyed names close both, since a shared name now means the same modules. The class-rule guard
  counts a rule found in any stylesheet the page can load, even a lazy one, so it proves presence on the
  page, not load order.
- **Nightly:** still report-only. `continue-on-error` came out with MEM-27 and went back in with its
  revert; it comes out when MEM-27 lands again. The deploy that shipped this renamed every class once,
  so that night's reading is high. This ticket closes with that acceptance item.
