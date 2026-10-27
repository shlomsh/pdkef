# Module boundaries: the layers and the import rules between them

`src/` is cut into layers. This doc names each layer and states the rules for what may import what.
`npm run test:module-boundaries` (`scripts/check-module-boundaries.mjs`) enforces every rule below.
The script classifies each file by an ordered list of path prefixes, so a layer is a folder, and
the folder is the only definition of a boundary.

Related but narrower: [docs/archive/editor-module-boundaries-plan.md](./archive/editor-module-boundaries-plan.md)
drew the boundaries *inside* `src/editor/` (model, geometry, text, registry, workspace, adapters)
and is enforced by `scripts/check-editor-dependency-directions.mjs`. This doc is one level up: the
folders `src/` itself is cut into, and the edges between tools, shell, editor and the site. The two
checkers stay separate; nothing here replaces `test:editor-dependency-directions`.

## Layout

```
src/lib/         the bottom layer: shared logic with no UI layer above it (PDF helpers, drafts,
                 history, fonts data, telemetry, file intake); imports only lib
src/editor/      the headless editor core shared by Sign and Redact: model, geometry, gestures,
                 text, registry, workspace, PDF adapters; imports no editor-ui or shell
src/editor-ui/   Preact pieces that render the editor: ElementResizers, ColorPicker, toolbar menus,
                 page canvas, page header, undo buttons, view control, whiteout/ colour group,
                 hooks/ (shared by Sign and Redact)
src/shell/       the shared tool chrome: BasePdfTool, ToolShell, dialogs, download and share
                 buttons, progress, error message, pageGrid/, pageWorkspace/, verb/; imports no tool
src/tools/<t>/   one folder per tool, holding its island (Pdf*Tool.tsx), messages.ts, components,
                 lib modules, unit tests and e2e specs: compress, edit-pages, image-to-pdf, merge,
                 redact, scan, security, sign, split, to-image
src/site-lib/    helpers and components the site and the build use: FileDropzone, RecentFiles,
                 homeWorkspace, sampleDocument, contentMarkup, markdownRender, cspHash,
                 toolMessageRegistry, precachePolicy (classified as the site)
src/components/  the .astro site components, HeroDemo/, home/, tool-page/ and their css
                 (classified as the site)
src/data/        site data: the tool registry (tools.js), home and static page content
                 (classified as site data)
src/i18n/        site messages and locale helpers (classified as site i18n)
src/pages/       the routes (classified as the site)
src/layouts/     the page layouts (classified as the site)
src/content/     the content collection (classified as the site)
src/styles/      global.css and the per-page-family entry sheets (classified as the site)
src/test/        cross-tool tests, harness and shared test support (classified as test-support)
```

`src/assets/`, `src/content.config.ts` and `src/project.json` sit outside the module graph.
Any other new top-level folder under `src/` fails the check until it gets a row in the script's
classification table.

## Dependency rules

1. A tool may import `shell`, `editor-ui`, `editor`, `lib`, and site's `i18n`/`data`. A tool may
   never import another tool.
2. `shell`, `editor-ui`, `editor` and `lib` may never import a tool, and may never import
   `site` itself (pages/layouts/content/styles and `src/components/`). They may import site's
   `i18n`/`data` (`site-i18n`/`site-data`). `lib` is narrower still: rule 10.
3. `editor` may never import `editor-ui` or `shell`. It is headless; Preact only renders from its
   state and binds events to it.
4. The site (pages, layouts, content, data, i18n, styles, and everything under
   `src/components/`) may reach a tool only through that tool's island entry point, `Pdf*Tool.tsx`
   directly under `src/tools/<name>/`, or its text, `messages.ts` directly under `src/tools/<name>/`
   (ARCH-35: the site's message registry, `src/site-lib/toolMessageRegistry.ts`, picks a tool's
   catalogue without loading its island).
5. This rule is retired (ARCH-48): `src/components/` (the `.astro` components, `inlineStyles.ts`, `HeroDemo/`, the
   `.css` files) is `site`, so rules 1, 2 and 4 already cover it. The number stays so rules 6-11 keep theirs.
6. **A test file may not launder a cross-tool import a real edge in the same location would be
   forbidden from making** (DEBT-02, out of the 2026-09-14 architecture-debt review): a test under
   `shell`, `editor-ui`, `editor` or `lib`, or under one tool's own `src/tools/<name>/` folder, may
   not import another tool's files. `src/test/` (including `src/test/cross-tool/`, the placement
   `docs/nx-affected-ci.md` already asked for) is exempt: a test placed there classifies as
   `test-support`, neither a core module nor a tool, so the rule never reaches it; the same
   `test-support` files may build a harness from any core module but may not import a tool, an edge
   `ruleViolation()` rejects on its own (see "Test support" below). Unlike rules 1-5, which may carry
   `{ from, to, reason }` edge entries in `scripts/module-boundaries-allowlist.json` (none today),
   rule 6 has no allowlist - it holds at zero violations, not a ratchet down from today's count.
