# Architecture debt after the module-boundaries epic (review of 2026-09-14)

A read-only architecture review of `main` at `86e5a17`, run the day the module-boundaries epic
(ARCH-15 to ARCH-20, QUAL-05) closed. It is the context and reasoning behind the `architecture-debt`
epic (`backlog/tasks/DEBT-*.md`); the tickets carry only the execution. Everything below tagged
*measured* was produced by running a command on that checkout; *inferred* is an estimate from those
numbers. `docs/module-boundaries.md` is the layout this review judged; `docs/nx-affected-ci.md` is
the CI mechanism.

## What holds up

- The architectural half of the epic is durable: one folder per tool, an empty allowlist, a headless
  core that imports no tool, a boundary checker whose import scan is tested against a TypeScript AST.
  The five rules are the right cut for this codebase.
- `affected-scope.mjs` fails open on every ambiguous path (no base, an `nx` error, an unowned file,
  a missing step output).
- The two-shard product e2e still earns its second runner: 71s of chromium test time per shard on an
  `everything=true` run, which is about 80% of non-docs runs.

## What does not, ranked by consequence

### 1. Nx's import inference decides nothing CI runs

`scripts/affected-scope.mjs` widens to `everything` for any of `{site, shell, editor, editor-ui,
lib}` before consulting a single inferred dependent; tool folders, `site-e2e` and `fonts` are all
resolved by directory ownership plus the hand-written `implicitDependencies` lists; `src/test/` is
always appended. *Measured*: `nx show projects --affected --files=src/editor-ui/ElementToolbar.tsx`
answers `editor-ui, tool-sign, tool-redact, fonts, cross-tool-tests, site-e2e` (correct: nothing else
imports `editor-ui`) and rule 3 discards it. No changed file produces a different CI verdict with
inference on or off, because the checker forbids the edges inference would add. *Measured* cost:
`nx` + `@nx/js` are 227 of 854 lock packages, ~90 MB of 538 MB in `node_modules`, installed by all
five jobs. Either the graph decides (DEBT-06, DEBT-07) or Nx leaves.

### 2. Two tool-owned Playwright specs visit another tool's page

`src/tools/sign/e2e/toolbar-touch-targets.spec.js` drives `/redact` as well as `/sign`;
`src/tools/merge/e2e/merge-handoff.spec.js` ends on `/compress/` and asserts Compress's identity row.
A Redact-only or Compress-only commit narrows past them. Fail-narrow, live today (DEBT-01).

### 3. The cross-tool test placement rule is unenforced and unloaded

"A test importing more than one tool, or a tool from a core folder, goes in `src/test/cross-tool/`"
exists only in `docs/nx-affected-ci.md`. `check-module-boundaries.mjs` skips test files; no
`.claude/rules/*.md` glob matches `src/test/**`. A new `src/editor/**/*.test.tsx` rendering
`PdfSignTool` silently recreates the `editor -> tool-sign` edge that widened every Sign commit to 17
projects during ARCH-20 (DEBT-02, DEBT-11).

### 4. The layout still lies about ownership

*Measured* consumer graph over non-test `src/`:

- `src/editor/workspace/draftStore.js` is consumed by `shell` (`FileDropzone`), `lib`
  (`useHandoffIntake`), Merge (two dynamic imports), Sign and Redact; `useDraftPersistence.js` by
  Merge. The `shell -> editor` edge exists only for this and `CompareSlider -> gestures/controller`.
- `src/editor/adapters/pdf/renderContext.js` is consumed by compress, split, to-image, lib and
  editor-ui: shared pdf.js bootstrap filed under the editor.
- `src/lib/` (28 non-test modules): 11 genuinely multi-consumer; 6 consumed only by Sign+Redact
  (`useCurrentPage`, `useDraggableElement`, `useElementResize`, `useUndoShortcut`, `toolArming`,
  `usePdfCoordinates`); 5 site/build-only (`contentMarkup`, `markdownRender`, `gitLastModified`,
  `cspHash`, `localeOfflinePacks`); 3 with no `src/` consumer (`acceptNegotiation`,
  `fontCoverageReport`, `liveFontCoverage`, used by `scripts/`); `fontCoverageTable.js` editor-only;
  `dropFiles.js` shell-only.
- 7 of the 30 test files in `src/lib/` test `scripts/*.mjs`; `fontCoverage.test.js` (240 tests)
  tests `src/editor/text/fonts.js`.
- `src/editor/registry/types.ts` imports the `SignMessages` type from `src/i18n/`.

So `editor` must stay a core project by fiat and a `markdownRender.js` edit runs 276 Playwright
tests (DEBT-04, DEBT-05).

### 5. The registries are sound but hidden; one is unnecessary

`registerRenderer` and `registerTextElementClassNames` run at module load (`PdfWorkspace.tsx:24-30`,
between import statements; `TextNode.tsx:22-30`). The ordering contract holds by ESM evaluation, but
the dependency is a module-global the call site cannot see. `elementClassNames.ts` exists only so
`registry/text.ts`'s `writeDOM` can `querySelector` hashed CSS Module classes; data attributes remove
the registry entirely. `RedactBox` calls `getElementRenderer` with nothing registered and Redact's
restore accepts all nine element types (`isDraftElement`), so a `text` element under the `redact`
store key now throws inside render where it used to draw Sign's node (DEBT-08, DEBT-09).