7. **A `*.spec.js` under `src/tools/<t>/e2e/` may only reference that tool's own routes, plus `/`.**
   The tool -> routes map is derived, never hand-written: a top-level `src/pages/<slug>.astro` that
   imports `../tools/<t>/Pdf*Tool` maps route `/<slug>` to tool folder `<t>` (so `/compress/` and
   `/compress-image/` both belong to `compress`, `/unlock/` to `security`, `/pdf-to-image/` to
   `to-image`, `/organize-pdf/` to `edit-pages`). A route may appear as a string literal, a template
   literal, or inside a regex literal, with or without a trailing slash and optionally behind a
   locale prefix (`/he/redact`); comments are stripped first, so a route named only in prose never
   counts. A spec that genuinely needs another tool's page - `e2e/tool-toolbars/toolbar-touch-targets.spec.js` driving
   both `/sign` and `/redact`, `e2e/handoff/merge-handoff.spec.js` ending on `/compress/` - belongs under `e2e/`
   instead of a tool's own `e2e/` folder (DEBT-01).
8. **Nothing under `src/`, `public/` or `e2e/` may import from `scripts/`** (ARCH-22). A script is
   dev-only real estate: CI checkers, build-time generators, content research tooling, none of it
   ships. App source depending on it would mean the shipped app depends on files a build never
   bundles, and a script could be deleted or rewritten without a single product test noticing. Like
   rule 6, this holds at zero violations with no allowlist, and deliberately covers test files too -
   a checker's own unit test (e.g. `scripts/check-editor-dependency-directions.test.mjs`) lives
   beside the script it tests, in `scripts/`, never under `src/test/`. Rules 1-7 only
   ever needed to walk `src/`; rule 8's own pass (`scriptsImportViolations()`) also walks `public/`
   and `e2e/`, since either could gain a real edge into `scripts/` that a `src/`-only walk would miss.
9. **A module in a common layer (`shell`, `editor-ui`, `editor`, `lib`) needs two or more distinct consumers,
   or it does not belong in a common layer** (ARCH-25). Plainly: "common" means used by two.
   `editor` is in scope (ARCH-46): a module only one tool imports moves under that tool, into
   `src/tools/<tool>/lib/`. The one exemption is an explicit `src/editor/<tool>-adapters/` folder,
   for a single-tool module that other `src/editor/` code imports (the editor never imports a
   tool, so it cannot move under one); the folder name states the intent, so rule 9 does not
   count it. A consumer is a tool (`src/tools/<name>/` - one identity per tool, no
   matter how many of its own files import the module) **or the site, counted once** (ARCH-26): a
   page, a layout, an `.astro` component, an `i18n`/`data` module, a `src/site-lib/` helper, and a
   file a layout loads via `<script src>` all credit one single "site" identity, the same way a tool
   is one identity no matter how many of its own files import the module - a page and the layout it
   renders through are two different files, but one consumer, not two. A consumer reached only
   through a chain of other common-layer modules still counts, credited to whichever tool or the
   site the chain eventually reaches: a `lib` module used only by another `lib` module that two
   tools both import is fine, and the same holds when the chain passes through `editor` or
   `editor-ui` on its way to a tool - the walk keeps going through those layers even though `editor`
   files are never themselves checked. A module one tool uses lives in that tool's folder instead; a
   module nothing uses is deleted. `SignatureDialog.tsx` (now `src/tools/sign/components/SignatureDialog.tsx`) was the one module ARCH-25 genuinely
   miscategorized, moved into `src/tools/sign/` in the same change that added this rule, alongside
   `useCoarsePointer.ts` (moved from `src/editor-ui/hooks/` into `src/tools/sign/`, its only real
   consumer). ARCH-26 then found the landed rule counted each site file as its own consumer, so a
   module reached only through a layout's `<script src>` passed with `{layout, page}` credited as
   two real uses when it was one; the fix credits a fixed `SITE_CONSUMER` identity for every
   site-classified node instead of the node's own path, and moved the shell modules that reading
   now correctly flagged as site-only (`FileDropzone.tsx`, `homeWorkspace.ts`, `RecentFiles.tsx`,
   `sampleDocument.ts`) into `src/site-lib/`. Enforced by `commonLayerConsumerViolations()`, with no
   ratcheting allowlist (like rules 6 and 8) beyond `{ rule: 9, file, reason }` entries in
   `scripts/module-boundaries-allowlist.json` (the same file as the rule 1-5 edge entries, which are empty today) for `src/editor/` files only tests, generators or e2e
   guards read (ARCH-46; a stale entry fails, `*.test-helper.js` is never counted): it holds at zero
   violations, so a module that fails it moves into the tool that actually uses it, or is deleted if
   nothing does. RED-51 (2026-10-01) gave Redact its own box toolbar, so `ElementToolbar`, the font
   and thickness pickers (`FontPickerMenu`, `FontOptionsList`, `FontSheet`, `ThicknessPickerMenu`)
   and `useCoarsePointer` moved into `src/tools/sign/` and `BlurStrengthSlider` into
   `src/tools/redact/`, by this rule. ARCH-37 (2026-10-26) moved `useCoarsePointer` back into `src/editor-ui/hooks/` once Sign and Redact both used one meaning of it. An `.astro` file's `<script src="...">` is invisible to the main
   edge scan below, so this rule reads it separately, in `astroScriptSrcEdges()`, solely to answer whether the site
   consumes a given module.
10. **`lib` is the bottom layer: it may not import `editor`, `editor-ui`, `shell`, `i18n` or `data`** (ARCH-34). Rule 2 already bars `lib` from a tool and `site` itself (`src/components/` included), so together the two leave `lib` importing only `lib`. A `src/lib/` module that imports one of those five fails `test:module-boundaries` (zero violations, no allowlist); text and colour helpers that needed `editor/text` live in `src/editor/text/` instead.
11. **The site never imports the editor core** (ARCH-43): a page, layout, `.astro` component, `i18n`/`data`
    module or `src/site-lib/` helper never imports `src/editor/`, so the headless core is not a public
    API for build-time site code. Data the editor and the site both read lives in `src/lib/`: the font
    manifest and license tables (`src/lib/fonts/fontManifest.ts`, `fontLicenses.ts`) moved there from
    `src/editor/text/`, read by the editor, `precachePolicy.js` and `licenses.astro` alike. Zero
    violations, no allowlist. (`fontLicenses.ts` has the site as its only consumer, so it carries a rule 9
    allowlist entry: the editor-side tests that guard it are not consumers.)

**Test support.** `src/test/` (cross-tool included) classifies as `test-support`, a module of its own
that is not in the numbered list. The script enforces one edge for it, in `ruleViolation()`: a
`test-support` file may not import a tool. It may import every core module and the site. This is
what keeps a harness from reaching into one tool's internals; rule 6 covers the other test locations.

`scripts/check-module-boundaries.mjs` enforces exactly these eleven rules; its exported `RULES` list
and this section are checked against each other by `scripts/check-module-boundaries.doc.test.mjs`
(a rule renamed or added on one side fails the test); the classification table in the
script is data (an ordered list of path prefixes), so adding or moving a layer is "add or edit one row,"
never "teach the script a new rule." Rule 7 is a separate pass (`toolSpecRouteViolations()`,
`specRouteViolation()`) rather than an edge in the same import graph, since it scans spec text for
route mentions instead of import specifiers; rule 8 is likewise separate (`scriptsImportViolations()`,
`scriptsImportViolation()`), since it walks `public/` and `e2e/` in addition to `src/`; rule 9 is also
separate (`commonLayerConsumerViolations()`, `commonLayerConsumers()`), since it asks a different
question - how many consumers reach a module - than an edge-by-edge legality check.

**Folders are the only definition of a boundary (DEBT-14, 2026-09-24).** There is no ESLint
`@nx/enforce-module-boundaries` mirror and no Nx project tags: ESLint cannot see `.astro` files or
`<script src>` consumers and cannot express rules 6, 8 or 9, so tags would be a second copy of every
boundary kept in sync by hand. The checker runs in about 2s at the top of `check:fast`.

**DEBT-04:** `src/editor/registry/types.ts` used to import the `SignMessages` type from
the former `toolMessages.ts` (since split into each tool's own `messages.ts`, e.g. `src/tools/sign/messages.ts`) - an `editor -> site-i18n` edge that no rule above covered at the time, so `check-module-boundaries.mjs` never flagged it even though it made the headless core
depend on the site's message shape. The interface now lives in `src/editor/registry/messages.ts`;
`i18n` imports and re-exports it, so the editor imports nothing from `i18n`.

The ARCH-15 evidence, per-file move tables, consumer tables, hardcoded-path list, sequence and ratchet proof live on as an archived snapshot: [archive/module-boundaries-arch15-snapshot.md](./archive/module-boundaries-arch15-snapshot.md). It is not current.