### 6. CI wall: the next two cuts

*Measured* on runs 34788031094 and 34787084971: `font-guards` 233s, of which the guard step is 186s
and fixed cost ~45s (QUAL-06 as filed, prefer three shards). `e2e (1)` 167s, of which
`playwright install --with-deps chromium webkit` is 51s on every shard for 21 webkit tests; a
webkit-only job lets the chromium shards install chromium alone (~15s) (QUAL-09). After both,
`checks` at 125-132s (unit suite 63s in CI against 13s locally) is the pole. Not worth it: QUAL-07
(moves billed minutes, not wall, on ~15% of runs), caching webkit's apt half (measured uncacheable),
moving the ~2s of guards out of `checks`. ARCH-21 is low value: the page-to-island edge is invisible
to Nx, and the safe declaration runs what runs today.

### 7. Steady-state narrowing is about one non-docs commit in six

*Measured* by mapping the 200 pre-epic commits' paths onto today's layout: 65 docs-only; 25 narrow
(19 single-tool, 4 fonts, 2 site-e2e); 102 everything, of which 49 are unowned files (`scripts/` in
56 touches, then `package.json`, `vercel.json`, `.github/`, `playwright.config.js`) and 53 core/site
(26 site-only). 25 commits are blocked only by `scripts/`, but 15 of those touch a build input
(`font-manifest.mjs` alone 11 times), so owning `scripts/` needs a hand list to be safe. The epic's
own 40 commits: 0 narrow. QUAL-08 measures the real week; expect it to land near 18%.

### 8. `changedFiles()` drops the old path of a renamed file

`scripts/change-scope.mjs` uses `git diff --name-only`; with git's default rename detection,
*measured* `git diff --name-only 370ace3~1 370ace3 | grep -c src/components/SignTool` is 0 against
37 with `--no-renames`. A pure move between two tools affects only the destination (DEBT-03).

### 9. Guidance and checker gaps

- `.claude/rules/fonts-and-text.md` still says `scripts/change-scope.mjs`'s `FONT_GUARD_INPUTS` is
  the one list and that nothing under `src/tools/sign/` is an input; ARCH-20 deleted the list and
  `e2e/sign/project.json` makes `fonts` depend on `tool-sign` (six of the 27 guard specs drive
  `/sign`). `backlog/tasks/ARCH-21.md` cites `src/lib/useWorkspaceGestures.ts`, which lives in
  `src/tools/sign/`.
- `ruleViolation('editor', 'site', ...)` returns `null`: no rule forbids a core folder importing
  `src/pages/`, `src/layouts/` or `src/styles/`. Latent, no such edge exists.
- `<script src="../shell/homeWorkspace.ts">` in `HomePageLayout.astro` is an import neither checker
  nor Nx sees (DEBT-10).

### 10. Agent ergonomics

`editor.md` loads for `src/tools/**`, `src/shell/**` and `src/lib/**`; 135 of its 202 lines are
Sign/Redact editor rules. An agent in `src/tools/merge/` gets those and not
`docs/ux-design-guidelines.md`; `src/test/**` loads nothing (DEBT-11).

### 11. Ratchets are not applied consistently

`MAX_DUPLICATION_FACTOR` (shipped bytes / distinct bytes) scales with page count by construction and
has been raised three times, against CLAUDE.md's "ratchets only ever go down"; the editor guard's
`EXCEPTIONS` has no stale-entry detection and a "temporary" bridge with no expiry; the box-resize
owner check is an inline grep in `ci.yml` outside `check:fast`; the two import-graph guards carry two
copies of the scanner with different regexes, only one AST-tested (DEBT-12).

### 12. e2e that re-proves jsdom-provable behaviour

*Measured* ratio: 2835 unit to 276 e2e (1:10 only because 137 are font guards; product-only 1:20;
Merge 114:28). `merge-restore.spec.js`'s three tests overlap `useMergeDraft.test.tsx` and
`PdfMergeTool.test.tsx:691` (fake-indexeddb is available); only "close and reopen the tab" is
browser-only. `security/e2e/unlock-reset-confirmation.spec.js` duplicates
`PdfSecurityTool.test.tsx:78` (DEBT-13).

## Verdict

The epic moved the codebase in the right direction: the folders, the empty allowlist and the tested
checker are what an agent feels in the first minute of a session. The CI half is honest engineering
with a mislabelled mechanism: the measured wall gain came from QUAL-05's sharding and the pre-existing
font gate, and Nx narrows ~60-80s on roughly one non-docs commit in six without its inference deciding
anything. The next epic is not ARCH-21; it is the ownership moves plus the `CORE_PROJECTS` shrink
(DEBT-04, DEBT-06, DEBT-07), with the three narrowing fail-safes (DEBT-01, DEBT-02, DEBT-03) landed
first so precision cannot silently lose coverage, and QUAL-06 plus QUAL-09 as the independent wall-time
cuts.
